from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional

from sqlalchemy.orm import Session

from 初始化数据库 import SessionLocal
from app.db.models_extra import MediaSource


def list_sources(
    db: Optional[Session] = None,
    *,
    include_inactive: bool = True,
) -> List[MediaSource]:
    owns = False
    if db is None:
        db = SessionLocal()
        owns = True
    try:
        query = db.query(MediaSource).order_by(MediaSource.created_at.desc())
        if not include_inactive:
            query = query.filter(
                (MediaSource.status == "active") | (MediaSource.status.is_(None))
            )
        return query.all()
    finally:
        if owns:
            db.close()


def get_source(db: Session, source_id: int) -> Optional[MediaSource]:
    return db.query(MediaSource).filter(MediaSource.id == source_id).first()


def create_source(
    db: Session,
    *,
    type_: str,
    root_path: str,
    display_name: Optional[str],
) -> MediaSource:
    # 规范化路径并去重
    if type_ == "local":
        abs_path = str(Path(root_path).expanduser().resolve())
    else:
        abs_path = root_path.rstrip("/")
    existing = db.query(MediaSource).filter(MediaSource.root_path == abs_path).first()
    if existing:
        changed = False
        if existing.status != "active":
            existing.status = "active"
            existing.deleted_at = None
            changed = True
        if display_name and existing.display_name != display_name:
            existing.display_name = display_name
            changed = True
        if changed:
            db.commit()
            db.refresh(existing)
        return existing
    ms = MediaSource(
        type=type_,
        display_name=display_name,
        root_path=abs_path,
        created_at=datetime.utcnow(),
        status="active",
    )
    db.add(ms)
    db.commit()
    db.refresh(ms)
    return ms


def delete_source(db: Session, source_id: int, *, hard: bool = False) -> bool:
    ms = db.query(MediaSource).filter(MediaSource.id == source_id).first()
    if not ms:
        return False
    if hard:
        db.delete(ms)
    else:
        ms.status = "inactive"
        ms.deleted_at = datetime.utcnow()
    db.commit()
    return True


def restore_source(db: Session, source_id: int) -> Optional[MediaSource]:
    ms = db.query(MediaSource).filter(MediaSource.id == source_id).first()
    if not ms:
        return None
    if ms.status != "active" or ms.deleted_at is not None:
        ms.status = "active"
        ms.deleted_at = None
        ms.last_scan_at = ms.last_scan_at or datetime.utcnow()
    db.commit()
    db.refresh(ms)
    return ms
