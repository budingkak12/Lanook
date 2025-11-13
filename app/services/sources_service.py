from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.db.models_extra import MediaSource

DEFAULT_SCHEDULED_INTERVAL_SECONDS = 3600


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
    scan_strategy: Optional[str] = None,
    scan_interval_seconds: Optional[int] = None,
) -> MediaSource:
    # 规范化路径并去重
    if type_ == "local":
        abs_path = str(Path(root_path).expanduser().resolve())
    else:
        abs_path = root_path.rstrip("/")
    valid_strategies = {"realtime", "scheduled", "manual", "disabled"}
    normalized_strategy = (scan_strategy or "").lower()
    if normalized_strategy not in valid_strategies:
        normalized_strategy = None
    base_strategy = "realtime" if type_ == "local" else "scheduled"
    effective_strategy = normalized_strategy or base_strategy
    interval_override = scan_interval_seconds if (scan_interval_seconds is not None and scan_interval_seconds > 0) else None
    scan_interval = None
    if effective_strategy == "scheduled":
        scan_interval = interval_override or DEFAULT_SCHEDULED_INTERVAL_SECONDS
    elif interval_override is not None:
        scan_interval = interval_override
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
        if existing.source_type != type_:
            existing.source_type = type_
            changed = True
        if existing.type != type_:
            existing.type = type_
            changed = True
        current_strategy = existing.scan_strategy or base_strategy
        if existing.source_type != "local" and current_strategy == "realtime" and normalized_strategy is None:
            current_strategy = "scheduled"
        target_strategy = normalized_strategy or current_strategy
        if target_strategy not in valid_strategies:
            target_strategy = base_strategy
        if existing.scan_strategy != target_strategy:
            existing.scan_strategy = target_strategy
            changed = True
        if target_strategy == "scheduled":
            desired_interval = interval_override or existing.scan_interval_seconds or DEFAULT_SCHEDULED_INTERVAL_SECONDS
        else:
            desired_interval = interval_override
        if existing.scan_interval_seconds != desired_interval:
            existing.scan_interval_seconds = desired_interval
            changed = True
        if changed:
            db.commit()
            db.refresh(existing)
        return existing
    ms = MediaSource(
        type=type_,
        source_type=type_,
        display_name=display_name,
        root_path=abs_path,
        created_at=datetime.utcnow(),
        status="active",
        scan_strategy=effective_strategy,
        scan_interval_seconds=scan_interval,
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
