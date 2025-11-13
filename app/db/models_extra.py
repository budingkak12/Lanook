from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

# 复用现有 Base/engine
from app.db.base import Base


class MediaSource(Base):
    __tablename__ = "media_sources"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False, default="local")
    display_name = Column(String, nullable=True)
    root_path = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False, default="active", server_default="active")
    deleted_at = Column(DateTime, nullable=True)
    last_scan_at = Column(DateTime, nullable=True)


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    job_id = Column(String, primary_key=True, index=True)
    source_id = Column(Integer, nullable=False)
    state = Column(String, nullable=False, default="running")  # running/completed/failed
    scanned_count = Column(Integer, nullable=False, default=0)
    message = Column(String, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)


class AssetArtifact(Base):
    __tablename__ = "asset_artifacts"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media.id"), nullable=False, index=True)
    artifact_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="queued")  # queued/processing/ready/failed
    priority = Column(Integer, nullable=False, default=100)
    file_path = Column(String, nullable=True)
    checksum = Column(String, nullable=True)
    extra_json = Column(Text, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    queued_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("media_id", "artifact_type", name="uq_media_artifact"),)
