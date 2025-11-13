"""Core ORM models used by the media index layer."""
from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
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

    tags = relationship("MediaTag", back_populates="media", cascade="all, delete-orphan")


class TagDefinition(Base):
    __tablename__ = "tag_definitions"

    name = Column(String, primary_key=True, index=True)


class MediaTag(Base):
    __tablename__ = "media_tags"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media.id"), nullable=False)
    tag_name = Column(String, ForeignKey("tag_definitions.name"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    media = relationship("Media", back_populates="tags")

    __table_args__ = (UniqueConstraint("media_id", "tag_name", name="_media_tag_uc"),)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
