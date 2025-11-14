from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import ContextManager, Generator, Iterable, Optional, Tuple
from urllib.parse import urlparse

from fastapi import HTTPException
from fs.base import FS
from fs.osfs import OSFS
from fs.wrap import read_only

from app.schemas.sources import SourceType, SourceValidateRequest, SourceValidateResponse
from app.services.sources.registry import ProviderCapability, register_provider


class LocalFSProvider:
    name = "local"
    priority = 0
    display_name = "本地目录"
    protocols = ("", "file")
    requires_credentials = False
    supports_anonymous = True
    credential_fields: tuple[dict[str, str], ...] = tuple()

    def can_handle(self, url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme.lower() == "file":
            return True
        if len(url) > 1 and url[1:2] == ":" and url[0].isalpha():
            return True
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

    def describe(self) -> ProviderCapability:
        return ProviderCapability(
            name=self.name,
            display_name=self.display_name,
            protocols=self.protocols,
            requires_credentials=self.requires_credentials,
            supports_anonymous=self.supports_anonymous,
            can_validate=True,
            credential_fields=list(self.credential_fields),
        )

    def validate(self, payload: SourceValidateRequest) -> SourceValidateResponse:
        if payload.type != SourceType.LOCAL:
            raise HTTPException(status_code=422, detail="来源类型不匹配")
        if not payload.path:
            raise HTTPException(status_code=422, detail="path required")

        exts = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv"}
        p = Path(payload.path).expanduser().resolve()
        if not p.exists():
            raise HTTPException(status_code=404, detail="路径不存在")
        if not p.is_dir():
            raise HTTPException(status_code=422, detail="路径不是文件夹")
        if not os.access(p, os.R_OK):
            raise HTTPException(status_code=403, detail="无读取权限")

        total = 0
        samples: list[str] = []
        for root, _dirs, files in os.walk(p):
            for fname in files:
                if Path(fname).suffix.lower() in exts:
                    total += 1
                    if len(samples) < 10:
                        samples.append(str(Path(root) / fname))
        return SourceValidateResponse(
            ok=True,
            readable=True,
            absPath=str(p),
            estimatedCount=total,
            samples=samples,
            note="只读验证通过，不会写入或删除此目录下文件",
        )


LOCAL_PROVIDER = LocalFSProvider()
register_provider(LOCAL_PROVIDER)
