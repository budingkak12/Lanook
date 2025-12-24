"""Convenient re-exports for the database/indexing layer."""
from .base import Base, SessionLocal, engine
from .constants import (
    AUTO_SCAN_ENABLED_KEY,
    MEDIA_ROOT_KEY,
    SCAN_INTERVAL_KEY,
    SCAN_MODE_KEY,
    SUPPORTED_IMAGE_EXTS,
    SUPPORTED_VIDEO_EXTS,
)
from .models import AppSetting, FaceCluster, FaceEmbedding, Media, MediaTag, TagDefinition
from .models_extra import ClipEmbedding, Collection, CollectionItem, MediaCacheState
from .bootstrap import (
    clear_media_library,
    create_database_and_tables,
    get_setting,
    resolve_media_source,
    scan_and_populate_media,
    seed_initial_data,
    set_setting,
)

__all__ = [
    "Base",
    "SessionLocal",
    "engine",
    "AppSetting",
    "Media",
    "MediaTag",
    "TagDefinition",
    "ClipEmbedding",
    "FaceEmbedding",
    "FaceCluster",
    "MediaCacheState",
    "Collection",
    "CollectionItem",
    "AUTO_SCAN_ENABLED_KEY",
    "MEDIA_ROOT_KEY",
    "SCAN_INTERVAL_KEY",
    "SCAN_MODE_KEY",
    "SUPPORTED_IMAGE_EXTS",
    "SUPPORTED_VIDEO_EXTS",
    "clear_media_library",
    "create_database_and_tables",
    "get_setting",
    "resolve_media_source",
    "scan_and_populate_media",
    "seed_initial_data",
    "set_setting",
]
