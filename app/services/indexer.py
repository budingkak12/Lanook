from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.db import Media, MediaTag, TagDefinition
from app.services.access_layer import SourceAccessLayer


def scan_into_db(
    db: Session,
    root_url: str,
    *,
    source_id: Optional[int] = None,
    limit: Optional[int] = None,
) -> int:
    """通过统一接入层扫描来源并写入数据库。"""

    layer = SourceAccessLayer(db)
    mounted = layer.mount(root_url, source_id=source_id)
    layer.begin_scan(mounted)
    resolved_source_id = mounted.source.id
    existing = {path for (path,) in db.query(Media.absolute_path)}
    added = 0
    video_tag_ready = False

    try:
        for entry in mounted.diff(existing, limit=limit):
            media = Media(
                filename=entry.filename,
                absolute_path=entry.absolute_path,
                media_type=entry.media_type,
                source_id=resolved_source_id,
            )
            db.add(media)

            # 扫描到视频：额外打上 video 标签（用于前端/客户端按类型过滤）
            if entry.media_type == "video":
                if not video_tag_ready:
                    exists = db.query(TagDefinition).filter(TagDefinition.name == "video").first()
                    if not exists:
                        db.add(TagDefinition(name="video"))
                        db.flush()
                    video_tag_ready = True
                media.tags.append(MediaTag(tag_name="video", source_model="system", confidence=1.0))
            added += 1
        layer.complete_scan(mounted)
        db.commit()
    except Exception as exc:
        db.rollback()
        layer.fail_and_persist(mounted, exc)
        raise

    return added
