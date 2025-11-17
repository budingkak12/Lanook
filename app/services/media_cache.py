from __future__ import annotations

from datetime import datetime
from typing import Iterable, Sequence

from sqlalchemy import case, func, text
from sqlalchemy.orm import Session

from app.db import MediaTag
from app.db.models_extra import MediaCacheState


def _normalize_ids(media_ids: Iterable[int]) -> list[int]:
    return [mid for mid in media_ids if isinstance(mid, int)]


def record_media_hits(db: Session, media_ids: Sequence[int], weight: int = 1) -> None:
    ids = _normalize_ids(media_ids)
    if not ids:
        return
    now = datetime.utcnow()
    payloads = [
        {
            "media_id": mid,
            "hit_count": max(weight, 1),
            "hot_score": max(weight, 1),
            "ts": now,
        }
        for mid in ids
    ]
    stmt = text(
        """
        INSERT INTO media_cache_state (media_id, hit_count, hot_score, last_accessed_at, updated_at)
        VALUES (:media_id, :hit_count, :hot_score, :ts, :ts)
        ON CONFLICT(media_id) DO UPDATE SET
            hit_count = media_cache_state.hit_count + :hit_count,
            hot_score = media_cache_state.hot_score + :hot_score,
            last_accessed_at = :ts,
            updated_at = :ts
        """
    )
    db.execute(stmt, payloads)


def sync_tag_snapshot(db: Session, media_ids: Sequence[int]) -> None:
    ids = _normalize_ids(media_ids)
    if not ids:
        return

    db.flush()
    counters = (
        db.query(
            MediaTag.media_id.label("media_id"),
            func.sum(case((MediaTag.tag_name == "like", 1), else_=0)).label("like_count"),
            func.sum(case((MediaTag.tag_name == "favorite", 1), else_=0)).label("favorite_count"),
        )
        .filter(MediaTag.media_id.in_(ids))
        .group_by(MediaTag.media_id)
        .all()
    )
    counter_map = {row.media_id: row for row in counters}

    existing = (
        db.query(MediaCacheState)
        .filter(MediaCacheState.media_id.in_(ids))
        .all()
    )
    existing_map = {row.media_id: row for row in existing}
    now = datetime.utcnow()

    for media_id in ids:
        cache_row = existing_map.get(media_id)
        if cache_row is None:
            cache_row = MediaCacheState(media_id=media_id)
            db.add(cache_row)
        row_counter = counter_map.get(media_id)
        cache_row.like_count = int(getattr(row_counter, "like_count", 0) or 0)
        cache_row.favorite_count = int(getattr(row_counter, "favorite_count", 0) or 0)
        cache_row.updated_at = now


def purge_cache_for_media(db: Session, media_ids: Sequence[int]) -> None:
    ids = _normalize_ids(media_ids)
    if not ids:
        return
    db.query(MediaCacheState).filter(MediaCacheState.media_id.in_(ids)).delete(synchronize_session=False)


def mark_thumbnail_state(db: Session, media_id: int, status: str) -> None:
    _mark_artifact_state(db, media_id, field="thumbnail_status", ts_field="thumbnail_updated_at", status=status)


def mark_metadata_state(db: Session, media_id: int, status: str) -> None:
    _mark_artifact_state(db, media_id, field="metadata_status", ts_field="metadata_updated_at", status=status)


def _mark_artifact_state(db: Session, media_id: int, *, field: str, ts_field: str, status: str) -> None:
    if not isinstance(media_id, int):
        return
    cache = db.query(MediaCacheState).filter(MediaCacheState.media_id == media_id).first()
    if cache is None:
        cache = MediaCacheState(media_id=media_id)
        db.add(cache)
    now = datetime.utcnow()
    setattr(cache, field, status)
    setattr(cache, ts_field, now)
    cache.updated_at = now
