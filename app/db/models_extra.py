from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String

# 复用现有 Base/engine
from 初始化数据库 import Base


class MediaSource(Base):
    __tablename__ = "media_sources"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False, default="local")
    display_name = Column(String, nullable=True)
    root_path = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    job_id = Column(String, primary_key=True, index=True)
    source_id = Column(Integer, nullable=False)
    state = Column(String, nullable=False, default="running")  # running/completed/failed
    scanned_count = Column(Integer, nullable=False, default=0)
    message = Column(String, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)

