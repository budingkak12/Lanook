from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Iterable, List, Tuple

from sqlalchemy.orm import Session

# 直接复用初始化脚本中的 ORM 模型
from app.db import Media
from app.db.models import FaceCluster, FaceEmbedding
from app.db.models_extra import AssetArtifact, ClipEmbedding, FaceProcessingState, MediaCacheState
from app.services.asset_handlers.common import ARTIFACTS_ROOT
from app.services.fs_providers import is_smb_url


THUMBNAILS_DIR = Path(__file__).resolve().parents[2] / "thumbnails"


@dataclass
class FailedItem:
    id: int
    reason: str


def _safe_unlink(path: Path) -> bool:
    try:
        if path.exists():
            path.unlink()
        return True
    except Exception:
        return False


def _safe_unlink_glob(parent: Path, pattern: str) -> bool:
    ok = True
    try:
        if not parent.exists():
            return True
        for p in parent.glob(pattern):
            ok = _safe_unlink(p) and ok
        return ok
    except Exception:
        return False


def _thumb_path_for_media(media: Media) -> Path:
    # 基于内容指纹命名；若缺失则回退到旧 id 命名
    if media.absolute_path:
        try:
            from app.services.fs_service import compute_fingerprint

            fp = compute_fingerprint(Path(media.absolute_path))
            bucket = fp[:2]
            return THUMBNAILS_DIR / "fs" / bucket / f"{fp}.jpg"
        except Exception:
            pass
    return THUMBNAILS_DIR / f"{media.id}.jpg"


def delete_media_record_and_files(
    db: Session, media: Media, *, delete_file: bool = True
) -> Tuple[bool, str | None]:
    """
    硬删除单个媒体：数据库记录（含关联表） + 派生文件；可选删除原文件。

    返回 (success, reason)
    - success=True 表示记录已不可见（DB 已删除或记录不存在）。
    - 当返回 success=True 但 reason 非空，表示出现非致命问题（例如原文件删除失败）。
    """
    reason: str | None = None

    # 提前保留路径，避免 db.delete 后访问关系属性
    abs_path = media.absolute_path if isinstance(media.absolute_path, str) else None
    is_remote = bool(abs_path) and is_smb_url(abs_path or "")
    thumb_path = _thumb_path_for_media(media)
    legacy_thumb_path = THUMBNAILS_DIR / f"{media.id}.jpg"

    # 记录当前媒体关联的人脸 embedding id，用于清理 FaceCluster.representative_* 指针
    try:
        face_ids = [row[0] for row in db.query(FaceEmbedding.id).filter(FaceEmbedding.media_id == media.id).all()]
    except Exception as e:  # pragma: no cover
        db.rollback()
        return False, f"db_query_failed:{type(e).__name__}"

    # --- 先清理强关联表（避免外键/残留） ---
    try:
        # 清理人脸聚类代表指针（否则 cluster 可能引用被删除的 face/media）
        if face_ids:
            (
                db.query(FaceCluster)
                .filter(FaceCluster.representative_face_id.in_(face_ids))  # type: ignore[arg-type]
                .update({FaceCluster.representative_face_id: None}, synchronize_session=False)
            )
        (
            db.query(FaceCluster)
            .filter(FaceCluster.representative_media_id == media.id)
            .update({FaceCluster.representative_media_id: None}, synchronize_session=False)
        )

        # AI/索引相关表
        db.query(ClipEmbedding).filter(ClipEmbedding.media_id == media.id).delete(synchronize_session=False)
        db.query(FaceProcessingState).filter(FaceProcessingState.media_id == media.id).delete(synchronize_session=False)

        # 缓存行（media_service 里也会 purge，这里做成幂等）
        db.query(MediaCacheState).filter(MediaCacheState.media_id == media.id).delete(synchronize_session=False)

        # 资产处理记录：同时尝试删除 record.file_path 指向的文件
        artifact_rows = db.query(AssetArtifact).filter(AssetArtifact.media_id == media.id).all()
        artifact_paths: list[Path] = []
        for row in artifact_rows:
            if row.file_path and isinstance(row.file_path, str):
                artifact_paths.append(Path(row.file_path))
        if artifact_rows:
            db.query(AssetArtifact).filter(AssetArtifact.media_id == media.id).delete(synchronize_session=False)

        db.flush()
    except Exception as e:  # pragma: no cover
        db.rollback()
        return False, f"db_cleanup_failed:{type(e).__name__}"

    # 删除 DB 记录（包含 Tag 关联，依赖 ORM 级联）
    try:
        db.delete(media)
        db.flush()  # 先 flush，失败可回滚并上抛
    except Exception as e:  # pragma: no cover - 异常路径
        db.rollback()
        return False, f"db_delete_failed:{type(e).__name__}"

    # --- 派生文件（若存在） ---
    # 缩略图文件（新路径 + 旧路径）
    try:
        if not _safe_unlink(thumb_path):
            reason = (reason or "") + " thumb_remove_failed"
        if legacy_thumb_path != thumb_path and not _safe_unlink(legacy_thumb_path):
            reason = (reason or "") + " legacy_thumb_remove_failed"
    except Exception:
        # 非致命：保留 warning 理由
        reason = (reason or "") + " thumb_remove_failed"

    # artifacts/ 下的确定性派生物（metadata/transcode/placeholder）
    try:
        if not _safe_unlink(ARTIFACTS_ROOT / "metadata" / f"{media.id}.json"):
            reason = (reason or "") + " metadata_remove_failed"
        transcodes_dir = ARTIFACTS_ROOT / "transcodes"
        if not _safe_unlink_glob(transcodes_dir, f"{media.id}.*"):
            reason = (reason or "") + " transcode_remove_failed"
        if not _safe_unlink(ARTIFACTS_ROOT / "placeholders" / f"{media.id}.jpg"):
            reason = (reason or "") + " placeholder_remove_failed"
    except Exception:
        reason = (reason or "") + " artifacts_remove_failed"

    # AssetArtifact.file_path 指向的文件（若落在本地）
    try:
        for p in artifact_paths:
            # 避免误删 repo 外的任意文件：仅允许 artifacts/ 或 thumbnails/ 下的路径
            try:
                resolved = p.expanduser().resolve()
            except Exception:
                continue
            allowed_roots = [
                ARTIFACTS_ROOT.resolve(),
                THUMBNAILS_DIR.resolve(),
            ]
            if not any(str(resolved).startswith(str(root) + os.sep) or str(resolved) == str(root) for root in allowed_roots):
                continue
            if not _safe_unlink(resolved):
                reason = (reason or "") + " artifact_file_remove_failed"
    except Exception:
        reason = (reason or "") + " artifact_file_remove_failed"

    # 原文件
    if delete_file and abs_path:
        try:
            if is_remote:
                # 当前实现不对 SMB 源做远端删除（读取层默认只读），避免误报失败。
                reason = (reason or "") + " remote_file_not_deleted"
            else:
                p = Path(abs_path)
                if p.exists():
                    p.unlink()
        except Exception:
            # 非致命：记录 warning，DB 已删除，接口仍视为成功
            reason = (reason or "") + " file_remove_failed"

    return True, reason.strip() if reason else None


def batch_delete(
    db: Session, ids: Iterable[int], *, delete_file: bool = True
) -> Tuple[List[int], List[FailedItem]]:
    """批量删除，返回 (deleted_ids, failed_items)。

    约定：
    - 不存在的 id 视为已删除（幂等），计入 deleted。
    - DB 删除失败计入 failed；单个失败不影响其他项继续处理。
    - 原文件/缩略图删除失败不算 failed（DB 已删不可见），但客户端可根据需要扩展 warning 字段。
    """
    deleted: List[int] = []
    failed: List[FailedItem] = []

    # 为减少往返，先一次性取出存在的记录并做映射
    id_list = list({int(i) for i in ids})
    if not id_list:
        return deleted, failed

    existing = (
        db.query(Media)
        .filter(Media.id.in_(id_list))  # type: ignore[arg-type]
        .all()
    )
    exist_map = {m.id: m for m in existing}

    for mid in id_list:
        m = exist_map.get(mid)
        if not m:
            # 幂等：记录不存在视为已删
            deleted.append(mid)
            continue
        ok, reason = delete_media_record_and_files(db, m, delete_file=delete_file)
        if ok:
            deleted.append(mid)
        else:
            failed.append(FailedItem(id=mid, reason=reason or "unknown"))

    # 批量提交（若前面个别项回滚，该项已在 failed）
    try:
        db.commit()
    except Exception as e:  # pragma: no cover - 罕见
        db.rollback()
        # 保守处理：标记所有已标记为删除的 id 为失败
        failed.extend(FailedItem(id=i, reason=f"commit_failed:{type(e).__name__}") for i in deleted)
        deleted.clear()

    return deleted, failed
