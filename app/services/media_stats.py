import os
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

from app.db import SUPPORTED_IMAGE_EXTS, SUPPORTED_VIDEO_EXTS
from app.services.fs_providers import is_smb_url, ro_fs_for_url


@dataclass
class _DirectoryStats:
    total_media_files: int
    scanned_at: float


class MediaDirectoryStats:
    """对媒体目录的文件统计做简单缓存，避免重复全量扫描。"""

    def __init__(self, ttl_seconds: float = 30.0) -> None:
        self._ttl = ttl_seconds
        self._cache: dict[Path, _DirectoryStats] = {}
        self._lock = Lock()

    def count_supported_media(self, directory: Path, *, force_refresh: bool = False) -> int:
        absolute = directory.expanduser().resolve()
        now = time.monotonic()
        with self._lock:
            cached = self._cache.get(absolute)
            if not force_refresh and cached and now - cached.scanned_at < self._ttl:
                return cached.total_media_files

        total = _count_supported_media_files(absolute)
        stats = _DirectoryStats(total_media_files=total, scanned_at=now)
        with self._lock:
            self._cache[absolute] = stats
        return total


def _count_supported_media_files(directory: Path) -> int:
    if not directory.exists():
        raise FileNotFoundError(f"目录不存在：{directory}")
    if not directory.is_dir():
        raise NotADirectoryError(f"路径不是目录：{directory}")

    supported_exts = SUPPORTED_IMAGE_EXTS | SUPPORTED_VIDEO_EXTS
    total = 0
    for root, _, files in os.walk(directory):
        for filename in files:
            if Path(filename).suffix.lower() in supported_exts:
                total += 1
    return total


_GLOBAL_STATS = MediaDirectoryStats()


def count_supported_media(directory: Path | str, *, force_refresh: bool = False) -> int:
    """统计指定目录中受支持的媒体文件数量。
    - 本地目录：使用带缓存的统计。
    - SMB URL：即时统计（不缓存），以避免将 URL 当作本地路径。
    """
    if isinstance(directory, str) and is_smb_url(directory):
        # 简单遍历 SMB 目录统计受支持的媒体文件数量
        exts = SUPPORTED_IMAGE_EXTS | SUPPORTED_VIDEO_EXTS
        total = 0
        with ro_fs_for_url(directory) as (fs, inner):
            base = inner.rstrip('/')
            walker = fs.walk.files(base) if base else fs.walk.files()
            for path in walker:
                name = path.rsplit('/', 1)[-1]
                if ('.' in name) and ('.' + name.rsplit('.', 1)[-1].lower()) in exts:
                    total += 1
        return total
    # 其余情况按本地目录处理
    if isinstance(directory, str):
        directory = Path(directory)
    return _GLOBAL_STATS.count_supported_media(directory, force_refresh=force_refresh)
