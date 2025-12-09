from __future__ import annotations

import mimetypes
import os
import platform
import shutil
from dataclasses import dataclass
from pathlib import Path
from string import ascii_uppercase
from typing import Iterable, List, Tuple
from urllib.parse import quote

import blake3

from fastapi import HTTPException

from app.db import SUPPORTED_IMAGE_EXTS, SUPPORTED_VIDEO_EXTS


@dataclass
class RootEntry:
    id: str
    path: Path
    display_name: str
    writable: bool
    available: bool
    removable: bool
    total_bytes: int | None
    free_bytes: int | None
    platform: str


_THUMB_MEDIA_EXTS = {ext.lstrip(".") for ext in (*SUPPORTED_IMAGE_EXTS, *SUPPORTED_VIDEO_EXTS)}


def _hash_id(prefix: str, value: str) -> str:
    digest = blake3.blake3(value.encode("utf-8")).hexdigest()[:8]
    return f"{prefix}_{digest}"


def _disk_usage_safe(path: Path) -> Tuple[int | None, int | None]:
    try:
        usage = shutil.disk_usage(path)
        return usage.total, usage.free
    except Exception:
        return None, None


def _platform() -> str:
    return platform.system().lower()


def _windows_roots() -> Iterable[Path]:
    for letter in ascii_uppercase:
        candidate = Path(f"{letter}:\\")
        if candidate.exists():
            yield candidate
    home = Path.home()
    if home.exists():
        yield home


def _posix_roots() -> Iterable[Path]:
    yield Path("/")
    home = Path.home()
    if home.exists():
        yield home
    volumes = Path("/Volumes")
    if volumes.exists():
        for child in volumes.iterdir():
            if child.is_dir():
                yield child


def discover_roots() -> List[RootEntry]:
    system = _platform()
    roots = _windows_roots() if system.startswith("win") else _posix_roots()
    entries: List[RootEntry] = []
    seen = set()
    for path in roots:
        resolved = path.expanduser().resolve(strict=False)
        key = str(resolved).lower() if system.startswith("win") else str(resolved)
        if key in seen:
            continue
        seen.add(key)
        writable = os.access(resolved, os.W_OK)
        available = resolved.exists()
        removable = False
        if system.startswith("win"):
            removable = False  # 粗略：盘符默认视为固定，后续可改进
        else:
            if str(resolved).startswith("/Volumes"):
                removable = True
        total, free = _disk_usage_safe(resolved) if available else (None, None)
        entry = RootEntry(
            id=_hash_id("root", key),
            path=resolved,
            display_name=resolved.drive or str(resolved) if system.startswith("win") else (resolved.name or str(resolved)),
            writable=writable,
            available=available,
            removable=removable,
            total_bytes=total,
            free_bytes=free,
            platform=system,
        )
        entries.append(entry)
    return entries


def _resolve_root(root_id: str) -> RootEntry:
    for entry in discover_roots():
        if entry.id == root_id:
            return entry
    raise HTTPException(status_code=404, detail={"code": "not_found", "message": "root not found"})


def _safe_join(root: RootEntry, relative_path: str) -> Path:
    rel = (relative_path or "").lstrip("/")
    candidate = (root.path / rel).expanduser().resolve(strict=False)
    try:
        common = os.path.commonpath([candidate, root.path])
    except Exception:
        raise HTTPException(status_code=400, detail={"code": "out_of_root", "message": "invalid path"})
    if common != str(root.path.resolve(strict=False)):
        raise HTTPException(status_code=400, detail={"code": "out_of_root", "message": "path outside root"})
    return candidate


def _should_show(name: str, show_hidden: bool) -> bool:
    if show_hidden:
        return True
    return not name.startswith(".")


def list_dir(
    root_id: str,
    path: str,
    *,
    offset: int,
    limit: int,
    show_hidden: bool,
    sort: str,
    order: str,
    media_only: bool,
):
    root = _resolve_root(root_id)
    if not root.available:
        raise HTTPException(status_code=503, detail={"code": "unavailable", "message": "root unavailable"})

    target = _safe_join(root, path)
    if not target.exists():
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "path not found"})
    if not target.is_dir():
        raise HTTPException(status_code=400, detail={"code": "not_directory", "message": "path is not directory"})

    try:
        entries = list(target.iterdir())
    except PermissionError:
        raise HTTPException(status_code=403, detail={"code": "permission_denied", "message": "permission denied"})

    items = []
    for entry in entries:
        name = entry.name
        if not _should_show(name, show_hidden):
            continue
        try:
            stat = entry.stat()
            is_dir = entry.is_dir()
            size = 0 if is_dir else stat.st_size
            ext = entry.suffix[1:].lower() if entry.suffix else ""
            if (not is_dir) and media_only and ext not in _THUMB_MEDIA_EXTS:
                continue
            thumb_url = None
            if not is_dir and ext in _THUMB_MEDIA_EXTS:
                encoded = quote(f"{path.strip('/')}/" + name if path else name)
                thumb_url = f"/fs/thumb?root_id={root_id}&path={encoded}"
            items.append(
                {
                    "name": name,
                    "is_dir": is_dir,
                    "size": size,
                    "mtime": stat.st_mtime,
                    "ext": ext,
                    "writable": os.access(entry, os.W_OK),
                    "thumbnail_url": thumb_url,
                    "media_meta": None,
                }
            )
        except (PermissionError, FileNotFoundError):
            # 跳过无法访问或已被删除的文件（如 .VolumeIcon.icns）
            continue

    def sort_key(it):
        if sort == "mtime":
            return it["mtime"]
        if sort == "size":
            return it["size"]
        return it["name"].lower()

    reverse = order == "desc"
    items.sort(key=sort_key, reverse=reverse)
    total = len(items)
    sliced = items[offset : offset + limit]
    return sliced, total


def mkdir(root_id: str, path: str):
    root = _resolve_root(root_id)
    target = _safe_join(root, path)
    if target.exists():
        raise HTTPException(status_code=409, detail={"code": "exists", "message": "target exists"})
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.mkdir(parents=False, exist_ok=False)
    except PermissionError:
        raise HTTPException(status_code=403, detail={"code": "permission_denied", "message": "no permission"})
    except Exception:
        raise HTTPException(status_code=500, detail={"code": "io_error", "message": "mkdir failed"})


def rename(root_id: str, src_path: str, dst_path: str):
    root = _resolve_root(root_id)
    src = _safe_join(root, src_path)
    dst = _safe_join(root, dst_path)
    if not src.exists():
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "source missing"})
    if dst.exists():
        raise HTTPException(status_code=409, detail={"code": "exists", "message": "destination exists"})
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)
    except PermissionError:
        raise HTTPException(status_code=403, detail={"code": "permission_denied", "message": "no permission"})
    except Exception:
        raise HTTPException(status_code=500, detail={"code": "io_error", "message": "rename failed"})


def delete(root_id: str, paths: List[str]):
    root = _resolve_root(root_id)
    failures = []
    for rel in paths:
        target = _safe_join(root, rel)
        if not target.exists():
            failures.append({"path": rel, "code": "not_found"})
            continue
        try:
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
        except PermissionError:
            failures.append({"path": rel, "code": "permission_denied"})
        except Exception:
            failures.append({"path": rel, "code": "io_error"})
    if failures:
        raise HTTPException(status_code=207, detail={"code": "partial_failure", "failures": failures})


def move_or_copy(root_id: str, src_paths: List[str], dst_dir: str, *, op: str):
    assert op in {"move", "copy"}
    root = _resolve_root(root_id)
    dst = _safe_join(root, dst_dir)
    if not dst.exists() or not dst.is_dir():
        raise HTTPException(status_code=400, detail={"code": "dst_not_dir", "message": "destination dir missing"})

    failures = []
    for rel in src_paths:
        src = _safe_join(root, rel)
        if not src.exists():
            failures.append({"path": rel, "code": "not_found"})
            continue
        target = dst / src.name
        try:
            if op == "move":
                shutil.move(src, target)
            else:
                if src.is_dir():
                    shutil.copytree(src, target, dirs_exist_ok=False)
                else:
                    shutil.copy2(src, target)
        except FileExistsError:
            failures.append({"path": rel, "code": "exists"})
        except PermissionError:
            failures.append({"path": rel, "code": "permission_denied"})
        except Exception:
            failures.append({"path": rel, "code": "io_error"})
    if failures:
        raise HTTPException(status_code=207, detail={"code": "partial_failure", "failures": failures})


def file_path(root_id: str, path: str) -> Path:
    root = _resolve_root(root_id)
    target = _safe_join(root, path)
    if not target.exists():
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "file not found"})
    if target.is_dir():
        raise HTTPException(status_code=400, detail={"code": "not_file", "message": "path is directory"})
    return target


def guess_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    return mime or "application/octet-stream"


def compute_fingerprint(path: Path) -> str:
    hasher = blake3.blake3()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()[:32]


def thumb_path_for_fingerprint(fingerprint: str) -> Path:
    from app.services.thumbnails_service import THUMBNAILS_DIR

    bucket = fingerprint[:2]
    return THUMBNAILS_DIR / "fs" / bucket / f"{fingerprint}.jpg"


def generate_thumbnail(src: Path, dest: Path, *, max_size=(480, 480)) -> bool:
    from PIL import Image
    import av  # type: ignore

    dest.parent.mkdir(parents=True, exist_ok=True)
    ext = src.suffix.lower()
    try:
        if ext in SUPPORTED_IMAGE_EXTS:
            with Image.open(src) as img:
                im = img.copy()
                im.thumbnail(max_size, Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS)
                if im.mode not in {"RGB", "L"}:
                    im = im.convert("RGB")
                im.save(dest, format="JPEG", quality=85)
                return True
        if ext in SUPPORTED_VIDEO_EXTS:
            with av.open(str(src)) as container:
                video_stream = next((s for s in container.streams if s.type == "video"), None)
                if video_stream is None:
                    return False
                # 取首帧
                for frame in container.decode(video_stream):
                    pil = frame.to_image()
                    pil.thumbnail(max_size, Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS)
                    if pil.mode not in {"RGB", "L"}:
                        pil = pil.convert("RGB")
                    pil.save(dest, format="JPEG", quality=85)
                    return True
        return False
    except Exception:
        return False
