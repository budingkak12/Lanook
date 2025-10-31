from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional

from sqlalchemy.orm import Session

from 初始化数据库 import SessionLocal
from app.db.models_extra import MediaSource


def list_sources(db: Optional[Session] = None) -> List[MediaSource]:
    owns = False
    if db is None:
        db = SessionLocal()
        owns = True
    try:
        return db.query(MediaSource).order_by(MediaSource.created_at.desc()).all()
    finally:
        if owns:
            db.close()


def get_source(db: Session, source_id: int) -> Optional[MediaSource]:
    return db.query(MediaSource).filter(MediaSource.id == source_id).first()


def create_source(db: Session, *, type_: str, root_path: str, display_name: Optional[str]) -> MediaSource:
    # 规范化路径并去重
    abs_path = str(Path(root_path).expanduser().resolve())
    existing = db.query(MediaSource).filter(MediaSource.root_path == abs_path).first()
    if existing:
        return existing
    ms = MediaSource(type=type_, display_name=display_name, root_path=abs_path, created_at=datetime.utcnow())
    db.add(ms)
    db.commit()
    db.refresh(ms)
    return ms


def delete_source(db: Session, source_id: int) -> bool:
    ms = db.query(MediaSource).filter(MediaSource.id == source_id).first()
    if not ms:
        return False
    db.delete(ms)
    db.commit()
    return True

