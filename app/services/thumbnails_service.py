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
from PIL import ImageDraw, ImageFont
import av  # type: ignore

from app.db import Media
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


def resolve_cached_thumbnail(media: Media) -> Optional[Path]:
    """在不触发生成的情况下返回可用的缩略图路径。"""
    if not media.absolute_path or not isinstance(media.absolute_path, str):
        return None

    dest = thumb_path_for(media)
    if not dest.exists():
        return None

    if is_smb_url(media.absolute_path):
        try:
            mtime, _ = stat_url(media.absolute_path)
            th_stat = os.stat(dest)
        except Exception:
            return None
        if th_stat.st_mtime >= mtime and th_stat.st_size >= 2000:
            return dest
        return None

    if _should_regenerate_local(media.absolute_path, dest):
        return None
    return dest


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

        # 多时间点尝试，兼容关键帧太靠前/靠后或 moov 位置差异
        candidates = [target_seconds, 0.5, 2.5, 5.0, 10.0, 20.0, 30.0, 60.0]
        for ts in candidates:
            try:
                if video_stream.time_base:
                    seek_pts = int(max(ts / float(video_stream.time_base), 0))
                else:
                    seek_pts = None
                if seek_pts is not None and seek_pts > 0:
                    try:
                        container.seek(seek_pts, stream=video_stream, any_frame=False, backward=True)
                    except av.AVError:
                        container.seek(0)
                else:
                    container.seek(0)

                frame = None
                for decoded in container.decode(video_stream):
                    frame = decoded
                    break
                if frame is None:
                    continue
                pil = frame.to_image()
                _save_image_thumbnail(pil, dest)
                return True
            except av.AVError:
                continue
        return False
    except Exception:
        return False


def _generate_video_thumbnail(src: str, dest: Path, target_seconds: float = 1.0) -> bool:
    """为视频生成缩略图。

    关键修复：对 SMB 源不再整文件下载。改为“渐进式”读取：
    - 先读前若干 MB 到临时文件尝试解码首帧；
    - 若失败再追加更多数据，直到达到字节/时间上限；
    - 仍失败时返回 False（上层会生成占位缩略图）。
    这样可避免首页等待整段大视频导致缩略图长时间缺失。
    """
    try:
        if is_smb_url(src):
            import tempfile, time as _time

            # 策略：构造稀疏临时文件，只拉取“文件头+文件尾”，优先拿到 moov（尾部）和首批帧（头部），大幅减少下载量。
            HEAD_INIT = int(os.environ.get("MEDIAAPP_SMB_THUMB_HEAD_INIT", str(4 * 1024 * 1024)))   # 4MB
            TAIL_INIT = int(os.environ.get("MEDIAAPP_SMB_THUMB_TAIL_INIT", str(4 * 1024 * 1024)))   # 4MB
            INCREMENT = int(os.environ.get("MEDIAAPP_SMB_THUMB_INCREMENT", str(4 * 1024 * 1024)))   # 4MB
            MAX_BYTES = int(os.environ.get("MEDIAAPP_SMB_THUMB_MAX_BYTES", str(256 * 1024 * 1024))) # 256MB
            TIMEOUT = float(os.environ.get("MEDIAAPP_SMB_THUMB_TIMEOUT_SEC", "45.0"))               # 45s

            start_ts = _time.time()
            mtime, size = stat_url(src)
            if size <= 0:
                return False

            head = min(HEAD_INIT, size)
            tail = min(TAIL_INIT, size - head) if size > head else 0

            def try_decode(temp_path: str) -> bool:
                try:
                    container = av.open(temp_path)
                except av.AVError:
                    return False
                try:
                    return _extract_frame_to_thumb(container, dest, target_seconds)
                finally:
                    try:
                        container.close()
                    except Exception:
                        pass

            with tempfile.NamedTemporaryFile(suffix=".video", delete=True) as tf:
                # 预分配稀疏文件大小
                try:
                    tf.truncate(size)
                except Exception:
                    pass

                def write_range(offset: int, data_iter):
                    tf.seek(offset)
                    total = 0
                    for chunk in data_iter:
                        tf.write(chunk)
                        total += len(chunk)
                    tf.flush()
                    return total

                downloaded = 0

                # 先拉尾部（moov 常在尾部）
                if tail > 0:
                    tail_start = max(size - tail, 0)
                    downloaded += write_range(tail_start, iter_bytes(src, tail_start, tail, max(1024 * 1024, INCREMENT)))

                # 再拉头部
                if head > 0:
                    downloaded += write_range(0, iter_bytes(src, 0, head, max(1024 * 1024, INCREMENT)))

                if try_decode(tf.name):
                    return True

                # 逐步扩大 head/tail，直到成功或达到上限/超时
                while downloaded < MAX_BYTES and (_time.time() - start_ts) < TIMEOUT and (head + tail) < size:
                    expand_head = min(INCREMENT, size - (head + tail))
                    expand_tail = min(INCREMENT, size - (head + tail) - expand_head)

                    if expand_tail > 0:
                        new_tail_start = max(size - (tail + expand_tail), 0)
                        downloaded += write_range(new_tail_start, iter_bytes(src, new_tail_start, expand_tail, max(1024 * 1024, INCREMENT)))
                        tail += expand_tail

                    if expand_head > 0:
                        downloaded += write_range(head, iter_bytes(src, head, expand_head, max(1024 * 1024, INCREMENT)))
                        head += expand_head

                    if try_decode(tf.name):
                        return True

                return False
        else:
            with av.open(src) as container:
                return _extract_frame_to_thumb(container, dest, target_seconds)
    except Exception:
        return False


def get_or_generate_thumbnail(media: Media) -> Optional[Path]:
    """生成并返回缩略图路径；失败返回 None（不再生成占位图）。

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
        # 不再生成占位图：失败直接返回 None
        if dest.exists():
            try:
                dest.unlink()
            except Exception:
                pass
        return None
    except Exception:
        # 出错也不生成占位图，直接返回 None
        if dest.exists():
            try:
                dest.unlink()
            except Exception:
                pass
        return None


def _generate_placeholder_thumbnail(dest: Path, label: str = "MEDIA") -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    W, H = MAX_THUMB_SIZE
    img = Image.new("RGB", (W, H), color=(38, 38, 38))
    draw = ImageDraw.Draw(img)
    # 画一个简单的播放三角形或相片轮廓
    if label == "VIDEO":
        tri = [(W//3, H//4), (W//3, H*3//4), (W*2//3, H//2)]
        draw.polygon(tri, fill=(220, 220, 220))
    else:
        draw.rectangle([W//4, H//4, W*3//4, H*3//4], outline=(220, 220, 220), width=4)
        draw.line([W//4, H*3//4, W*3//4, H//4], fill=(220, 220, 220), width=3)
    # 文本（不依赖系统字体）
    txt = f"{label}"
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    tw, th = draw.textlength(txt, font=font), 12
    draw.text(((W - tw)//2, H - th - 10), txt, fill=(200, 200, 200), font=font)
    img.save(dest, format="JPEG", quality=85)


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
