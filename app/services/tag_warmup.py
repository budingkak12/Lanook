from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import Media, SessionLocal
from app.db.models_extra import MediaSource
from app.services import wd_tag_service
from app.services.exceptions import ServiceError


def _build_active_media_query(session: Session) -> tuple[bool, "Session.query"]:
    """构造“活动媒体”查询，仅包含当前仍属于活动来源的图片媒体。

    说明：
    - 若尚未启用媒体来源表（MediaSource 为空），则退回到 legacy 行为：所有 image 媒体视为活动；
    - 若存在来源记录，则仅包含：
        * 未绑定来源的媒体（source_id 为空，兼容历史数据）；
        * 绑定到 active 且未删除来源的媒体。
    """
    has_any_source = (session.query(func.count(MediaSource.id)).scalar() or 0) > 0
    query = session.query(Media).filter(Media.media_type == "image")

    if has_any_source:
        query = (
            query.outerjoin(MediaSource, Media.source_id == MediaSource.id)
            .filter(
                # legacy：未绑定来源的媒体
                (Media.source_id.is_(None))
                |
                # 新架构：绑定到 active + 未删除来源的媒体
                (
                    (Media.source_id.isnot(None))
                    & (MediaSource.id.isnot(None))
                    & (MediaSource.deleted_at.is_(None))
                    & (MediaSource.status.is_(None) | (MediaSource.status == "active"))
                )
            )
        )

    return has_any_source, query


def warmup_rebuild_tags_for_active_media(limit: Optional[int] = None) -> Optional[dict]:
    """标签暖机：对当前“活动媒体”执行一轮 rebuild_tags。

    - 通过 MediaSource 过滤掉已删除/停用的来源，只针对“活动媒体”覆盖打标；
    - 不再按目录限制，统一交由 rebuild_tags 内部的路径校验与存在性检查处理；
    - limit 参数用于控制本次参与重建的媒体数量（按 id 升序）。
    """
    db: Session = SessionLocal()
    try:
        _, active_media_query = _build_active_media_query(db)

        if limit is not None and limit > 0:
            active_media_query = active_media_query.order_by(Media.id.asc()).limit(limit)
        else:
            active_media_query = active_media_query.order_by(Media.id.asc())

        media_ids = [row[0] for row in active_media_query.with_entities(Media.id).all()]
        if not media_ids:
            print("[tag-warmup] 没有可处理的活动媒体，跳过标签暖机。")
            return None

        stats = wd_tag_service.rebuild_tags(
            db,
            base_path=None,
            media_ids=media_ids,
            batch_size=8,
            limit=None,  # 已在 active_media_query 中应用 limit，这里不再二次截断
            model_name=None,
            whitelist_path=None,
            min_confidence=None,
            max_tags_per_media=None,
        )
        summary = (
            f"processed_media={stats.get('processed_media')}, "
            f"tagged_media={stats.get('tagged_media')}, "
            f"eligible_media={stats.get('eligible_media')}"
        )
        print(f"[tag-warmup] 标签暖机完成（活动媒体）：{summary}")
        return stats
    except ServiceError as exc:
        # 模型不可用等业务异常只记录日志，不影响主流程
        print(f"[tag-warmup] 标签暖机失败：{exc}")
        return None
    except Exception as exc:  # pragma: no cover - 运行期兜底
        print(f"[tag-warmup] 未预期错误：{exc}")
        return None
    finally:
        db.close()

