from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks
from sqlalchemy import text
from sqlalchemy.orm import Session

from 初始化数据库 import (
    SessionLocal,
    create_database_and_tables,
    scan_and_populate_media,
    Media,
)
from app.services.fs_providers import is_smb_url, ro_fs_for_url
from app.db.models_extra import ScanJob


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
    """执行一次扫描（本地目录或 SMB），返回新增条目数量。"""
    if is_smb_url(root_path):
        return _scan_smb_into_db(db, root_path, source_id=source_id, limit=limit)

    resolved = str(Path(root_path).expanduser().resolve())
    before = db.execute(text("SELECT COUNT(1) FROM media")).scalar() or 0
    added = scan_and_populate_media(
        db,
        resolved,
        source_id=source_id,
        limit=limit,
    )
    after = db.execute(text("SELECT COUNT(1) FROM media")).scalar() or 0
    delta = (after - before) if (after - before) >= 0 else added
    # delta 是本轮真实新增条目数，scan_and_populate_media 返回的是扫描阶段新增
    return delta if delta >= 0 else 0


def _scan_smb_into_db(
    db: Session,
    root_url: str,
    *,
    source_id: Optional[int] = None,
    limit: Optional[int] = None,
) -> int:
    """遍历 SMB 目录并将媒体入库；按绝对 URL 去重。"""
    exts_image = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
    exts_video = {".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv"}
    existing = {path for (path,) in db.query(Media.absolute_path)}
    added = 0
    from 初始化数据库 import _resolve_media_source

    source = _resolve_media_source(
        db,
        root_url,
        source_id=source_id,
        type_="smb",
    )
    resolved_source_id = source.id if source else source_id
    with ro_fs_for_url(root_url) as (fs, inner):
        root_prefix = root_url.rstrip("/")
        base_dir = inner.rstrip("/")
        walker = fs.walk.files(base_dir) if base_dir else fs.walk.files()
        for path in walker:
            name = os.path.basename(path)
            ext = os.path.splitext(name)[1].lower()
            media_type = None
            if ext in exts_image:
                media_type = "image"
            elif ext in exts_video:
                media_type = "video"
            if not media_type:
                continue
            # 生成规范 URL
            rel = path.lstrip("/")
            url = f"{root_prefix}/" + rel
            if url in existing:
                continue
            db.add(
                Media(
                    filename=name,
                    absolute_path=url,
                    media_type=media_type,
                    source_id=resolved_source_id,
                )
            )
            added += 1
            if limit is not None and added >= limit:
                break
    if source is not None:
        source.last_scan_at = datetime.utcnow()
        if source.status != "active":
            source.status = "active"
            source.deleted_at = None
    if added or source is not None:
        db.commit()
    return added


def get_scan_status(job_id: str) -> Optional[ScanJob]:
    with SessionLocal() as db:
        return db.query(ScanJob).filter(ScanJob.job_id == job_id).first()
