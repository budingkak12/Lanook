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

# smbprotocol for reliable SMB2/3 access
from smbprotocol.connection import Connection  # type: ignore
from smbprotocol.session import Session  # type: ignore
from smbprotocol.tree import TreeConnect  # type: ignore
from smbprotocol.open import (
    Open,
    FilePipePrinterAccessMask,
    CreateDisposition,
    CreateOptions,
    ShareAccess,
    ImpersonationLevel,
)  # type: ignore
from smbprotocol.file_info import (
    FileInformationClass,
    FileStandardInformation,
    FileBasicInformation,
    FileAttributes,
)  # type: ignore
import uuid

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
        # open_fs 的参数名为 hostname / direct-tcp / name-port / port
        # 这里将 hostname 显式指定为我们传入的原始 host，避免 127.0.0.1/localhost 反查失败。
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


def read_bytes(url: str, max_bytes: Optional[int] = None) -> bytes:
    if is_smb_url(url):
        parts = parse_smb_url(url)
        conn, sess, tree, file = _smb_open_for_read(parts)
        try:
            if max_bytes is None:
                total = int(file.end_of_file or 0)
                return file.read(0, total)
            else:
                return file.read(0, max_bytes)
        finally:
            _smb_close(conn, sess, tree, file)
    # fallback to local/other fs
    with ro_fs_for_url(url) as (fs, inner):
        with fs.openbin(inner, "r") as f:
            return f.read() if max_bytes is None else f.read(max_bytes)


def iter_bytes(url: str, start: int = 0, length: Optional[int] = None, chunk_size: int = 1024 * 1024):
    if is_smb_url(url):
        parts = parse_smb_url(url)
        conn, sess, tree, file = _smb_open_for_read(parts)
        try:
            std = file.query_info(FileInformationClass.FileStandardInformation, 0, 0, 48)
            size = FileStandardInformation.unpack(std).end_of_file
            if start < 0:
                start = 0
            end = size - 1 if length is None else min(start + length - 1, size - 1)
            pos = start
            remaining = end - start + 1
            while remaining > 0:
                n = min(chunk_size, remaining)
                data = file.read(pos, n)
                if not data:
                    break
                yield data
                pos += len(data)
                remaining -= len(data)
        finally:
            _smb_close(conn, sess, tree, file)
        return
    # fallback to local/other fs
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
    if is_smb_url(url):
        parts = parse_smb_url(url)
        conn, sess, tree, file = _smb_open_for_read(parts)
        try:
            size = int(file.end_of_file or 0)
            # last_write_time 是 datetime
            try:
                mtime = int(file.last_write_time.timestamp())
            except Exception:
                mtime = 0
            return mtime, size
        finally:
            _smb_close(conn, sess, tree, file)
    with ro_fs_for_url(url) as (fs, inner):
        info = fs.getinfo(inner, namespaces=["details"]).raw
        size = int(info.get("details", {}).get("size", 0))
        mtime = int(info.get("details", {}).get("modified", 0))
        return mtime, size
