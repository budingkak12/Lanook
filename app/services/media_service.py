from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Query, Session

from app.db import Media, MediaTag, TagDefinition
from app.db.models_extra import MediaSource
from app.schemas.media import DeleteBatchResp, FailedItemModel, MediaItem, MediaMetadata, PageResponse
from app.services.asset_pipeline import (
    ArtifactType,
    AssetArtifactResult,
    AssetArtifactStatus,
    get_cached_artifact,
    request_metadata_artifact,
    request_placeholder_artifact,
    request_thumbnail_artifact,
)
from app.services.deletion_service import batch_delete as svc_batch_delete
from app.services.deletion_service import delete_media_record_and_files
from app.services.exceptions import (
    DatabaseReadOnlyError,
    FileNotFoundOnDiskError,
    InvalidRangeError,
    InvalidTagError,
    MediaNotFoundError,
    RangeNotSatisfiableError,
    SeedRequiredError,
    ServiceError,
    TagAlreadyExistsError,
    TagNotFoundError,
    ThumbnailUnavailableError,
    MetadataUnavailableError,
)
from app.services.fs_providers import is_smb_url, iter_bytes, stat_url
from app.services.thumbnails_service import build_thumb_headers


@dataclass
class ThumbnailPayload:
    path: str
    media_type: str
    headers: dict[str, str]


@dataclass
class MediaResourcePayload:
    media_type: str
    headers: dict[str, str]
    status_code: int
    stream: Iterable[bytes] | None = None
    file_path: str | None = None
    use_file_response: bool = False


def _artifact_extra_dict(result: AssetArtifactResult) -> Optional[dict]:
    if result.extra:
        return result.extra
    if result.path:
        try:
            return json.loads(result.path.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


# ---------------------------------------------------------------------------
# 公共工具
# ---------------------------------------------------------------------------

def _is_readonly_error(exc: OperationalError) -> bool:
    msg = str(exc).lower()
    return "readonly" in msg or "read-only" in msg


def _filter_active_media(query: Query) -> Query:
    return query.outerjoin(MediaSource, Media.source_id == MediaSource.id).filter(
        (Media.source_id.is_(None))
        | (MediaSource.status == "active")
        | (MediaSource.status.is_(None))
    )


def _seeded_key(seed: str, media_id: int) -> str:
    return hashlib.sha256(f"{seed}:{media_id}".encode()).hexdigest()


def _to_media_item(
    db: Session,
    media: Media,
    *,
    include_thumb: bool = False,
    include_tag_state: bool = True,
) -> MediaItem:
    liked_val: Optional[bool] = None
    favorited_val: Optional[bool] = None
    if include_tag_state:
        liked_val = (
            db.query(MediaTag)
            .filter(MediaTag.media_id == media.id, MediaTag.tag_name == "like")
            .first()
            is not None
        )
        favorited_val = (
            db.query(MediaTag)
            .filter(MediaTag.media_id == media.id, MediaTag.tag_name == "favorite")
            .first()
            is not None
        )

    created = media.created_at
    created_str = created.isoformat() if isinstance(created, datetime) else str(created)

    return MediaItem(
        id=media.id,
        url=f"/media-resource/{media.id}",
        resourceUrl=f"/media-resource/{media.id}",
        type=media.media_type,
        filename=media.filename,
        createdAt=created_str,
        thumbnailUrl=(f"/media/{media.id}/thumbnail" if include_thumb else None),
        liked=liked_val,
        favorited=favorited_val,
    )


def _require_media(db: Session, media_id: int) -> Media:
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise MediaNotFoundError("media not found")
    if not media.absolute_path or not isinstance(media.absolute_path, str):
        raise FileNotFoundOnDiskError("file not found")
    return media


def _parse_range(range_header: str, file_size: int) -> tuple[int, int]:
    try:
        units, ranges = range_header.split("=", 1)
    except ValueError:
        raise InvalidRangeError("Invalid Range header") from None
    if units.strip().lower() != "bytes":
        raise InvalidRangeError("Only bytes unit is supported")
    first_range = ranges.split(",")[0].strip()
    if "-" not in first_range:
        raise InvalidRangeError("Invalid range format")
    start_str, end_str = first_range.split("-", 1)
    if start_str == "" and end_str != "":
        suffix_len = int(end_str)
        if suffix_len <= 0:
            raise InvalidRangeError("Invalid suffix length")
        start = max(file_size - suffix_len, 0)
        end = file_size - 1
    else:
        start = int(start_str)
        end = int(end_str) if end_str != "" else file_size - 1
    if start < 0 or end < start:
        raise InvalidRangeError("Invalid range positions")
    if start >= file_size or end >= file_size:
        raise RangeNotSatisfiableError("Requested Range Not Satisfiable")
    return start, end


def _local_file_iter(path: str, start_pos: int, total_len: int, chunk_size: int = 1024 * 1024):
    def _iterator():
        with open(path, "rb") as handle:
            handle.seek(start_pos)
            remaining = total_len
            while remaining > 0:
                read_len = min(chunk_size, remaining)
                data = handle.read(read_len)
                if not data:
                    break
                yield data
                remaining -= len(data)

    return _iterator()


# ---------------------------------------------------------------------------
# 媒体列表与标签
# ---------------------------------------------------------------------------

def get_media_page(
    db: Session,
    *,
    seed: Optional[str],
    tag: Optional[str],
    offset: int,
    limit: int,
    order: str,
) -> PageResponse:
    if tag:
        tag_def = db.query(TagDefinition).filter(TagDefinition.name == tag).first()
        if not tag_def:
            raise InvalidTagError("invalid tag")
        q = (
            db.query(Media)
            .join(MediaTag, MediaTag.media_id == Media.id)
            .filter(MediaTag.tag_name == tag)
            .order_by(MediaTag.created_at.desc())
        )
        q = _filter_active_media(q)
        total_items = q.all()
        sliced = total_items[offset : offset + limit]
        items = [_to_media_item(db, m, include_thumb=True) for m in sliced]
        has_more = (offset + len(items)) < len(total_items)
        return PageResponse(items=items, offset=offset, hasMore=has_more)

    # 非标签模式需要 seed
    if seed is None or str(seed).strip() == "":
        raise SeedRequiredError("seed required when tag not provided")

    if order == "recent":
        q = _filter_active_media(db.query(Media).order_by(Media.created_at.desc()))
        total_items = q.all()
        sliced = total_items[offset : offset + limit]
        items = [_to_media_item(db, m, include_thumb=True) for m in sliced]
        has_more = (offset + len(items)) < len(total_items)
        return PageResponse(items=items, offset=offset, hasMore=has_more)

    all_items = _filter_active_media(db.query(Media)).all()
    all_items.sort(key=lambda m: _seeded_key(seed, m.id))
    liked_ids = {
        media_id for (media_id,) in db.query(MediaTag.media_id).filter(MediaTag.tag_name == "like")
    }
    ordered_items = [m for m in all_items if m.id not in liked_ids] + [m for m in all_items if m.id in liked_ids]
    sliced = ordered_items[offset : offset + limit]
    items = [_to_media_item(db, m, include_thumb=True) for m in sliced]
    has_more = (offset + len(items)) < len(ordered_items)
    return PageResponse(items=items, offset=offset, hasMore=has_more)


def add_tag(db: Session, *, media_id: int, tag: str) -> None:
    tag_def = db.query(TagDefinition).filter(TagDefinition.name == tag).first()
    if not tag_def:
        raise InvalidTagError("invalid tag")
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise MediaNotFoundError("media not found")
    existing = (
        db.query(MediaTag)
        .filter(MediaTag.media_id == media_id, MediaTag.tag_name == tag)
        .first()
    )
    if existing:
        raise TagAlreadyExistsError("tag already exists for media")
    db.add(MediaTag(media_id=media_id, tag_name=tag))
    try:
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if _is_readonly_error(exc):
            raise DatabaseReadOnlyError("database is read-only; check file permissions or restart backend") from exc
        raise ServiceError("failed to add tag") from exc


def remove_tag(db: Session, *, media_id: int, tag: str) -> None:
    mt = (
        db.query(MediaTag)
        .filter(MediaTag.media_id == media_id, MediaTag.tag_name == tag)
        .first()
    )
    if not mt:
        raise TagNotFoundError("tag not set for media")
    try:
        db.delete(mt)
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if _is_readonly_error(exc):
            raise DatabaseReadOnlyError("database is read-only; check file permissions or restart backend") from exc
        raise ServiceError("failed to remove tag") from exc


def list_tags(db: Session) -> List[str]:
    return [t.name for t in db.query(TagDefinition).all()]


# ---------------------------------------------------------------------------
# 删除
# ---------------------------------------------------------------------------

def delete_media(db: Session, *, media_id: int, delete_file: bool) -> None:
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise MediaNotFoundError("media not found")
    ok, reason = delete_media_record_and_files(db, media, delete_file=delete_file)
    if not ok:
        raise ServiceError(reason or "failed to delete media")
    try:
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if _is_readonly_error(exc):
            raise DatabaseReadOnlyError("database is read-only; check file permissions or restart backend") from exc
        raise ServiceError("failed to commit deletion") from exc


def batch_delete_media(db: Session, *, ids: List[int], delete_file: bool) -> DeleteBatchResp:
    deleted, failed = svc_batch_delete(db, ids, delete_file=delete_file)
    if not deleted and failed and len(failed) == len(ids):
        reasons = " ".join(filter(None, [f.reason or "" for f in failed])).lower()
        if "commit_failed" in reasons or "readonly" in reasons or "read-only" in reasons:
            raise DatabaseReadOnlyError("database is read-only; check file permissions or restart backend")
    return DeleteBatchResp(
        deleted=deleted,
        failed=[FailedItemModel(id=item.id, reason=item.reason) for item in failed],
    )


# ---------------------------------------------------------------------------
# 媒体资源
# ---------------------------------------------------------------------------

def get_thumbnail_payload(db: Session, *, media_id: int) -> ThumbnailPayload:
    media = _require_media(db, media_id)
    if (not is_smb_url(media.absolute_path)) and (not os.path.exists(media.absolute_path)):
        raise FileNotFoundOnDiskError("file not found")
    cached = get_cached_artifact(db, media.id, ArtifactType.THUMBNAIL)
    if cached and cached.path and cached.path.exists():
        headers = build_thumb_headers(str(cached.path))
        media_type = headers.get("Content-Type", "image/jpeg")
        return ThumbnailPayload(path=str(cached.path), media_type=media_type, headers=headers)

    result = request_thumbnail_artifact(media, db)
    if result.status == AssetArtifactStatus.READY and result.path:
        headers = build_thumb_headers(str(result.path))
        media_type = headers.get("Content-Type", "image/jpeg")
        return ThumbnailPayload(path=str(result.path), media_type=media_type, headers=headers)

    placeholder_path = _ensure_placeholder_thumbnail(db, media)
    if placeholder_path and placeholder_path.exists():
        headers = build_thumb_headers(str(placeholder_path))
        media_type = headers.get("Content-Type", "image/jpeg")
        return ThumbnailPayload(path=str(placeholder_path), media_type=media_type, headers=headers)

    raise ThumbnailUnavailableError(result.detail or "thumbnail not available")


def _ensure_placeholder_thumbnail(db: Session, media: Media) -> Optional[Path]:
    cached = get_cached_artifact(db, media.id, ArtifactType.PLACEHOLDER)
    if cached and cached.path and cached.path.exists():
        return cached.path
    result = request_placeholder_artifact(media, db, wait_timeout=2.0)
    if result.status == AssetArtifactStatus.READY and result.path and result.path.exists():
        return result.path
    return None


def get_media_metadata(db: Session, *, media_id: int, wait_timeout: Optional[float] = None) -> MediaMetadata:
    media = _require_media(db, media_id)
    payload_dict: Optional[dict] = None

    cached = get_cached_artifact(db, media.id, ArtifactType.METADATA)
    if cached:
        payload_dict = _artifact_extra_dict(cached)

    if payload_dict is None:
        result = request_metadata_artifact(media, db, wait_timeout=wait_timeout)
        if result.status != AssetArtifactStatus.READY:
            raise MetadataUnavailableError(result.detail or "metadata not available")
        payload_dict = _artifact_extra_dict(result)

    if not payload_dict:
        raise MetadataUnavailableError("metadata payload empty")

    try:
        return MediaMetadata(**payload_dict)
    except Exception as exc:
        raise MetadataUnavailableError("metadata payload invalid") from exc


def get_media_resource_payload(
    db: Session,
    *,
    media_id: int,
    range_header: Optional[str],
) -> MediaResourcePayload:
    media = _require_media(db, media_id)
    path = media.absolute_path
    is_remote = is_smb_url(path)

    guessed, _ = mimetypes.guess_type(path if not is_remote else os.path.basename(path))
    mime = guessed or ("image/jpeg" if media.media_type == "image" else "video/mp4")

    if is_remote:
        try:
            mtime, size = stat_url(path)
        except Exception as exc:
            raise FileNotFoundOnDiskError("file not found") from exc
        file_size = size
        etag = f"{mtime}-{size}"
        last_modified = None
    else:
        if not os.path.exists(path):
            raise FileNotFoundOnDiskError("file not found")
        stat = os.stat(path)
        file_size = stat.st_size
        etag = f"{int(stat.st_mtime)}-{stat.st_size}"
        last_modified = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(stat.st_mtime))

    common_headers: dict[str, str] = {"ETag": etag, "Accept-Ranges": "bytes"}
    if last_modified:
        common_headers["Last-Modified"] = last_modified

    if not range_header:
        headers = {**common_headers, "Cache-Control": "public, max-age=3600"}
        if is_remote:
            headers["Content-Length"] = str(file_size)
            stream = iter_bytes(path, 0, file_size)
            return MediaResourcePayload(
                media_type=mime,
                headers=headers,
                status_code=200,
                stream=stream,
                use_file_response=False,
            )
        return MediaResourcePayload(
            media_type=mime,
            headers=headers,
            status_code=200,
            file_path=path,
            use_file_response=True,
        )

    # Range 请求
    try:
        start, end = _parse_range(range_header, file_size)
    except ServiceError:
        raise
    except Exception as exc:  # pragma: no cover - 兜底
        raise InvalidRangeError("Invalid Range") from exc

    length = end - start + 1
    headers = {
        **common_headers,
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(length),
        "Cache-Control": "public, max-age=3600",
    }

    if is_remote:
        stream = iter_bytes(path, start, length)
    else:
        stream = _local_file_iter(path, start, length)
    return MediaResourcePayload(
        media_type=mime,
        headers=headers,
        status_code=206,
        stream=stream,
        use_file_response=False,
    )
