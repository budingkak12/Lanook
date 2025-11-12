from __future__ import annotations

import os
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import ContextManager, Generator, Iterable, Optional, Protocol, Tuple, runtime_checkable
from urllib.parse import urlparse, unquote

from fs import open_fs
from fs.base import FS
from fs.osfs import OSFS
from fs.wrap import read_only

# smbprotocol for reliable SMB2/3 access
from smbprotocol.connection import Connection  # type: ignore
from smbprotocol.open import (
    CreateDisposition,
    CreateOptions,
    FilePipePrinterAccessMask,
    ImpersonationLevel,
    Open,
    ShareAccess,
)  # type: ignore
from smbprotocol.file_info import FileAttributes  # type: ignore
from smbprotocol.session import Session  # type: ignore
from smbprotocol.tree import TreeConnect  # type: ignore

from app.services.credentials import get_smb_password


@runtime_checkable
class FSProvider(Protocol):
    """统一的文件系统提供器接口。"""

    name: str
    priority: int

    def can_handle(self, url: str) -> bool:
        ...

    def ro_fs(self, url: str) -> ContextManager[Tuple[FS, str]]:
        ...

    def read_bytes(self, url: str, max_bytes: Optional[int] = None) -> bytes:
        ...

    def iter_bytes(
        self,
        url: str,
        start: int = 0,
        length: Optional[int] = None,
        chunk_size: int = 1024 * 1024,
    ) -> Iterable[bytes]:
        ...

    def stat(self, url: str) -> Tuple[int, int]:
        ...


class ProviderRegistry:
    """维护可扩展的 Provider 列表，便于挂接 S3/WebDAV 等远程源。"""

    def __init__(self) -> None:
        self._providers: list[FSProvider] = []

    def register(self, provider: FSProvider) -> None:
        self._providers.append(provider)
        # priority 越大越先匹配
        self._providers.sort(key=lambda p: p.priority, reverse=True)

    def get(self, url: str) -> FSProvider:
        for provider in self._providers:
            if provider.can_handle(url):
                return provider
        raise ValueError(f"未找到可处理 {url} 的文件系统 Provider，请注册一个实现（例如 S3/WebDAV）。")

    def list(self) -> tuple[FSProvider, ...]:
        return tuple(self._providers)


_registry = ProviderRegistry()


def register_provider(provider: FSProvider) -> None:
    """向统一注册表挂载新的 Provider。后续接入 S3/WebDAV 时直接调用。"""

    _registry.register(provider)


def available_providers() -> list[str]:
    return [p.name for p in _registry.list()]


class LocalFSProvider:
    name = "local"
    priority = 0

    def can_handle(self, url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme.lower() == "file":
            return True
        # Windows 盘符路径，如 C:\foo
        if len(url) > 1 and url[1] == ":" and url[0].isalpha():
            return True
        # 允许绝对路径或相对路径（fallback）
        return parsed.scheme == ""

    def _to_abspath(self, url: str) -> str:
        if url[:7].lower() == "file://":
            path = url[7:]
        else:
            path = url
        return os.path.abspath(os.path.expanduser(path))

    @contextmanager
    def ro_fs(self, url: str) -> Generator[Tuple[FS, str], None, None]:
        abspath = self._to_abspath(url)
        root = os.path.splitdrive(abspath)[0] or "/"
        rel = abspath[len(root):].lstrip("/\\")
        fs = read_only(OSFS(root))
        try:
            yield fs, rel
        finally:
            fs.close()

    def read_bytes(self, url: str, max_bytes: Optional[int] = None) -> bytes:
        with self.ro_fs(url) as (fs, inner):
            with fs.openbin(inner, "r") as f:
                return f.read() if max_bytes is None else f.read(max_bytes)

    def iter_bytes(
        self,
        url: str,
        start: int = 0,
        length: Optional[int] = None,
        chunk_size: int = 1024 * 1024,
    ) -> Iterable[bytes]:
        with self.ro_fs(url) as (fs, inner):
            info = fs.getinfo(inner, namespaces=["details"]).raw
            size = int(info.get("details", {}).get("size", 0))
            if start < 0:
                start = 0
            end = size - 1 if length is None else min(start + length - 1, size - 1)
            with fs.openbin(inner, "r") as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    n = min(chunk_size, remaining)
                    data = f.read(n)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

    def stat(self, url: str) -> Tuple[int, int]:
        with self.ro_fs(url) as (fs, inner):
            info = fs.getinfo(inner, namespaces=["details"]).raw
            size = int(info.get("details", {}).get("size", 0))
            mtime = int(info.get("details", {}).get("modified", 0))
            return mtime, size


@dataclass
class SMBParts:
    host: str
    share: str
    path: str
    username: Optional[str]
    domain: Optional[str]
    port: Optional[int]


class SMBFSProvider:
    name = "smb"
    priority = 100

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
        userinfo = ""
        if parts.username:
            userinfo = f"{parts.username}@"
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

_smb_provider = SMBFSProvider()
_local_provider = LocalFSProvider()

register_provider(_smb_provider)
register_provider(_local_provider)


def get_provider(url: str) -> FSProvider:
    return _registry.get(url)


def is_smb_url(url: str) -> bool:
    return _smb_provider.can_handle(url)


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


@contextmanager
def ro_fs_for_url(url: str) -> Generator[Tuple[FS, str], None, None]:
    """返回只读 FS 与其根内路径。"""

    provider = get_provider(url)
    with provider.ro_fs(url) as ctx:
        yield ctx


def read_bytes(url: str, max_bytes: Optional[int] = None) -> bytes:
    provider = get_provider(url)
    return provider.read_bytes(url, max_bytes)


def iter_bytes(
    url: str,
    start: int = 0,
    length: Optional[int] = None,
    chunk_size: int = 1024 * 1024,
):
    provider = get_provider(url)
    yield from provider.iter_bytes(url, start=start, length=length, chunk_size=chunk_size)


def stat_url(url: str) -> Tuple[int, int]:
    """返回 (mtime_epoch, size)。"""

    return get_provider(url).stat(url)


def _smb_open_for_read(parts: SMBParts):
    """建立 SMB 连接并打开文件，返回 (connection, session, tree, file). 调用方负责关闭。"""

    password = get_smb_password(parts.host, parts.share, parts.username) or ""
    server = parts.host
    port = parts.port or 445
    conn = Connection(uuid.uuid4(), server, port)
    conn.connect()
    sess = Session(conn, username=parts.username or "", password=password, require_encryption=False)
    sess.connect()
    tree = TreeConnect(sess, fr"\\{parts.host}\{parts.share}")
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


def _smb_close(conn, sess, tree, file):
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
