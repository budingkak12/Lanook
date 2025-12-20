from __future__ import annotations

from typing import TypeVar

from sqlalchemy.orm import Query

from app.db import Media
from app.db.models_extra import MediaSource

TMedia = TypeVar("TMedia", bound=Media)


def active_source_predicate(*, source_cls=MediaSource):
    """统一的“活动来源”过滤条件（未删除且 active）。"""
    return (source_cls.deleted_at.is_(None)) & ((source_cls.status.is_(None)) | (source_cls.status == "active"))


def apply_active_source_filter(query: Query, *, source_cls=MediaSource) -> Query:
    """对 MediaSource 的 ORM Query 应用“活动来源”过滤。"""
    return query.filter(active_source_predicate(source_cls=source_cls))


def active_media_source_predicate(
    *,
    media_cls=Media,
    source_cls=MediaSource,
):
    """统一的“活动媒体”过滤条件。

    口径（必须与前端展示保持一致）：
    - legacy 兼容：media.source_id 为空视为活动媒体；
    - 否则：来源未删除（deleted_at 为空）且 status ∈ {NULL,'active'}。
    """
    return (media_cls.source_id.is_(None)) | (
        (source_cls.id.isnot(None))
        & (source_cls.deleted_at.is_(None))
        & ((source_cls.status.is_(None)) | (source_cls.status == "active"))
    )


def apply_active_media_filter(
    query: Query,
    *,
    media_cls=Media,
    source_cls=MediaSource,
    join_source: bool = True,
) -> Query:
    """对任意包含 media 的 ORM Query 应用“活动媒体”过滤。"""
    if join_source:
        query = query.outerjoin(source_cls, media_cls.source_id == source_cls.id)
    return query.filter(active_media_source_predicate(media_cls=media_cls, source_cls=source_cls))
