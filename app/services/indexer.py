from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.db import Media
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

    try:
        for entry in mounted.diff(existing, limit=limit):
            db.add(
                Media(
                    filename=entry.filename,
                    absolute_path=entry.absolute_path,
                    media_type=entry.media_type,
                    source_id=resolved_source_id,
                )
            )
            added += 1
        layer.complete_scan(mounted)
        db.commit()
    except Exception as exc:
        db.rollback()
        layer.fail_and_persist(mounted, exc)
        raise

    return added
