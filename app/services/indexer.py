from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.db import (
    Media,
    SUPPORTED_IMAGE_EXTS,
    SUPPORTED_VIDEO_EXTS,
    resolve_media_source,
)
from app.services.fs_providers import is_smb_url, parse_smb_url
from app.services.credentials import get_smb_password

from smbprotocol.connection import Connection  # type: ignore
from smbprotocol.session import Session  # type: ignore
from smbprotocol.tree import TreeConnect  # type: ignore
from smbprotocol.open import (  # type: ignore
    Open,
    CreateDisposition,
    CreateOptions,
    ShareAccess,
    FilePipePrinterAccessMask,
    ImpersonationLevel,
)
from smbprotocol.file_info import FileInformationClass  # type: ignore
import uuid


def _classify_media_type(name: str) -> Optional[str]:
    ext = os.path.splitext(name)[1].lower()
    if ext in SUPPORTED_IMAGE_EXTS:
        return "image"
    if ext in SUPPORTED_VIDEO_EXTS:
        return "video"
    return None


def scan_into_db(
    db: Session,
    root_url: str,
    *,
    source_id: Optional[int] = None,
    limit: Optional[int] = None,
) -> int:
    """统一扫描实现（本地与远端路径一致处理）。

    - 通过 ro_fs_for_url() 打开只读 FS，遍历可识别的媒体文件。
    - local: 将相对路径拼入传入的本地绝对根路径，写入 absolute_path。
    - smb: 使用规范 URL（root_url + 相对路径）写入 absolute_path。
    - 以 absolute_path 去重。
    - 返回本轮新增条目数；尊重 limit。
    """

    existing = {path for (path,) in db.query(Media.absolute_path)}
    added = 0

    # 解析/创建来源记录
    source_type = "smb" if is_smb_url(root_url) else "local"
    source = resolve_media_source(
        db,
        root_url,
        source_id=source_id,
        type_=source_type,
    )
    resolved_source_id = source.id if source else source_id

    # 计算 local 绝对根（用于拼装 absolute_path）
    local_root_abs: Optional[str] = None
    if source_type == "local":
        local_root_abs = str(Path(root_url).expanduser().resolve())

    if source_type == "smb":
        # 使用 smbprotocol 可靠遍历 SMB2/3
        parts = parse_smb_url(root_url)
        host = parts.host
        share = parts.share
        sub = (parts.path or "").strip("/\\")
        username = parts.username or ""
        password = get_smb_password(host, share, username) or ""

        conn = Connection(uuid.uuid4(), host, parts.port or 445)
        conn.connect()
        try:
            sess = Session(conn, username=username, password=password)
            sess.connect()
            try:
                tree = TreeConnect(sess, f"\\\\{host}\\{share}")
                tree.connect()
                try:
                    base = sub.replace('/', '\\') if sub else ""
                    # BFS 目录
                    from collections import deque
                    q = deque([""])
                    while q:
                        rel_dir = q.popleft()
                        dir_path = base
                        if rel_dir:
                            dir_path = (base + ("\\" if base else "") + rel_dir.replace('/', '\\'))
                        h = Open(tree, dir_path)
                        h.create(ImpersonationLevel.Impersonation,
                                 FilePipePrinterAccessMask.GENERIC_READ,
                                 0,
                                 ShareAccess.FILE_SHARE_READ,
                                 CreateDisposition.FILE_OPEN,
                                 CreateOptions.FILE_DIRECTORY_FILE)
                        try:
                            entries = h.query_directory('*', FileInformationClass.FILE_DIRECTORY_INFORMATION)
                            for e in entries:
                                raw = e['file_name']
                                b = raw.get_value() if hasattr(raw, 'get_value') else (raw if isinstance(raw, (bytes, bytearray)) else None)
                                name = (b.decode('utf-16-le').rstrip('\x00') if isinstance(b, (bytes, bytearray)) else str(raw))
                                if name in ('.', '..') or name.startswith('.'):
                                    continue
                                attrs_field = e['file_attributes']
                                attrs_val = int(getattr(attrs_field, 'value', attrs_field))
                                is_dir = bool(attrs_val & 0x10)
                                child_rel = name if not rel_dir else rel_dir + '/' + name
                                if is_dir:
                                    q.append(child_rel)
                                else:
                                    mtype = _classify_media_type(name)
                                    if not mtype:
                                        continue
                                    abs_path = f"{root_url.rstrip('/')}/{child_rel}"
                                    if abs_path in existing:
                                        continue
                                    db.add(Media(
                                        filename=name,
                                        absolute_path=abs_path,
                                        media_type=mtype,
                                        source_id=resolved_source_id,
                                    ))
                                    existing.add(abs_path)
                                    added += 1
                                    if limit is not None and added >= limit:
                                        break
                            if limit is not None and added >= limit:
                                break
                        finally:
                            h.close()
                    # end while
                finally:
                    tree.disconnect()
            finally:
                sess.disconnect()
        finally:
            conn.disconnect(True)
    else:
        # Local 仍使用 OS FS 遍历
        root_abs = Path(local_root_abs or root_url).expanduser().resolve()
        for root, _dirs, files in os.walk(root_abs):
            for name in files:
                mtype = _classify_media_type(name)
                if not mtype:
                    continue
                abs_path = str(Path(root) / name)
                if abs_path in existing:
                    continue
                db.add(Media(
                    filename=name,
                    absolute_path=abs_path,
                    media_type=mtype,
                    source_id=resolved_source_id,
                ))
                existing.add(abs_path)
                added += 1
                if limit is not None and added >= limit:
                    break
            if limit is not None and added >= limit:
                break

    # 回写来源状态/时间戳
    if source is not None:
        source.last_scan_at = datetime.utcnow()
        if getattr(source, "status", "active") != "active":
            source.status = "active"
            source.deleted_at = None

    db.commit()
    return added
