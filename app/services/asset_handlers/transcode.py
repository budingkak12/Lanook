from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from fractions import Fraction
from pathlib import Path
from typing import Iterator, Optional

import av  # type: ignore

from app.db import Media
from app.services.asset_models import ArtifactPayload
from app.services.asset_handlers.common import ensure_artifact_dir, stream_remote_to_file
from app.services.fs_providers import is_smb_url, stat_url

TRANSCODE_DIR = ensure_artifact_dir("transcodes")
MAX_WIDTH = int(os.environ.get("MEDIAAPP_TRANSCODE_WIDTH", "1280"))
MAX_HEIGHT = int(os.environ.get("MEDIAAPP_TRANSCODE_HEIGHT", "720"))
TARGET_FPS = int(os.environ.get("MEDIAAPP_TRANSCODE_FPS", "30"))


def _transcode_path(media: Media) -> Path:
    suffix = Path(media.filename or "proxy.mp4").suffix.lower()
    ext = ".mp4" if suffix not in {".mp4", ".m4v"} else suffix
    return TRANSCODE_DIR / f"{media.id}{ext}"


def _source_mtime(media: Media) -> Optional[float]:
    if not media.absolute_path:
        return None
    try:
        if is_smb_url(media.absolute_path):
            mtime, _size = stat_url(media.absolute_path)
            return float(mtime)
        return os.stat(media.absolute_path).st_mtime
    except Exception:
        return None


def _is_stale(media: Media, path: Path) -> bool:
    if not path.exists():
        return True
    src_mtime = _source_mtime(media)
    if src_mtime is None:
        return False
    try:
        return path.stat().st_mtime < src_mtime
    except Exception:
        return True


def transcode_cache_lookup(media: Media) -> Optional[ArtifactPayload]:
    if media.media_type != "video":
        return None
    path = _transcode_path(media)
    if _is_stale(media, path):
        return None
    extra = {
        "mediaId": media.id,
        "proxyPath": str(path),
    }
    return ArtifactPayload(path=path, extra=extra)


@contextmanager
def _local_source(media: Media) -> Iterator[Path]:
    if not media.absolute_path:
        raise RuntimeError("missing media path")
    if not is_smb_url(media.absolute_path):
        yield Path(media.absolute_path)
        return
    suffix = Path(media.filename or "proxy").suffix or ".tmp"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp:
        temp_path = Path(temp.name)
    try:
        stream_remote_to_file(media.absolute_path, temp_path)
        yield temp_path
    finally:
        try:
            temp_path.unlink()
        except Exception:
            pass


def _target_dimensions(width: Optional[int], height: Optional[int]) -> tuple[int, int]:
    if not width or not height:
        return MAX_WIDTH, MAX_HEIGHT
    ratio = min(MAX_WIDTH / max(width, 1), MAX_HEIGHT / max(height, 1), 1.0)
    target_w = max(int(width * ratio) // 2 * 2, 2)
    target_h = max(int(height * ratio) // 2 * 2, 2)
    return target_w, target_h


def _transcode_video(input_path: Path, media: Media, dest: Path) -> dict[str, float | int | str]:
    container = av.open(str(input_path))
    video_stream = next((s for s in container.streams if s.type == "video"), None)
    if video_stream is None:
        container.close()
        raise RuntimeError("video stream missing")

    dest.parent.mkdir(parents=True, exist_ok=True)
    output = av.open(str(dest), mode="w")

    target_width, target_height = _target_dimensions(getattr(video_stream, "width", None), getattr(video_stream, "height", None))
    fps = video_stream.average_rate if video_stream.average_rate else Fraction(TARGET_FPS, 1)
    fps_value = float(fps)

    out_stream = output.add_stream("h264", rate=min(int(fps_value) or TARGET_FPS, TARGET_FPS))
    out_stream.width = target_width
    out_stream.height = target_height
    out_stream.pix_fmt = "yuv420p"
    out_stream.options = {"preset": "veryfast"}

    duration = None
    try:
        for frame in container.decode(video_stream):
            resized = frame.reformat(width=target_width, height=target_height, format="yuv420p")
            for packet in out_stream.encode(resized):
                output.mux(packet)
        for packet in out_stream.encode(None):
            output.mux(packet)
    finally:
        try:
            output.close()
        except Exception:
            pass
        try:
            container.close()
        except Exception:
            pass

    if video_stream.duration and video_stream.time_base:
        try:
            duration = float(video_stream.duration * video_stream.time_base)
        except Exception:
            duration = None

    payload = {
        "mediaId": media.id,
        "proxyPath": str(dest),
        "width": target_width,
        "height": target_height,
        "fps": min(float(fps_value), float(TARGET_FPS)),
    }
    if duration is not None:
        payload["duration"] = duration
    return payload


def transcode_generator(media: Media) -> Optional[ArtifactPayload]:
    if media.media_type != "video":
        return None
    dest = _transcode_path(media)
    temp_dest = dest.with_suffix(dest.suffix + ".tmp")
    try:
        with _local_source(media) as source_path:
            meta = _transcode_video(source_path, media, temp_dest)
        os.replace(temp_dest, dest)
    finally:
        if temp_dest.exists():
            try:
                temp_dest.unlink()
            except Exception:
                pass
    meta["proxyPath"] = str(dest)
    return ArtifactPayload(path=dest, extra=meta)


__all__ = [
    "transcode_cache_lookup",
    "transcode_generator",
]
