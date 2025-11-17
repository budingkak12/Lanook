from __future__ import annotations

import uuid
from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import ContextManager, Generator, Iterable, Optional, Tuple
from urllib.parse import unquote, urlparse

from fastapi import HTTPException
from fs import open_fs
from fs.base import FS
from fs.wrap import read_only
from smbprotocol.connection import Connection  # type: ignore
from smbprotocol.file_info import FileAttributes, FileInformationClass  # type: ignore
from smbprotocol.open import (  # type: ignore
    CreateDisposition,
    CreateOptions,
    FilePipePrinterAccessMask,
    ImpersonationLevel,
    Open,
    ShareAccess,
)
from smbprotocol.session import Session  # type: ignore
from smbprotocol.tree import TreeConnect  # type: ignore

from app.schemas.sources import SourceType, SourceValidateRequest, SourceValidateResponse
from app.services.credentials import clear_smb_password, get_smb_password, store_smb_password
from app.services.sources.registry import ProviderCapability, register_provider


@dataclass
class SMBParts:
    host: str
    share: str
    path: str
    username: Optional[str]
    domain: Optional[str]
    port: Optional[int]


def parse_smb_url(url: str) -> SMBParts:
    p = urlparse(url)
    if p.scheme.lower() != "smb":
        raise ValueError("not an smb url")
    username = None
    domain = None
    host = p.hostname or ""
    port = p.port
    if p.username:
        raw_user = unquote(p.username)
        if ";" in raw_user:
            domain, username = raw_user.split(";", 1)
        else:
            username = raw_user
    share_and_path = (p.path or "/").lstrip("/")
    parts = share_and_path.split("/", 1)
    share = parts[0]
    subpath = parts[1] if len(parts) > 1 else ""
    return SMBParts(host=host, share=share, path=subpath, username=username, domain=domain, port=port)


class SMBFSProvider:
    name = "smb"
    priority = 100
    display_name = "SMB 共享"
    protocols = ("smb",)
    requires_credentials = True
    supports_anonymous = True
    credential_fields = (
        {"key": "host", "label": "设备地址", "required": True},
        {"key": "share", "label": "共享名", "required": True},
        {"key": "username", "label": "用户名", "required": False},
        {"key": "password", "label": "密码", "required": False, "secret": True},
        {"key": "domain", "label": "域", "required": False},
    )

    def can_handle(self, url: str) -> bool:
        try:
            p = urlparse(url)
            return p.scheme.lower() == "smb"
        except Exception:
            return False

    @contextmanager
    def ro_fs(self, url: str) -> Generator[Tuple[FS, str], None, None]:
        parts = parse_smb_url(url)
        password = get_smb_password(parts.host, parts.share, parts.username)
        userinfo = f"{parts.username}@" if parts.username else ""
        netloc = f"{userinfo}{parts.host}"
        base_url = f"smb://{netloc}/{parts.share}"
        q = f"?hostname={parts.host}&port=445&direct-tcp=true"
        if parts.username and password:
            fs_url = f"smb://{parts.username}:{password}@{parts.host}/{parts.share}{q}"
        else:
            fs_url = base_url + q
        fs = read_only(open_fs(fs_url))
        try:
            yield fs, parts.path
        finally:
            fs.close()

    def read_bytes(self, url: str, max_bytes: Optional[int] = None) -> bytes:
        parts = parse_smb_url(url)
        conn, sess, tree, file = _smb_open_for_read(parts)
        try:
            total = int(file.end_of_file or 0)
            if max_bytes is not None:
                total = min(total, max_bytes)
            pos = 0
            chunks: list[bytes] = []
            chunk_size = 1024 * 1024
            while pos < total:
                n = min(chunk_size, total - pos)
                data = file.read(pos, n)
                if not data:
                    break
                chunks.append(data)
                pos += len(data)
            return b"".join(chunks)
        finally:
            _smb_close(conn, sess, tree, file)

    def iter_bytes(
        self,
        url: str,
        start: int = 0,
        length: Optional[int] = None,
        chunk_size: int = 1024 * 1024,
    ) -> Iterable[bytes]:
        parts = parse_smb_url(url)
        conn, sess, tree, file = _smb_open_for_read(parts)
        try:
            size = int(file.end_of_file or 0)
            if start < 0:
                start = 0
            if start >= size:
                return
            end = size - 1 if length is None else min(start + length - 1, size - 1)
            pos = start
            while pos <= end:
                n = min(chunk_size, end - pos + 1)
                data = file.read(pos, n)
                if not data:
                    break
                yield data
                pos += len(data)
        finally:
            _smb_close(conn, sess, tree, file)

    def stat(self, url: str) -> Tuple[int, int]:
        parts = parse_smb_url(url)
        conn, sess, tree, file = _smb_open_for_read(parts)
        try:
            size = int(file.end_of_file or 0)
            try:
                mtime = int(file.last_write_time.timestamp())
            except Exception:
                mtime = 0
            return mtime, size
        finally:
            _smb_close(conn, sess, tree, file)

    def describe(self) -> ProviderCapability:
        return ProviderCapability(
            name=self.name,
            display_name=self.display_name,
            protocols=self.protocols,
            requires_credentials=self.requires_credentials,
            supports_anonymous=self.supports_anonymous,
            can_validate=True,
            credential_fields=[dict(field) for field in self.credential_fields],
        )

    def validate(self, payload: SourceValidateRequest) -> SourceValidateResponse:
        if payload.type != SourceType.SMB:
            raise HTTPException(status_code=422, detail="来源类型不匹配")
        if not payload.host or not payload.share:
            raise HTTPException(status_code=422, detail="host/share required")
        host = _normalize_host_input(payload.host)
        username = (payload.username or "") if not payload.anonymous else ""
        password = (payload.password or "") if not payload.anonymous else ""
        try:
            conn = Connection(uuid.uuid4(), host, payload.port or 445)
            conn.connect()
            sess = Session(conn, username=username, password=password)
            sess.connect()
            tree = TreeConnect(sess, f"\\\\{host}\\{payload.share}")
            tree.connect()

            sub = (payload.subPath or "").strip("/\\")
            dir_path = sub.replace('/', '\\') if sub else ""
            handle = Open(tree, dir_path)
            handle.create(
                ImpersonationLevel.Impersonation,
                FilePipePrinterAccessMask.GENERIC_READ,
                0,
                ShareAccess.FILE_SHARE_READ,
                CreateDisposition.FILE_OPEN,
                CreateOptions.FILE_DIRECTORY_FILE,
            )

            exts = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv"}
            total = 0
            samples: list[str] = []
            max_dirs = 50
            max_files = 2000
            visited = 0
            queue = deque([""])
            while queue and visited < max_dirs and total < max_files and len(samples) < 10:
                rel = queue.popleft()
                visited += 1
                cur_path = (dir_path + ('\\' if dir_path and rel else '') + rel) if rel else dir_path
                cur = Open(tree, cur_path)
                cur.create(
                    ImpersonationLevel.Impersonation,
                    FilePipePrinterAccessMask.GENERIC_READ,
                    0,
                    ShareAccess.FILE_SHARE_READ,
                    CreateDisposition.FILE_OPEN,
                    CreateOptions.FILE_DIRECTORY_FILE,
                )
                try:
                    entries = cur.query_directory('*', FileInformationClass.FILE_DIRECTORY_INFORMATION)
                    for entry in entries:
                        raw = entry['file_name']
                        if hasattr(raw, 'get_value'):
                            b = raw.get_value()
                            try:
                                name = b.decode('utf-16-le').rstrip('\x00')
                            except Exception:
                                name = ''.join(chr(x) for x in b if x > 0)
                        else:
                            name = str(raw)
                        if name in ('.', '..'):
                            continue
                        attrs_field = entry['file_attributes']
                        attrs_val = int(getattr(attrs_field, 'value', attrs_field))
                        is_dir = bool(attrs_val & 0x10)
                        child_rel = name if not rel else rel + '/' + name
                        if is_dir:
                            if len(queue) < max_dirs:
                                queue.append(child_rel)
                        else:
                            if Path(name).suffix.lower() in exts:
                                total += 1
                                if len(samples) < 10:
                                    samples.append(f"smb://{host}/{payload.share}/" + (sub + '/' if sub else '') + child_rel)
                            else:
                                total += 1
                            if total >= max_files:
                                break
                finally:
                    cur.close()

            handle.close()
            tree.disconnect()
            sess.disconnect()
            conn.disconnect(True)

            return SourceValidateResponse(
                ok=True,
                readable=True,
                absPath=f"smb://{host}/{payload.share}/" + sub,
                estimatedCount=total,
                samples=samples,
                note="只读验证通过，不会写入或删除此目录下文件",
            )
        except HTTPException:
            raise
        except Exception as exc:  # pragma: no cover - 网络异常依环境而异
            msg = str(exc)
            if 'STATUS_LOGON_FAILURE' in msg or 'Authentication' in msg or 'access' in msg.lower():
                raise HTTPException(status_code=403, detail="认证失败，请检查用户名和密码")
            if 'timed out' in msg or 'No route to host' in msg or 'not known' in msg or 'unreachable' in msg:
                raise HTTPException(status_code=404, detail="无法连接到设备，请检查地址")
            raise HTTPException(status_code=500, detail=f"连接失败：{msg}")

    def save_credentials(self, payload: dict[str, str | None]) -> None:
        username = payload.get("username")
        password = payload.get("password")
        host = payload.get("host")
        share = payload.get("share")
        if host and share and username and password:
            store_smb_password(host, share, username, password)

    def clear_credentials(self, identifier: str) -> None:
        try:
            parts = parse_smb_url(identifier)
        except Exception:
            return
        clear_smb_password(parts.host, parts.share, parts.username)


def _normalize_host_input(host: str | None) -> str:
    from urllib.parse import urlparse

    if host is None:
        return ""

    s = str(host).strip()
    if not s:
        return ""
    if (s.startswith("'") and s.endswith("'")) or (s.startswith('"') and s.endswith('"')):
        s = s[1:-1].strip()
    if s.startswith("(") and s.endswith(")"):
        import ast

        try:
            tup = ast.literal_eval(s)
            if isinstance(tup, (list, tuple)) and tup:
                s = str(tup[0]).strip()
        except Exception:
            pass
    if '://' in s:
        try:
            parsed = urlparse(s)
        except Exception:
            parsed = None
        if parsed and parsed.scheme:
            if parsed.hostname:
                s = parsed.hostname
            elif parsed.netloc:
                s = parsed.netloc
            else:
                s = s.split('://', 1)[-1]
    elif s.startswith('\\\\'):
        s = s[2:]
    elif s.startswith('//'):
        s = s[2:]
    for sep in ('/', '\\'):
        if sep in s:
            s = s.split(sep, 1)[0]
    if s.startswith('['):
        closing = s.find(']')
        if closing != -1:
            inner = s[1:closing]
            remainder = s[closing + 1:]
            if remainder.startswith(':') and remainder[1:].isdigit():
                s = inner
            elif not remainder:
                s = inner
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1]
    if ":" in s and s.count(":") == 1:
        host_part, port_part = s.split(":", 1)
        if port_part.isdigit():
            s = host_part
    return s


def is_smb_url(url: str) -> bool:
    try:
        return urlparse(url).scheme.lower() == "smb"
    except Exception:
        return False


def _smb_open_for_read(parts: SMBParts):
    password = get_smb_password(parts.host, parts.share, parts.username) or ""
    server = parts.host
    port = parts.port or 445
    conn = Connection(uuid.uuid4(), server, port)
    conn.connect()
    sess = Session(conn, username=parts.username or "", password=password, require_encryption=False)
    sess.connect()
    tree = TreeConnect(sess, fr"\\\\{parts.host}\\{parts.share}")
    tree.connect()
    file = Open(tree, parts.path.replace("/", "\\"))
    file.create(
        impersonation_level=ImpersonationLevel.Impersonation,
        desired_access=FilePipePrinterAccessMask.GENERIC_READ,
        file_attributes=FileAttributes.FILE_ATTRIBUTE_NORMAL,
        share_access=ShareAccess.FILE_SHARE_READ,
        create_disposition=CreateDisposition.FILE_OPEN,
        create_options=CreateOptions.FILE_NON_DIRECTORY_FILE,
    )
    return conn, sess, tree, file


def _smb_close(conn, sess, tree, file):  # pragma: no cover - 资源释放分支难于覆盖
    try:
        try:
            file.close()
        finally:
            tree.disconnect()
    finally:
        try:
            sess.disconnect()
        finally:
            conn.disconnect(True)


SMB_PROVIDER = SMBFSProvider()
register_provider(SMB_PROVIDER)
