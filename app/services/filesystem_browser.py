import os
import platform
from dataclasses import dataclass
from pathlib import Path
from string import ascii_uppercase
from typing import Iterable, List


@dataclass
class DirectoryInfo:
    path: str
    name: str
    readable: bool
    writable: bool
    is_root: bool
    is_symlink: bool = False


def _to_info(path: Path, *, is_root: bool) -> DirectoryInfo:
    resolved = path.resolve(strict=False)
    readable = os.access(resolved, os.R_OK)
    writable = os.access(resolved, os.W_OK)
    display_name = path.name or str(resolved)
    return DirectoryInfo(
        path=str(resolved),
        name=display_name,
        readable=readable,
        writable=writable,
        is_root=is_root,
        is_symlink=path.is_symlink(),
    )


def _windows_roots() -> Iterable[Path]:
    for letter in ascii_uppercase:
        candidate = Path(f"{letter}:\\")
        if candidate.exists():
            yield candidate
    home = Path.home()
    if home.exists():
        yield home


def _posix_roots() -> Iterable[Path]:
    # 根目录
    yield Path("/")
    home = Path.home()
    if home.exists():
        yield home
    volumes = Path("/Volumes")
    if volumes.exists():
        for child in volumes.iterdir():
            if child.is_dir():
                yield child


def list_roots() -> List[DirectoryInfo]:
    system = platform.system().lower()
    if system.startswith("win"):
        roots = _windows_roots()
    else:
        roots = _posix_roots()
    unique_paths = []
    seen = set()
    for path in roots:
        resolved = path.resolve(strict=False)
        key = str(resolved).lower() if system.startswith("win") else str(resolved)
        if key in seen:
            continue
        seen.add(key)
        unique_paths.append(_to_info(path, is_root=True))
    return sorted(unique_paths, key=lambda item: item.name.lower())


def list_subdirectories(target: str) -> List[DirectoryInfo]:
    base_path = Path(target).expanduser().resolve()
    if not base_path.exists():
        raise FileNotFoundError(f"路径不存在：{base_path}")
    if not base_path.is_dir():
        raise NotADirectoryError(f"路径不是文件夹：{base_path}")
    try:
        children = list(base_path.iterdir())
    except PermissionError as exc:
        raise PermissionError(f"没有权限访问：{base_path}") from exc

    entries: List[DirectoryInfo] = []
    for child in children:
        if not child.is_dir():
            continue
        # 屏蔽隐藏目录（以 . 开头），减少噪音
        name = child.name
        if name.startswith("."):
            continue
        try:
            info = _to_info(child, is_root=False)
            entries.append(info)
        except PermissionError:
            # 某些路径 resolve 会触发权限错误，直接跳过
            continue
    entries.sort(key=lambda item: item.name.lower())
    return entries
