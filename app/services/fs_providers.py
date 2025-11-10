from __future__ import annotations

import io
import os
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Generator, Optional, Tuple
from urllib.parse import urlparse, unquote

from fs import open_fs
from fs.base import FS
from fs.errors import ResourceNotFound
from fs.osfs import OSFS
from fs.wrap import read_only

from app.services.credentials import get_smb_password


def is_smb_url(url: str) -> bool:
    try:
        p = urlparse(url)
        return p.scheme.lower() == "smb"
    except Exception:
        return False


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
    # netloc: [domain;]user@host:port
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
    # share is first segment
    parts = share_and_path.split("/", 1)
    share = parts[0]
    subpath = parts[1] if len(parts) > 1 else ""
    return SMBParts(host=host, share=share, path=subpath, username=username, domain=domain, port=port)


@contextmanager
def ro_fs_for_url(url: str) -> Generator[Tuple[FS, str], None, None]:
    """返回只读 FS 与其根内路径。

    - file:///abs/path => OSFS('/') + 'abs/path'
    - /abs/path       => OSFS('/') + 'abs/path'
    - smb://...       => SMBFS(host, share, ...) + 'sub/path'
    """
    if is_smb_url(url):
        parts = parse_smb_url(url)
        password = get_smb_password(parts.host, parts.share, parts.username)
        userinfo = ""
        if parts.username:
            # fs.smbfs URL: smb://user:pass@host/share/; 但我们用 open_fs() + credentials
            userinfo = f"{parts.username}@"
        netloc = f"{userinfo}{parts.host}"
        base_url = f"smb://{netloc}/{parts.share}"
        # open_fs 支持 smb://user:pass@host/share
        # 附加 smbfs 连接参数，兼容部分环境需要明确 server_name/直连端口
        q = f"?server_name={parts.host}&port=445&direct_tcp=true"
        if parts.username and password:
            fs_url = f"smb://{parts.username}:{password}@{parts.host}/{parts.share}{q}"
        else:
            fs_url = base_url + q
        fs = read_only(open_fs(fs_url))
        try:
            yield fs, parts.path
        finally:
            fs.close()
    else:
        # local path or file://
        if url.startswith("file://"):
            path = url[7:]
        else:
            path = url
        abspath = os.path.abspath(os.path.expanduser(path))
        root = os.path.splitdrive(abspath)[0] or "/"
        rel = abspath[len(root):].lstrip("/\\")
        fs = read_only(OSFS(root))
        try:
            yield fs, rel
        finally:
            fs.close()


def read_bytes(url: str, max_bytes: Optional[int] = None) -> bytes:
    with ro_fs_for_url(url) as (fs, inner):
        with fs.openbin(inner, "r") as f:
            if max_bytes is None:
                return f.read()
            return f.read(max_bytes)


def iter_bytes(url: str, start: int = 0, length: Optional[int] = None, chunk_size: int = 1024 * 1024):
    with ro_fs_for_url(url) as (fs, inner):
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
                yield data
                remaining -= len(data)


def stat_url(url: str) -> Tuple[int, int]:
    """返回 (mtime_epoch, size)。找不到抛出 ResourceNotFound。"""
    with ro_fs_for_url(url) as (fs, inner):
        info = fs.getinfo(inner, namespaces=["details"]).raw
        size = int(info.get("details", {}).get("size", 0))
        mtime = int(info.get("details", {}).get("modified", 0))
        return mtime, size
