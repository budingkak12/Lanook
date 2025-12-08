"""Core ORM models used by the media index layer."""
from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import relationship

from .base import Base


class Media(Base):
    __tablename__ = "media"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    absolute_path = Column(String, nullable=False, unique=True)
    media_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    source_id = Column(Integer, ForeignKey("media_sources.id"), nullable=True, index=True)
    fingerprint = Column(String, nullable=True, unique=True, index=True)

    tags = relationship("MediaTag", back_populates="media", cascade="all, delete-orphan")
    faces = relationship("FaceEmbedding", back_populates="media", cascade="all, delete-orphan")


class TagDefinition(Base):
    __tablename__ = "tag_definitions"

    name = Column(String, primary_key=True, index=True)


class MediaTag(Base):
    __tablename__ = "media_tags"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media.id"), nullable=False)
    tag_name = Column(String, ForeignKey("tag_definitions.name"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    source_model = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)
    weight = Column(Float, nullable=True)

    media = relationship("Media", back_populates="tags")

    __table_args__ = (UniqueConstraint("media_id", "tag_name", name="_media_tag_uc"),)


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media.id"), nullable=False, index=True)
    face_index = Column(Integer, nullable=False, default=0)
    embedding = Column(LargeBinary, nullable=False)
    embedding_dim = Column(Integer, nullable=False, default=512)
    detection_confidence = Column(Float, nullable=True)
    bbox_left = Column(Integer, nullable=True)
    bbox_top = Column(Integer, nullable=True)
    bbox_width = Column(Integer, nullable=True)
    bbox_height = Column(Integer, nullable=True)
    cluster_id = Column(Integer, ForeignKey("face_clusters.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    media = relationship("Media", back_populates="faces")
    cluster = relationship("FaceCluster", back_populates="faces", foreign_keys="FaceEmbedding.cluster_id")


class FaceCluster(Base):
    __tablename__ = "face_clusters"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)
    description = Column(String, nullable=True)
    representative_media_id = Column(Integer, ForeignKey("media.id"), nullable=True)
    representative_face_id = Column(Integer, ForeignKey("face_embeddings.id"), nullable=True)
    face_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    faces = relationship(
        "FaceEmbedding",
        back_populates="cluster",
        foreign_keys="FaceEmbedding.cluster_id",
        cascade="all, delete-orphan",
    )
    representative_face = relationship(
        "FaceEmbedding",
        foreign_keys=[representative_face_id],
        post_update=True,
        uselist=False,
    )


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
