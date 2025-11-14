from __future__ import annotations

import io
import json
import os
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import av  # type: ignore
from PIL import Image

from app.db import Media
from app.services.asset_models import ArtifactPayload
from app.services.asset_handlers.common import ensure_artifact_dir, read_remote_head
from app.services.fs_providers import is_smb_url, stat_url

METADATA_DIR = ensure_artifact_dir("metadata")
REMOTE_PROBE_BYTES = int(os.environ.get("MEDIAAPP_METADATA_REMOTE_BYTES", str(1 * 1024 * 1024)))
MAX_CHECKSUM_BYTES = int(os.environ.get("MEDIAAPP_METADATA_CHECKSUM_BYTES", str(32 * 1024 * 1024)))


def _metadata_path(media: Media) -> Path:
    return METADATA_DIR / f"{media.id}.json"


def _source_mtime(media: Media) -> Optional[float]:
    if not media.absolute_path:
        return None
    try:
        if is_smb_url(media.absolute_path):
            mtime, _size = stat_url(media.absolute_path)
            return float(mtime)
        stat = os.stat(media.absolute_path)
        return float(stat.st_mtime)
    except Exception:
        return None


def _metadata_is_stale(media: Media, payload_path: Path) -> bool:
    if not payload_path.exists():
        return True
    src_mtime = _source_mtime(media)
    if src_mtime is None:
        return False
    try:
        return payload_path.stat().st_mtime < src_mtime
    except Exception:
        return True


def metadata_cache_lookup(media: Media) -> Optional[ArtifactPayload]:
    path = _metadata_path(media)
    if not path.exists():
        return None
    if _metadata_is_stale(media, path):
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return ArtifactPayload(path=path, extra=data, checksum=data.get("checksum"))


def _ts_to_iso(ts: Optional[float]) -> Optional[str]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        return None


def _compute_checksum(path: str) -> Optional[str]:
    try:
        total = 0
        digest = hashlib.sha256()
        with open(path, "rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
                total += len(chunk)
                if MAX_CHECKSUM_BYTES and total >= MAX_CHECKSUM_BYTES:
                    break
        return digest.hexdigest()
    except Exception:
        return None


def _probe_image_size(media: Media, is_remote: bool) -> Tuple[Optional[int], Optional[int]]:
    if not media.absolute_path:
        return None, None
    try:
        if is_remote:
            blob = read_remote_head(media.absolute_path, REMOTE_PROBE_BYTES)
            if not blob:
                return None, None
            with Image.open(io.BytesIO(blob)) as img:
                return img.width, img.height
        with Image.open(media.absolute_path) as img:
            return img.width, img.height
    except Exception:
        return None, None


def _probe_video_stats(media: Media, is_remote: bool) -> Tuple[Optional[int], Optional[int], Optional[float]]:
    if not media.absolute_path:
        return None, None, None
    if is_remote:
        # 远端视频的完整探测代价较大，这里仅返回 size/duration=None，待客户端懒加载。
        return None, None, None
    try:
        container = av.open(media.absolute_path)
        video_stream = next((s for s in container.streams if s.type == "video"), None)
        if not video_stream:
            return None, None, None
        width = getattr(video_stream, "width", None)
        height = getattr(video_stream, "height", None)
        duration = None
        if video_stream.duration and video_stream.time_base:
            duration = float(video_stream.duration * video_stream.time_base)
        return width, height, duration
    except Exception:
        return None, None, None


def _build_metadata(media: Media) -> Optional[Dict[str, Any]]:
    if not media.absolute_path:
        return None
    is_remote = is_smb_url(media.absolute_path)
    try:
        if is_remote:
            mtime, size = stat_url(media.absolute_path)
        else:
            stat = os.stat(media.absolute_path)
            mtime = stat.st_mtime
            size = stat.st_size
    except Exception:
        return None

    base: Dict[str, Any] = {
        "mediaId": media.id,
        "filename": media.filename,
        "mediaType": media.media_type,
        "sourcePath": media.absolute_path,
        "size": int(size),
        "mtime": _ts_to_iso(float(mtime) if mtime else None),
    }

    if not is_remote:
        try:
            stat = os.stat(media.absolute_path)
            base["ctime"] = _ts_to_iso(stat.st_ctime)
        except Exception:
            pass

    if media.media_type == "image":
        width, height = _probe_image_size(media, is_remote)
        if width:
            base["width"] = width
        if height:
            base["height"] = height
    elif media.media_type == "video":
        width, height, duration = _probe_video_stats(media, is_remote)
        if width:
            base["width"] = width
        if height:
            base["height"] = height
        if duration:
            base["duration"] = duration

    if not is_remote and os.path.exists(media.absolute_path):
        checksum = _compute_checksum(media.absolute_path)
        if checksum:
            base["checksum"] = checksum

    return base


def metadata_generator(media: Media) -> Optional[ArtifactPayload]:
    data = _build_metadata(media)
    if not data:
        return None
    path = _metadata_path(media)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return ArtifactPayload(path=path, extra=data, checksum=data.get("checksum"))


__all__ = [
    "metadata_cache_lookup",
    "metadata_generator",
]
