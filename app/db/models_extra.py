from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint

# 复用现有 Base/engine
from app.db.base import Base


class MediaSource(Base):
    __tablename__ = "media_sources"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False, default="local")
    source_type = Column(String, nullable=False, default="local", server_default="local")
    display_name = Column(String, nullable=True)
    root_path = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False, default="active", server_default="active")
    deleted_at = Column(DateTime, nullable=True)
    last_scan_at = Column(DateTime, nullable=True)
    scan_strategy = Column(String, nullable=False, default="realtime", server_default="realtime")
    scan_interval_seconds = Column(Integer, nullable=True)
    last_scan_started_at = Column(DateTime, nullable=True)
    last_scan_finished_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    failure_count = Column(Integer, nullable=False, default=0, server_default="0")


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


class MediaCacheState(Base):
    __tablename__ = "media_cache_state"

    media_id = Column(Integer, ForeignKey("media.id"), primary_key=True)
    thumbnail_status = Column(String, nullable=False, default="unknown", server_default="unknown")
    thumbnail_updated_at = Column(DateTime, nullable=True)
    metadata_status = Column(String, nullable=False, default="unknown", server_default="unknown")
    metadata_updated_at = Column(DateTime, nullable=True)
    like_count = Column(Integer, nullable=False, default=0, server_default="0")
    favorite_count = Column(Integer, nullable=False, default=0, server_default="0")
    hit_count = Column(Integer, nullable=False, default=0, server_default="0")
    hot_score = Column(Integer, nullable=False, default=0, server_default="0")
    last_accessed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ClipEmbedding(Base):
    __tablename__ = "clip_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media.id"), nullable=False, index=True)
    model = Column(String, nullable=False, index=True)
    vector = Column(LargeBinary, nullable=False)
    dim = Column(Integer, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("media_id", "model", name="uq_clip_media_model"),)


class FaceProcessingState(Base):
    __tablename__ = "face_processing_states"

    # 以 media_id 作为主键：每个媒体在一次聚类重建后都有且仅有一条处理结果（含 0 face）。
    media_id = Column(Integer, ForeignKey("media.id"), primary_key=True)
    status = Column(String, nullable=False, default="done", server_default="done")  # done/failed
    face_count = Column(Integer, nullable=False, default=0, server_default="0")
    pipeline_signature = Column(String, nullable=True)
    last_error = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
