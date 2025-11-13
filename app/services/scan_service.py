from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import (
    SessionLocal,
    create_database_and_tables,
)
from app.db.models_extra import ScanJob
from app.services import indexer


def _safe_count_media_files(root: Path) -> int:
    cnt = 0
    exts = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv"}
    for r, _dirs, files in os.walk(root):
        for f in files:
            if Path(f).suffix.lower() in exts:
                cnt += 1
    return cnt


def start_scan_job(source_id: int, root_path: str, background: BackgroundTasks) -> str:
    job_id = str(uuid.uuid4())
    # 先落库 running 状态
    with SessionLocal() as db:
        db.add(ScanJob(job_id=job_id, source_id=source_id, state="running", scanned_count=0, started_at=datetime.utcnow()))
        db.commit()

    # 后台执行实际扫描
    background.add_task(_run_scan_job, job_id, root_path, source_id)
    return job_id


def _run_scan_job(job_id: str, root_path: str, source_id: int) -> None:
    db: Optional[Session] = None
    mounted_ok = False
    try:
        create_database_and_tables(echo=False)
        db = SessionLocal()
        scanned = scan_source_once(db, root_path, source_id=source_id)
        job = db.query(ScanJob).filter(ScanJob.job_id == job_id).first()
        if job:
            job.scanned_count = scanned
            job.state = "completed"
            job.finished_at = datetime.utcnow()
            db.commit()
    except Exception as exc:
        if db is None:
            db = SessionLocal()
        job = db.query(ScanJob).filter(ScanJob.job_id == job_id).first()
        if job:
            job.state = "failed"
            job.message = str(exc)
            job.finished_at = datetime.utcnow()
            db.commit()
    finally:
        if db is not None:
            db.close()


def scan_source_once(
    db: Session,
    root_path: str,
    *,
    source_id: Optional[int] = None,
    limit: Optional[int] = None,
) -> int:
    """执行一次扫描（统一逻辑），返回新增条目数量。"""
    # 为了与历史调用保持一致，这里只做薄封装到统一 indexer
    before = db.execute(text("SELECT COUNT(1) FROM media")).scalar() or 0
    added = indexer.scan_into_db(db, root_path, source_id=source_id, limit=limit)
    after = db.execute(text("SELECT COUNT(1) FROM media")).scalar() or 0
    # 以真实变化量为准（在极端并发情况下更稳健）
    delta = (after - before) if (after - before) >= 0 else added
    return delta if delta >= 0 else 0


def get_scan_status(job_id: str) -> Optional[ScanJob]:
    with SessionLocal() as db:
        return db.query(ScanJob).filter(ScanJob.job_id == job_id).first()
