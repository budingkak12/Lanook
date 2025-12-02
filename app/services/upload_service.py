from __future__ import annotations

import hashlib
import json
import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import UploadFile

from app.schemas.upload import (
    ChunkRequest,
    ChunkStatusResponse,
    FinishRequest,
    InitUploadRequest,
    InitUploadResponse,
    UploadErrorCode,
)
from app.services.incoming_dir import ensure_incoming_dir
from app.db import SessionLocal
from app.services.scan_service import scan_source_once


class UploadNotFound(Exception):
    """Raised when an upload session cannot be located."""

    def __init__(self, upload_id: str):
        super().__init__(f"upload not found: {upload_id}")
        self.upload_id = upload_id
        self.code = UploadErrorCode.UPLOAD_NOT_FOUND


class ChunkOutOfRange(Exception):
    """Raised when a chunk index is invalid for the current upload."""

    def __init__(self, index: int):
        super().__init__(f"chunk index out of range: {index}")
        self.index = index
        self.code = UploadErrorCode.CHUNK_OUT_OF_RANGE


class DuplicateFinish(Exception):
    """Raised when finish is called multiple times."""

    def __init__(self, upload_id: str):
        super().__init__(f"upload already finished: {upload_id}")
        self.upload_id = upload_id
        self.code = UploadErrorCode.DUPLICATE_FINISH


class ChecksumMismatch(Exception):
    """Raised when checksum validation fails."""

    def __init__(self, expected: str, actual: str):
        super().__init__(f"checksum mismatch: expected {expected}, got {actual}")
        self.expected = expected
        self.actual = actual
        self.code = UploadErrorCode.INVALID_CHECKSUM


class SizeMismatch(Exception):
    """Raised when merged file size is incorrect."""

    def __init__(self, expected: int, actual: int):
        super().__init__(f"size mismatch: expected {expected}, got {actual}")
        self.expected = expected
        self.actual = actual
        self.code = UploadErrorCode.SIZE_MISMATCH


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


class UploadService:
    """Handle chunked uploads and landing to incoming directory."""

    def __init__(self, incoming_dir: Optional[Path] = None, tmp_root: Optional[Path] = None):
        self.incoming_dir = incoming_dir or ensure_incoming_dir()
        default_tmp = self.incoming_dir.parent / ".tmp_uploads"
        self.tmp_root = Path(tmp_root) if tmp_root else default_tmp
        self.tmp_root.mkdir(parents=True, exist_ok=True)

    # ---------- metadata helpers ----------
    def _session_dir(self, upload_id: str) -> Path:
        return self.tmp_root / upload_id

    def _meta_path(self, upload_id: str) -> Path:
        return self._session_dir(upload_id) / "meta.json"

    def _load_meta(self, upload_id: str) -> dict:
        path = self._meta_path(upload_id)
        if not path.exists():
            raise UploadNotFound(upload_id)
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _save_meta(self, upload_id: str, meta: dict) -> None:
        session_dir = self._session_dir(upload_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        path = self._meta_path(upload_id)
        with path.open("w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

    # ---------- public APIs ----------
    def init_upload(self, req: InitUploadRequest) -> InitUploadResponse:
        upload_id = uuid.uuid4().hex
        meta = {
            "upload_id": upload_id,
            "filename": req.filename,
            "total_size": req.total_size,
            "chunk_size": req.chunk_size,
            "checksum": req.checksum,
            "device_id": req.device_id or "unknown",
            "mime_type": req.mime_type,
            "relative_path": req.relative_path,
            "modified_at": req.modified_at,
            "finished": False,
            "state": "uploading",
        }
        self._save_meta(upload_id, meta)
        return InitUploadResponse(
            upload_id=upload_id,
            existed=False,
            received_chunks=[],
            chunk_size=req.chunk_size,
        )

    def get_status(self, upload_id: str) -> ChunkStatusResponse:
        meta = self._load_meta(upload_id)
        received = sorted([p for p in self._list_chunks(upload_id)])
        return ChunkStatusResponse(
            upload_id=upload_id,
            received_chunks=received,
            total_size=meta.get("total_size"),
            chunk_size=meta.get("chunk_size"),
        )

    async def save_chunk(self, req: ChunkRequest, file: UploadFile) -> None:
        meta = self._load_meta(req.upload_id)
        state = meta.get("state") or ("finished" if meta.get("finished") else "uploading")
        if state == "finished":
            raise DuplicateFinish(req.upload_id)
        if req.index < 0:
            raise ChunkOutOfRange(req.index)

        total_size = meta.get("total_size")
        chunk_size = meta.get("chunk_size")
        if total_size and chunk_size:
            expected_chunks = (total_size + chunk_size - 1) // chunk_size
            if req.index >= expected_chunks:
                raise ChunkOutOfRange(req.index)

        # 写入临时分块
        session_dir = self._session_dir(req.upload_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        chunk_path = session_dir / f"chunk_{req.index}"
        with chunk_path.open("wb") as out:
            while True:
                data = await file.read(1024 * 1024)
                if not data:
                    break
                out.write(data)

        # 校验分块大小（若传了 chunk_size）
        chunk_size_meta = meta.get("chunk_size")
        if chunk_size_meta and chunk_path.stat().st_size > chunk_size_meta:
            raise ChunkOutOfRange(req.index)

    def finish_upload(self, req: FinishRequest) -> Path:
        meta = self._load_meta(req.upload_id)
        if meta.get("finished"):
            raise DuplicateFinish(req.upload_id)

        received = sorted(self._list_chunks(req.upload_id))
        if not received or len(received) != req.total_chunks:
            missing = set(range(req.total_chunks)) - set(received)
            raise ChunkOutOfRange(min(missing) if missing else req.total_chunks)

        session_dir = self._session_dir(req.upload_id)
        merged_path = session_dir / "merged.tmp"

        with self._acquire_finish_lock(session_dir):
            if meta.get("finished"):
                raise DuplicateFinish(req.upload_id)

            with merged_path.open("wb") as merged:
                for idx in range(req.total_chunks):
                    chunk_path = session_dir / f"chunk_{idx}"
                    with chunk_path.open("rb") as chunk_file:
                        merged.write(chunk_file.read())

        # 尺寸校验
        actual_size = merged_path.stat().st_size
        if meta["total_size"] and actual_size != meta["total_size"]:
            raise SizeMismatch(meta["total_size"], actual_size)

        # 校验哈希（如果提供）
        expected_checksum = req.checksum or meta.get("checksum")
        if expected_checksum:
            actual_checksum = _sha256_file(merged_path)
            if actual_checksum.lower() != expected_checksum.lower():
                raise ChecksumMismatch(expected_checksum, actual_checksum)

        final_path = self._resolve_final_path(meta["device_id"], meta["filename"], meta.get("relative_path"))
        final_path.parent.mkdir(parents=True, exist_ok=True)
        merged_path.replace(final_path)

        # 写回修改时间（如果客户端提供毫秒时间戳）
        modified_at = meta.get("modified_at")
        if modified_at:
            try:
                ts_sec = modified_at / 1000.0
                os.utime(final_path, (ts_sec, ts_sec))
            except Exception:
                pass

        meta["finished"] = True
        meta["finished_at"] = datetime.now(timezone.utc).isoformat()
        meta["state"] = "finished"
        self._save_meta(req.upload_id, meta)

        if not req.skip_scan:
            self._trigger_scan(final_path)

        self._cleanup_session(session_dir)
        return final_path

    # ---------- internal helpers ----------
    def _list_chunks(self, upload_id: str) -> List[int]:
        session_dir = self._session_dir(upload_id)
        if not session_dir.exists():
            return []
        result = []
        for path in session_dir.glob("chunk_*"):
            try:
                idx = int(path.name.split("_")[1])
                result.append(idx)
            except Exception:
                continue
        return result

    def _resolve_final_path(self, device_id: str, filename: str, relative_path: Optional[str]) -> Path:
        today = datetime.now().strftime("%Y%m%d")
        if relative_path:
            safe_parts = [p for p in Path(relative_path).parts if p not in {"..", ".", ""}]
            rel_path = Path(*safe_parts)
        else:
            rel_path = Path(filename)
        return self.incoming_dir / device_id / today / rel_path

    @contextmanager
    def _acquire_finish_lock(self, session_dir: Path):
        session_dir.mkdir(parents=True, exist_ok=True)
        lock_path = session_dir / ".finish.lock"
        fd = None
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            yield
        except FileExistsError:
            raise DuplicateFinish(session_dir.name)
        finally:
            if fd is not None:
                os.close(fd)
            if lock_path.exists():
                try:
                    lock_path.unlink()
                except Exception:
                    pass

    def _cleanup_session(self, session_dir: Path):
        # 删除临时块与合并文件，保留 meta 以支持幂等/追踪
        try:
            for item in session_dir.iterdir():
                if item.name == "meta.json":
                    continue
                try:
                    item.unlink()
                except IsADirectoryError:
                    pass
        except Exception:
            # 清理失败不影响主流程
            pass

    def cleanup_expired_sessions(self, ttl_hours: int = 24) -> int:
        """清理超时或已完成的上传会话临时文件，返回清理数量。"""
        now = datetime.now(timezone.utc)
        deadline = now - timedelta(hours=ttl_hours)
        removed = 0
        for session_dir in self.tmp_root.glob("*"):
            if not session_dir.is_dir():
                continue
            meta_path = session_dir / "meta.json"
            finished = False
            finished_at = None
            try:
                if meta_path.exists():
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    finished = bool(meta.get("finished"))
                    fa = meta.get("finished_at")
                    if fa:
                        finished_at = datetime.fromisoformat(fa)
                mtime = datetime.fromtimestamp(session_dir.stat().st_mtime, tz=timezone.utc)
            except Exception:
                # 无法解析则按超时处理
                mtime = datetime.fromtimestamp(session_dir.stat().st_mtime, tz=timezone.utc)

            expired = finished or mtime < deadline or (finished_at and finished_at < deadline)
            if expired:
                for item in session_dir.iterdir():
                    try:
                        if item.is_file():
                            item.unlink()
                    except Exception:
                        pass
                try:
                    session_dir.rmdir()
                    removed += 1
                except Exception:
                    # 留给下次清理
                    pass
        return removed

    def _trigger_scan(self, final_path: Path):
        # 直接对落盘目录执行一次扫描，limit=1 提高速度
        parent_dir = str(final_path.parent)
        with SessionLocal() as session:
            try:
                scan_source_once(session, parent_dir, limit=1)
                session.commit()
            except Exception:
                session.rollback()
                # 失败不阻断上传成功，只打印即可（由上层日志处理）
                print(f"[upload] scan skipped due to error for {parent_dir}")
