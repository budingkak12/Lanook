from __future__ import annotations

"""
Thumbnail Service
-----------------
把缩略图生成与读取从 main.py 抽离，作为独立的“资产处理模块”。

- 缩略图目录：项目根目录下 `thumbnails/`（与现有一致）。
- 图片：Pillow 按最长边 480px 生成 JPEG（q=85）。
- 视频：python-av 抽第 1 秒帧，按同规格生成。
- 远程源：通过 app.services.fs_providers 统一读取（SMB 等）。
- 缓存策略：若缩略图存在且尺寸/mtime 合规则直接返回；否则重建。
"""

from pathlib import Path
import os
import mimetypes
import time
from typing import Optional

from PIL import Image
import av  # type: ignore

from 初始化数据库 import Media
from app.services.fs_providers import is_smb_url, iter_bytes, read_bytes, stat_url


# 计算到项目根目录的 thumbnails 目录（与历史保持一致）
_REPO_ROOT = Path(__file__).resolve().parents[2]
THUMBNAILS_DIR = _REPO_ROOT / "thumbnails"
THUMBNAILS_DIR.mkdir(exist_ok=True)
MAX_THUMB_SIZE = (480, 480)

if hasattr(Image, "Resampling"):
    _LANCZOS = Image.Resampling.LANCZOS  # Pillow >= 9.1
else:  # pragma: no cover - 兼容旧版本 Pillow
    _LANCZOS = Image.LANCZOS


def thumb_path_for(media: Media) -> Path:
    """缩略图路径：<repo>/thumbnails/<id>.jpg"""
    return THUMBNAILS_DIR / f"{media.id}.jpg"


def _should_regenerate_local(src_path: str, thumb_path: Path) -> bool:
    try:
        src_stat = os.stat(src_path)
        if not thumb_path.exists():
            return True
        th_stat = os.stat(thumb_path)
        if src_stat.st_mtime > th_stat.st_mtime:
            return True
        if th_stat.st_size < 2000:  # 小于 2KB 视为异常缩略图
            return True
        return False
    except Exception:
        return True


def _save_image_thumbnail(img: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im = img.copy()
    im.thumbnail(MAX_THUMB_SIZE, _LANCZOS)
    if im.mode not in {"RGB", "L"}:
        im = im.convert("RGB")
    im.save(dest, format="JPEG", quality=85)


def _generate_image_thumbnail(src: str, dest: Path) -> bool:
    try:
        if is_smb_url(src):
            from io import BytesIO
            data = read_bytes(src)
            with Image.open(BytesIO(data)) as img:
                _save_image_thumbnail(img, dest)
        else:
            with Image.open(src) as img:
                _save_image_thumbnail(img, dest)
        return True
    except Exception:
        return False


def _extract_frame_to_thumb(container, dest: Path, target_seconds: float) -> bool:
    try:
        video_stream = next((s for s in container.streams if s.type == "video"), None)
        if video_stream is None:
            return False
        video_stream.thread_type = "AUTO"
        seek_pts = None
        if video_stream.time_base:
            seek_pts = int(max(target_seconds / float(video_stream.time_base), 0))
        if seek_pts and seek_pts > 0:
            try:
                container.seek(seek_pts, stream=video_stream, any_frame=False, backward=True)
            except av.AVError:
                container.seek(0)
        frame = None
        for decoded in container.decode(video_stream):
            frame = decoded
            break
        if frame is None:
            return False
        pil = frame.to_image()
        _save_image_thumbnail(pil, dest)
        return True
    except Exception:
        return False


def _generate_video_thumbnail(src: str, dest: Path, target_seconds: float = 1.0) -> bool:
    try:
        if is_smb_url(src):
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".video", delete=True) as tf:
                for chunk in iter_bytes(src, 0, None, 1024 * 1024):
                    tf.write(chunk)
                tf.flush()
                container = av.open(tf.name)
                return _extract_frame_to_thumb(container, dest, target_seconds)
        else:
            with av.open(src) as container:
                return _extract_frame_to_thumb(container, dest, target_seconds)
    except Exception:
        return False


def get_or_generate_thumbnail(media: Media) -> Optional[Path]:
    """生成并返回缩略图路径；失败返回 None。

    - 图片：等比缩放到不超过 480x480
    - 视频：抽帧（默认 1s 处）
    - 远程 SMB：基于远端 mtime 判定是否需要重建
    """
    if not media.absolute_path or not isinstance(media.absolute_path, str):
        return None
    src = media.absolute_path
    dest = thumb_path_for(media)

    if is_smb_url(src):
        try:
            mtime, _size = stat_url(src)
            if dest.exists():
                th = os.stat(dest)
                if th.st_mtime >= mtime and th.st_size >= 2000:
                    return dest
        except Exception:
            # 远端 stat 失败则尝试重建
            pass
    else:
        if not _should_regenerate_local(src, dest):
            return dest

    try:
        ok = _generate_image_thumbnail(src, dest) if media.media_type == "image" else _generate_video_thumbnail(src, dest)
        if ok and dest.exists() and dest.stat().st_size > 0:
            return dest
        return None
    except Exception:
        try:
            if dest.exists():
                dest.unlink()
        except Exception:
            pass
        return None


def build_thumb_headers(serve_path: str) -> dict[str, str]:
    guessed, _ = mimetypes.guess_type(serve_path)
    mime = guessed or "image/jpeg"
    st = os.stat(serve_path)
    return {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=86400, immutable",
        "ETag": f"{int(st.st_mtime)}-{st.st_size}",
        "Last-Modified": time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(st.st_mtime)),
        "Accept-Ranges": "bytes",
    }

