from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Dict

from sqlalchemy import func, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Query, Session

from app.db import Media, MediaTag, TagDefinition
from app.db.models_extra import MediaSource
from app.services import media_cache
from app.schemas.media import DeleteBatchResp, FailedItemModel, MediaItem, MediaMetadata, PageResponse
from app.services.asset_pipeline import (
    ArtifactType,
    AssetArtifactResult,
    AssetArtifactStatus,
    get_cached_artifact,
    request_metadata_artifact,
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
from app.services.thumbnails_service import build_thumb_headers, get_or_generate_thumbnail
from app.services import clip_service
from app.services import fs_service


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
    """仅返回“活动来源”的媒体。

    约定：
    - legacy 数据允许 source_id 为空；
    - 来源被删除（deleted_at 非空）或停用（status != active）后，其媒体不应出现在列表/搜索结果中。
    """
    return (
        query.outerjoin(MediaSource, Media.source_id == MediaSource.id)
        .filter(
            (Media.source_id.is_(None))
            | (
                (MediaSource.id.isnot(None))
                & (MediaSource.deleted_at.is_(None))
                & ((MediaSource.status.is_(None)) | (MediaSource.status == "active"))
            )
        )
    )


def _ensure_fingerprint(db: Session, media: Media) -> Optional[str]:
    if media.fingerprint:
        return media.fingerprint
    try:
        fp = fs_service.compute_fingerprint(Path(media.absolute_path))
    except Exception:
        return None
    media.fingerprint = fp
    try:
        db.flush()
    except Exception:
        db.rollback()
    return fp


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

    fingerprint = _ensure_fingerprint(db, media)

    return MediaItem(
        id=media.id,
        url=f"/media-resource/{media.id}",
        resourceUrl=f"/media-resource/{media.id}",
        type=media.media_type,
        filename=media.filename,
        createdAt=created_str,
        thumbnailUrl=(f"/media/{fingerprint}/thumbnail" if include_thumb and fingerprint else None),
        liked=liked_val,
        favorited=favorited_val,
        fingerprint=fingerprint,
    )


def _require_media(db: Session, media_id: int) -> Media:
    media = _filter_active_media(db.query(Media).filter(Media.id == media_id)).first()
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


def _safe_cache_commit(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()


def _record_cache_hits(db: Session, media_ids: Sequence[int]) -> None:
    ids = [int(mid) for mid in media_ids if isinstance(mid, int)]
    if not ids:
        return
    try:
        media_cache.record_media_hits(db, ids)
        _safe_cache_commit(db)
    except Exception:
        db.rollback()


def _derive_seed_numbers(seed: str) -> tuple[int, int]:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    factor = int(digest[:8], 16) or 1
    modulus = int(digest[8:16], 16) or 2147483647
    if modulus <= factor:
        modulus = 2147483647
    return factor, modulus


def _query_cached_media_rows(
    db: Session,
    *,
    order_clause: str,
    offset: int,
    limit: int,
    extra_params: Optional[dict[str, int]] = None,
):
    if limit <= 0:
        return [], False
    sql = text(
        f"""
        SELECT media_id, filename, media_type, created_at, like_count, favorite_count
        FROM media_cached_summary
        ORDER BY {order_clause}
        LIMIT :page_limit OFFSET :offset
        """
    )
    params: dict[str, int] = {"page_limit": limit + 1, "offset": max(offset, 0)}
    if extra_params:
        params.update(extra_params)
    rows = db.execute(sql, params).fetchall()
    has_more = len(rows) > limit
    return rows[:limit], has_more


def _rows_to_media_items(db: Session, rows) -> List[MediaItem]:
    items: List[MediaItem] = []
    for row in rows:
        mapping = row._mapping
        media_id = int(mapping["media_id"])
        created = mapping["created_at"]
        created_str = created.isoformat() if isinstance(created, datetime) else str(created)
        media = db.query(Media).filter(Media.id == media_id).first()
        fingerprint: Optional[str] = None
        if media and media.absolute_path:
            fingerprint = _ensure_fingerprint(db, media)
        items.append(
            MediaItem(
                id=media_id,
                url=f"/media-resource/{media_id}",
                resourceUrl=f"/media-resource/{media_id}",
                type=str(mapping["media_type"]),
                filename=str(mapping["filename"]),
                createdAt=created_str,
                thumbnailUrl=(f"/media/{fingerprint}/thumbnail" if fingerprint else None),
                liked=bool(mapping["like_count"]),
                favorited=bool(mapping["favorite_count"]),
                fingerprint=fingerprint,
            )
        )
    return items


# -----------------------------------------------
# 文本检索（WD 标签匹配 + Chinese-CLIP）
# -----------------------------------------------

_CLIP_SCORE_THRESHOLD = 0.25


def _tokenize_query(text_val: str) -> List[str]:
    parts = re.split(r"[\\s,，。；;、]+", text_val or "")
    tokens = [p.strip() for p in parts if p and p.strip()]
    return tokens


def _search_media_by_tags(db: Session, tokens: List[str]) -> Dict[int, float]:
    if not tokens:
        return {}
    tag_names: set[str] = set()
    for token in tokens:
        rows = (
            db.query(TagDefinition.name)
            .filter(TagDefinition.name.ilike(f"%{token}%"))
            .limit(100)
            .all()
        )
        for (name,) in rows:
            tag_names.add(name)
    if not tag_names:
        return {}
    rows = (
        db.query(MediaTag.media_id, func.max(MediaTag.confidence))
        .filter(MediaTag.tag_name.in_(tag_names))
        .group_by(MediaTag.media_id)
        .all()
    )
    scores: Dict[int, float] = {}
    for mid, conf in rows:
        base = float(conf or 0.6)
        # 给 WD 标签匹配一个中等分值，便于与 CLIP 分融合
        score = max(_CLIP_SCORE_THRESHOLD, min(1.0, base))
        scores[int(mid)] = max(scores.get(int(mid), 0.0), score)
    return scores


def _search_media_by_text(
    db: Session,
    *,
    query_text: str,
    tag: Optional[str],
    offset: int,
    limit: int,
) -> PageResponse:
    tokens = _tokenize_query(query_text)

    clip_top_k = max(limit + offset + 50, 100)
    clip_payload = clip_service.search(
        db,
        query_text=query_text,
        image_id=None,
        top_k=clip_top_k,
        model_name="chinese-clip",
    )

    clip_scores: Dict[int, float] = {}
    for item in clip_payload.get("items", []):
        score = float(item.get("score") or 0.0)
        if score < _CLIP_SCORE_THRESHOLD:
            continue
        clip_scores[int(item["mediaId"])] = score

    tag_scores = _search_media_by_tags(db, tokens)

    combined: Dict[int, float] = {}
    for mid, sc in clip_scores.items():
        combined[mid] = max(combined.get(mid, 0.0), sc)
    for mid, sc in tag_scores.items():
        combined[mid] = max(combined.get(mid, 0.0), sc)

    if tag:
        tag_def = db.query(TagDefinition).filter(TagDefinition.name == tag).first()
        if not tag_def:
            raise InvalidTagError("invalid tag")
        allowed_ids = {
            mid
            for (mid,) in db.query(MediaTag.media_id)
            .filter(MediaTag.tag_name == tag, MediaTag.media_id.in_(combined.keys()))
            .all()
        }
        combined = {mid: sc for mid, sc in combined.items() if mid in allowed_ids}

    if not combined:
        return PageResponse(items=[], offset=offset, hasMore=False)

    # 关键点：offset/limit 必须基于“活动媒体”口径计算，否则前端用 mediaItems.length 作为 offset 时
    # 会出现“返回少于 limit 但 hasMore=true”导致无限请求/重复项的问题。
    sorted_pairs = sorted(combined.items(), key=lambda kv: (-kv[1], kv[0]))
    candidate_ids = [mid for mid, _ in sorted_pairs]

    active_ids = {
        int(mid)
        for (mid,) in _filter_active_media(
            db.query(Media.id).filter(Media.id.in_(candidate_ids))
        ).all()
    }
    filtered_pairs = [pair for pair in sorted_pairs if pair[0] in active_ids]

    if not filtered_pairs or offset >= len(filtered_pairs):
        return PageResponse(items=[], offset=offset, hasMore=False)

    page_slice = filtered_pairs[offset : offset + limit + 1]
    has_more = len(page_slice) > limit
    page_ids = [mid for mid, _ in page_slice[:limit]]

    media_rows = (
        _filter_active_media(db.query(Media).filter(Media.id.in_(page_ids)))
        .all()
    )
    media_map = {m.id: m for m in media_rows}
    items: List[MediaItem] = []
    for mid in page_ids:
        media = media_map.get(mid)
        if not media:
            continue
        items.append(_to_media_item(db, media, include_thumb=True))

    _record_cache_hits(db, [item.id for item in items])
    return PageResponse(items=items, offset=offset, hasMore=has_more)


# ---------------------------------------------------------------------------
# 媒体列表与标签
# ---------------------------------------------------------------------------

def get_media_page(
    db: Session,
    *,
    seed: Optional[str],
    tag: Optional[str],
    query_text: Optional[str],
    offset: int,
    limit: int,
    order: str,
) -> PageResponse:
    # 文本检索模式：支持 WD 标签匹配 + Chinese-CLIP，允许与标签组合过滤
    if query_text:
        return _search_media_by_text(db, query_text=query_text, tag=tag, offset=offset, limit=limit)

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
        rows = q.offset(offset).limit(limit + 1).all()
        sliced = rows[:limit]
        items = [_to_media_item(db, m, include_thumb=True) for m in sliced]
        has_more = len(rows) > limit
        _record_cache_hits(db, [m.id for m in sliced])
        return PageResponse(items=items, offset=offset, hasMore=has_more)

    # 非标签模式需要 seed
    if seed is None or str(seed).strip() == "":
        raise SeedRequiredError("seed required when tag not provided")

    if order == "recent":
        rows, has_more = _query_cached_media_rows(
            db,
            order_clause="created_at DESC, media_id DESC",
            offset=offset,
            limit=limit,
        )
    else:
        seed_factor, seed_mod = _derive_seed_numbers(seed)
        rows, has_more = _query_cached_media_rows(
            db,
            order_clause="((media_id * :seed_factor) % :seed_mod) ASC, hot_score DESC, created_at DESC",
            offset=offset,
            limit=limit,
            extra_params={"seed_factor": seed_factor, "seed_mod": seed_mod},
        )
    items = _rows_to_media_items(db, rows)
    _record_cache_hits(db, [item.id for item in items])
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
    db.add(MediaTag(media_id=media_id, tag_name=tag, source_model="manual", confidence=1.0))
    media_cache.sync_tag_snapshot(db, [media_id])
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
        media_cache.sync_tag_snapshot(db, [media_id])
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if _is_readonly_error(exc):
            raise DatabaseReadOnlyError("database is read-only; check file permissions or restart backend") from exc
        raise ServiceError("failed to remove tag") from exc


def list_tags(db: Session) -> List[str]:
    rows = (
        db.query(TagDefinition.name)
        .join(MediaTag, MediaTag.tag_name == TagDefinition.name)
        .distinct()
        .order_by(TagDefinition.name)
        .all()
    )
    return [name for (name,) in rows]


# -------- 标签译文支持 --------
_TAG_TRANSLATION_CACHE: Dict[str, str] | None = None
_TAG_TRANSLATION_MTIME: float | None = None
_TRANSLATION_NORMALIZE_PATTERN = re.compile(r"[()\s-]+")


def _normalize_tag_key(tag: str) -> str:
    """Normalize CSV keys (spaces/brackets/dashes) to WD 的下划线形式。"""
    normalized = tag.strip().lower()
    if not normalized:
        return ""
    normalized = _TRANSLATION_NORMALIZE_PATTERN.sub("_", normalized)
    normalized = re.sub(r"_+", "_", normalized)
    return normalized.strip("_")


def _load_tag_translations() -> Dict[str, str]:
    """
    从 data/tags-translate.csv 读取译表：每行 `英文,译文`，无表头。
    - 文件缺失或读取失败返回空表
    - 格式要求恰好一个逗号；遇到格式错误返回空表（与安卓端容错一致）
    - 基于文件 mtime 做简易缓存
    """
    global _TAG_TRANSLATION_CACHE, _TAG_TRANSLATION_MTIME
    file_path = Path(__file__).resolve().parent.parent / "data" / "tags-translate.csv"

    try:
        mtime = file_path.stat().st_mtime
    except FileNotFoundError:
        _TAG_TRANSLATION_CACHE = {}
        _TAG_TRANSLATION_MTIME = None
        return {}

    if _TAG_TRANSLATION_CACHE is not None and _TAG_TRANSLATION_MTIME == mtime:
        return _TAG_TRANSLATION_CACHE

    try:
        content = file_path.read_text(encoding="utf-8")
        result: Dict[str, str] = {}
        for raw in content.splitlines():
            line = raw.strip()
            if not line:
                continue
            if line.count(",") != 1:
                raise ValueError(f"invalid csv line: {line}")
            en, zh = [p.strip() for p in line.split(",", 1)]
            if en and zh:
                result[en] = zh
                normalized = _normalize_tag_key(en)
                if normalized and normalized not in result:
                    result[normalized] = zh
        _TAG_TRANSLATION_CACHE = result
        _TAG_TRANSLATION_MTIME = mtime
        return result
    except Exception:
        _TAG_TRANSLATION_CACHE = {}
        _TAG_TRANSLATION_MTIME = mtime
        return {}


def list_tags_with_translation(db: Session) -> List[Dict[str, str | None]]:
    translations = _load_tag_translations()
    tags = list_tags(db)
    enriched: List[Dict[str, str | None]] = []
    for name in tags:
        display = translations.get(name)
        if display is None:
            display = translations.get(_normalize_tag_key(name))
        enriched.append({"name": name, "display_name": display})
    return enriched


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
    media_cache.purge_cache_for_media(db, [media_id])
    try:
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if _is_readonly_error(exc):
            raise DatabaseReadOnlyError("database is read-only; check file permissions or restart backend") from exc
        raise ServiceError("failed to commit deletion") from exc


def batch_delete_media(db: Session, *, ids: List[int], delete_file: bool) -> DeleteBatchResp:
    deleted, failed = svc_batch_delete(db, ids, delete_file=delete_file)
    if deleted:
        media_cache.purge_cache_for_media(db, deleted)
        _safe_cache_commit(db)
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

def _resolve_media_by_key(db: Session, key: str) -> Media:
    media: Optional[Media] = None
    if key.isdigit():
        media = _require_media(db, int(key))
    else:
        media = _filter_active_media(db.query(Media).filter(Media.fingerprint == key)).first()
        if not media:
            raise MediaNotFoundError("media not found")
    return media


def get_thumbnail_payload(db: Session, *, key: str) -> ThumbnailPayload:
    media = _resolve_media_by_key(db, key)
    if (not is_smb_url(media.absolute_path)) and (not os.path.exists(media.absolute_path)):
        raise FileNotFoundOnDiskError("file not found")

    fingerprint = _ensure_fingerprint(db, media)
    if not fingerprint:
        raise ThumbnailUnavailableError("fingerprint unavailable")

    dest = fs_service.thumb_path_for_fingerprint(fingerprint)
    if not dest.exists():
        ok = fs_service.generate_thumbnail(Path(media.absolute_path), dest, max_size=(480, 480))
        if not ok or not dest.exists():
            raise ThumbnailUnavailableError("thumbnail not available")

    headers = build_thumb_headers(str(dest))
    media_type = headers.get("Content-Type", "image/jpeg")
    return ThumbnailPayload(path=str(dest), media_type=media_type, headers=headers)


def get_media_metadata(db: Session, *, media_id: int, wait_timeout: Optional[float] = None) -> MediaMetadata:
    media = _require_media(db, media_id)
    payload_dict: Optional[dict] = None

    cached = get_cached_artifact(db, media.id, ArtifactType.METADATA)
    if cached:
        payload_dict = _artifact_extra_dict(cached)
        if payload_dict:
            media_cache.mark_metadata_state(db, media.id, "ready")
            _safe_cache_commit(db)

    if payload_dict is None:
        result = request_metadata_artifact(media, db, wait_timeout=wait_timeout)
        if result.status != AssetArtifactStatus.READY:
            media_cache.mark_metadata_state(db, media.id, result.status.value.lower())
            _safe_cache_commit(db)
            raise MetadataUnavailableError(result.detail or "metadata not available")
        payload_dict = _artifact_extra_dict(result)

    if not payload_dict:
        media_cache.mark_metadata_state(db, media.id, "missing")
        _safe_cache_commit(db)
        raise MetadataUnavailableError("metadata payload empty")

    try:
        model = MediaMetadata(**payload_dict)
        media_cache.mark_metadata_state(db, media.id, "ready")
        _safe_cache_commit(db)
        return model
    except Exception as exc:
        media_cache.mark_metadata_state(db, media.id, "invalid")
        _safe_cache_commit(db)
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
