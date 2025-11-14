from __future__ import annotations

from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from app.db import Media
from app.services.asset_models import ArtifactPayload
from app.services.asset_handlers.common import ensure_artifact_dir
from app.services.thumbnails_service import MAX_THUMB_SIZE

PLACEHOLDER_DIR = ensure_artifact_dir("placeholders")


def _placeholder_path(media: Media) -> Path:
    return PLACEHOLDER_DIR / f"{media.id}.jpg"


def placeholder_cache_lookup(media: Media) -> Optional[ArtifactPayload]:
    path = _placeholder_path(media)
    if not path.exists():
        return None
    return ArtifactPayload(path=path)


def _draw_placeholder(media: Media, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    width, height = MAX_THUMB_SIZE
    img = Image.new("RGB", (width, height), color=(34, 34, 34))
    draw = ImageDraw.Draw(img)

    if media.media_type == "video":
        tri = [(width // 3, height // 4), (width // 3, height * 3 // 4), (width * 2 // 3, height // 2)]
        draw.polygon(tri, fill=(230, 230, 230))
    else:
        draw.rectangle([width // 4, height // 4, width * 3 // 4, height * 3 // 4], outline=(220, 220, 220), width=4)
        draw.line([width // 4, height * 3 // 4, width * 3 // 4, height // 4], fill=(220, 220, 220), width=3)

    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    label = "VIDEO" if media.media_type == "video" else "MEDIA"
    text_width = draw.textlength(label, font=font)
    draw.text(((width - text_width) // 2, height - 20), label, fill=(200, 200, 200), font=font)
    img.save(dest, format="JPEG", quality=85)


def placeholder_generator(media: Media) -> Optional[ArtifactPayload]:
    path = _placeholder_path(media)
    _draw_placeholder(media, path)
    return ArtifactPayload(path=path)


__all__ = [
    "placeholder_cache_lookup",
    "placeholder_generator",
]
