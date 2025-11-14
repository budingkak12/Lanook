from __future__ import annotations

import asyncio
import os
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator, Optional, Set

from sqlalchemy.orm import Session

from app.db import Media, SUPPORTED_IMAGE_EXTS, SUPPORTED_VIDEO_EXTS, resolve_media_source
from app.db.models_extra import MediaSource
from app.services.credentials import get_smb_password
from app.services.fs_providers import is_smb_url, parse_smb_url

from smbprotocol.connection import Connection  # type: ignore
from smbprotocol.open import (  # type: ignore
    CreateDisposition,
    CreateOptions,
    FilePipePrinterAccessMask,
    ImpersonationLevel,
    Open,
    ShareAccess,
)
from smbprotocol.session import Session as SMBSession  # type: ignore
from smbprotocol.tree import TreeConnect  # type: ignore
from smbprotocol.file_info import FileInformationClass  # type: ignore

__all__ = [
    "MediaEntry",
    "MountedSource",
    "SourceAccessLayer",
    "classify_media_type",
    "detect_source_type",
]


def classify_media_type(name: str) -> Optional[str]:
    ext = os.path.splitext(name)[1].lower()
    if ext in SUPPORTED_IMAGE_EXTS:
        return "image"
    if ext in SUPPORTED_VIDEO_EXTS:
        return "video"
    return None


def detect_source_type(target: str) -> str:
    return "smb" if is_smb_url(target) else "local"


@dataclass
class MediaEntry:
    filename: str
    absolute_path: str
    media_type: str
    relative_path: Optional[str] = None


@dataclass
class MountedSource:
    source: MediaSource
    root_url: str
    source_type: str
    local_root: Optional[Path]

    def iter_media(self) -> Iterator[MediaEntry]:
        if self.source_type == "smb":
            yield from _iter_smb_media(self.root_url)
        else:
            assert self.local_root is not None
            yield from _iter_local_media(self.local_root)

    def diff(self, existing_paths: Set[str], *, limit: Optional[int] = None) -> Iterator[MediaEntry]:
        count = 0
        for entry in self.iter_media():
            if entry.absolute_path in existing_paths:
                continue
            yield entry
            existing_paths.add(entry.absolute_path)
            count += 1
            if limit is not None and count >= limit:
                break


class SourceAccessLayer:
    def __init__(self, db: Session) -> None:
        self.db = db

    def mount(self, root_url: str, *, source_id: Optional[int] = None) -> MountedSource:
        source_type = detect_source_type(root_url)
        source = resolve_media_source(self.db, root_url, source_id=source_id, type_=source_type)
        local_root: Optional[Path] = None
        normalized = root_url
        if source_type == "local":
            local_root = Path(root_url).expanduser().resolve()
            normalized = str(local_root)
        return MountedSource(source=source, root_url=normalized, source_type=source_type, local_root=local_root)

    async def mount_async(self, root_url: str, *, source_id: Optional[int] = None) -> MountedSource:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: self.mount(root_url, source_id=source_id))

    def begin_scan(self, mounted: MountedSource) -> None:
        self._mark_scan_started(mounted.source)

    def complete_scan(self, mounted: MountedSource) -> None:
        self._mark_scan_succeeded(mounted.source)

    def _mark_scan_started(self, source: MediaSource) -> None:
        now = datetime.utcnow()
        source.last_scan_started_at = now
        source.last_error = None
        if source.failure_count is None:
            source.failure_count = 0
        self.db.flush()

    def _mark_scan_succeeded(self, source: MediaSource) -> None:
        now = datetime.utcnow()
        source.last_scan_finished_at = now
        source.last_scan_at = now
        source.last_error = None
        source.failure_count = 0
        if source.status != "active":
            source.status = "active"
            source.deleted_at = None

    def fail_and_persist(self, mounted: Optional[MountedSource], error: Exception | str) -> None:
        if mounted is None:
            return
        source = (
            self.db.query(MediaSource)
            .filter(MediaSource.id == mounted.source.id)
            .first()
        )
        if source is None:
            source = (
                self.db.query(MediaSource)
                .filter(MediaSource.root_path == mounted.source.root_path)
                .first()
            )
        if source is None:
            source = resolve_media_source(
                self.db,
                mounted.source.root_path,
                source_id=None,
                type_=mounted.source_type,
            )
        now = datetime.utcnow()
        source.last_scan_finished_at = now
        source.last_error = str(error)
        current = source.failure_count or 0
        source.failure_count = current + 1
        self.db.commit()

    def ingest_local_file(self, file_path: str, *, source_id: Optional[int] = None, root_hint: Optional[str] = None) -> bool:
        media_type = classify_media_type(file_path)
        if not media_type:
            return False
        abs_path = str(Path(file_path).expanduser().resolve())
        exists = self.db.query(Media).filter(Media.absolute_path == abs_path).first()
        if exists:
            return False
        resolved_source_id = source_id
        source: Optional[MediaSource] = None
        if resolved_source_id is None:
            hint = root_hint or str(Path(abs_path).parent)
            source = resolve_media_source(self.db, hint, source_id=None, type_="local")
            resolved_source_id = source.id if source else None
        self.db.add(Media(
            filename=Path(abs_path).name,
            absolute_path=abs_path,
            media_type=media_type,
            source_id=resolved_source_id,
        ))
        return True


def _iter_local_media(root: Path) -> Iterator[MediaEntry]:
    root_abs = root.expanduser().resolve()
    for current_root, _dirs, files in os.walk(root_abs):
        for name in files:
            media_type = classify_media_type(name)
            if not media_type:
                continue
            abs_path = str(Path(current_root) / name)
            yield MediaEntry(filename=name, absolute_path=abs_path, media_type=media_type, relative_path=os.path.relpath(abs_path, root_abs))


def _iter_smb_media(root_url: str) -> Iterator[MediaEntry]:
    parts = parse_smb_url(root_url)
    password = get_smb_password(parts.host, parts.share, parts.username) or ""
    conn = Connection(uuid.uuid4(), parts.host, parts.port or 445)
    conn.connect()
    try:
        sess = SMBSession(conn, username=parts.username or "", password=password)
        sess.connect()
        try:
            tree = TreeConnect(sess, f"\\\\{parts.host}\\{parts.share}")
            tree.connect()
            try:
                base = (parts.path or "").replace("/", "\\").strip("\\")
                from collections import deque

                queue = deque([""])
                while queue:
                    rel_dir = queue.popleft()
                    dir_path = base
                    if rel_dir:
                        dir_path = (base + ("\\" if base else "") + rel_dir.replace("/", "\\")) if base else rel_dir.replace("/", "\\")
                    handle = Open(tree, dir_path)
                    handle.create(
                        ImpersonationLevel.Impersonation,
                        FilePipePrinterAccessMask.GENERIC_READ,
                        0,
                        ShareAccess.FILE_SHARE_READ,
                        CreateDisposition.FILE_OPEN,
                        CreateOptions.FILE_DIRECTORY_FILE,
                    )
                    try:
                        entries = handle.query_directory("*", FileInformationClass.FILE_DIRECTORY_INFORMATION)
                        for entry in entries:
                            raw_name = entry["file_name"]
                            bname = raw_name.get_value() if hasattr(raw_name, "get_value") else raw_name
                            if isinstance(bname, (bytes, bytearray)):
                                name = bname.decode("utf-16-le").rstrip("\x00")
                            else:
                                name = str(bname)
                            if name in {".", ".."} or name.startswith('.'):
                                continue
                            attrs = entry["file_attributes"]
                            attr_val = int(getattr(attrs, "value", attrs))
                            is_dir = bool(attr_val & 0x10)
                            child_rel = name if not rel_dir else f"{rel_dir}/{name}"
                            if is_dir:
                                queue.append(child_rel)
                                continue
                            media_type = classify_media_type(name)
                            if not media_type:
                                continue
                            abs_path = f"{root_url.rstrip('/')}/{child_rel}".replace("//", "/")
                            yield MediaEntry(filename=name, absolute_path=abs_path, media_type=media_type, relative_path=child_rel)
                    finally:
                        handle.close()
            finally:
                tree.disconnect()
        finally:
            sess.disconnect()
    finally:
        conn.disconnect(True)
