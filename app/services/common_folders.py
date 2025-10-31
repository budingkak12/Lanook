from __future__ import annotations

import os
import platform
from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass
class CommonFolderInfo:
    path: str
    name: str
    readable: bool
    writable: bool
    is_root: bool
    is_symlink: bool
    category: str  # desktop/documents/downloads/pictures/videos/music/home/volume


def _entry(path: Path, category: str, *, display_name: str | None = None, is_root: bool = False) -> CommonFolderInfo:
    resolved = path.expanduser().resolve(strict=False)
    name = display_name or (resolved.name or str(resolved))
    return CommonFolderInfo(
        path=str(resolved),
        name=name,
        readable=os.access(resolved, os.R_OK),
        writable=os.access(resolved, os.W_OK),
        is_root=is_root,
        is_symlink=resolved.is_symlink(),
        category=category,
    )


def _mac_common() -> List[CommonFolderInfo]:
    home = Path.home()
    candidates = [
        (home / "Desktop", "desktop", "桌面"),
        (home / "Documents", "documents", "文稿"),
        (home / "Downloads", "downloads", "下载"),
        (home / "Pictures", "pictures", "图片"),
        (home / "Movies", "videos", "影片"),
        (home / "Music", "music", "音乐"),
    ]
    entries: List[CommonFolderInfo] = []
    for p, cat, label in candidates:
        entries.append(_entry(p, cat, display_name=label))
    entries.append(_entry(home, "home", display_name="家目录", is_root=True))

    volumes = Path("/Volumes")
    if volumes.exists():
        for child in volumes.iterdir():
            if child.is_dir():
                entries.append(_entry(child, "volume", display_name=child.name, is_root=True))
    return entries


def _windows_common() -> List[CommonFolderInfo]:
    # 简化实现：不依赖 win32 API，按常见路径与盘符枚举
    home = Path.home()
    candidates = [
        (home / "Desktop", "desktop", "桌面"),
        (home / "Documents", "documents", "文档"),
        (home / "Downloads", "downloads", "下载"),
        (home / "Pictures", "pictures", "图片"),
        (home / "Videos", "videos", "视频"),
        (home / "Music", "music", "音乐"),
    ]
    entries: List[CommonFolderInfo] = []
    for p, cat, label in candidates:
        entries.append(_entry(p, cat, display_name=label))
    entries.append(_entry(home, "home", display_name="用户主目录", is_root=True))

    # 盘符 A:..Z:
    from string import ascii_uppercase

    for letter in ascii_uppercase:
        drive = Path(f"{letter}:\\")
        if drive.exists():
            entries.append(_entry(drive, "volume", display_name=f"{letter}:\\", is_root=True))
    return entries


def _linux_common() -> List[CommonFolderInfo]:
    home = Path.home()
    candidates = [
        (home / "Desktop", "desktop", "桌面"),
        (home / "Documents", "documents", "文档"),
        (home / "Downloads", "downloads", "下载"),
        (home / "Pictures", "pictures", "图片"),
        (home / "Videos", "videos", "视频"),
        (home / "Music", "music", "音乐"),
    ]
    entries: List[CommonFolderInfo] = []
    for p, cat, label in candidates:
        entries.append(_entry(p, cat, display_name=label))
    entries.append(_entry(home, "home", display_name="家目录", is_root=True))

    for base in (Path("/media"), Path("/mnt")):
        if base.exists():
            for child in base.iterdir():
                if child.is_dir():
                    entries.append(_entry(child, "volume", display_name=child.name, is_root=True))
    return entries


def list_common_folders() -> List[CommonFolderInfo]:
    system = platform.system().lower()
    if system.startswith("win"):
        return _windows_common()
    if system == "darwin":
        return _mac_common()
    return _linux_common()

