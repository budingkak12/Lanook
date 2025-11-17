"""Database bootstrap helpers shared by CLI与服务端."""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import inspect, text

from .base import Base, SessionLocal, engine
from .constants import (
    AUTO_SCAN_ENABLED_KEY,
    MEDIA_ROOT_KEY,
    SCAN_INTERVAL_KEY,
    SCAN_MODE_KEY,
)
from .models import AppSetting, Media, MediaTag, TagDefinition

_DEFAULT_SCHEDULED_INTERVAL_SECONDS = 3600

# 确保终端输出在中文环境下也不会乱码
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def create_database_and_tables(echo: bool = True) -> None:
    """创建所有声明的数据库表并执行必要的 schema 补丁。"""
    try:
        # 加载扩展模型（媒体来源、任务等）
        import app.db.models_extra  # noqa: F401
    except Exception:
        pass

    if echo:
        print("正在创建数据库表...")
    Base.metadata.create_all(bind=engine)
    _ensure_schema_upgrades()
    _ensure_cache_views()
    if echo:
        print("✅ 表结构创建成功。")


def seed_initial_data(db_session) -> None:
    """填充预定义标签/系统设置。"""
    print("正在填充初始数据...")
    predefined_tags = ["like", "favorite"]
    for tag_name in predefined_tags:
        existing_tag = db_session.query(TagDefinition).filter(TagDefinition.name == tag_name).first()
        if not existing_tag:
            db_session.add(TagDefinition(name=tag_name))
            print(f"  - 添加标签类型: '{tag_name}'")

    default_settings = {
        AUTO_SCAN_ENABLED_KEY: "1",
        SCAN_MODE_KEY: "realtime",
        SCAN_INTERVAL_KEY: "hourly",
    }

    for key, value in default_settings.items():
        existing_setting = db_session.query(AppSetting).filter(AppSetting.key == key).first()
        if not existing_setting:
            db_session.add(AppSetting(key=key, value=value))
            print(f"  - 添加默认设置: '{key}' = '{value}'")

    db_session.commit()
    print("✅ 初始数据填充完毕。")


def scan_and_populate_media(
    db_session,
    media_path: str,
    *,
    limit: Optional[int] = None,
    source_id: Optional[int] = None,
) -> int:
    """扫描目录并写入媒体索引（统一走 indexer）。"""
    print(f"\n正在扫描目录: {media_path}")

    from app.services.indexer import scan_into_db

    added = scan_into_db(db_session, str(Path(media_path).expanduser()), source_id=source_id, limit=limit)

    if added > 0:
        print(f"正在将 {added} 个新媒体文件信息提交到数据库...")
        print("✅ 新媒体文件入库成功。")
        if limit is not None:
            print("⚡️ 首批媒体已准备，后台将继续扫描剩余文件。")
    else:
        print("✅ 没有发现新的媒体文件。")

    return added


def clear_media_library(db_session) -> None:
    print("正在清空既有媒体索引...")
    deleted_tags = db_session.query(MediaTag).delete(synchronize_session=False)
    deleted_media = db_session.query(Media).delete(synchronize_session=False)
    db_session.commit()
    print(f"✅ 已清空媒体数据：删除媒体 {deleted_media} 条、关联标签 {deleted_tags} 条。")


def get_setting(db_session, key: str) -> Optional[str]:
    setting = db_session.query(AppSetting).filter(AppSetting.key == key).first()
    return setting.value if setting else None


def set_setting(db_session, key: str, value: str) -> None:
    existing = db_session.query(AppSetting).filter(AppSetting.key == key).first()
    if existing:
        existing.value = value
    else:
        db_session.add(AppSetting(key=key, value=value))


# --- 内部辅助函数 ---------------------------------------------------------

def _ensure_schema_upgrades() -> None:
    inspector = inspect(engine)
    table_names = {name for name in inspector.get_table_names()}

    def _alter(statement: str) -> None:
        with engine.begin() as conn:
            conn.execute(text(statement))

    if "media_sources" in table_names:
        columns = {col["name"] for col in inspector.get_columns("media_sources")}
        if "status" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN status TEXT DEFAULT 'active'")
                _alter("UPDATE media_sources SET status = 'active' WHERE status IS NULL")
            except Exception:
                pass
        if "deleted_at" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN deleted_at DATETIME")
            except Exception:
                pass
        if "last_scan_at" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN last_scan_at DATETIME")
            except Exception:
                pass
        if "source_type" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN source_type TEXT DEFAULT 'local'")
            except Exception:
                pass
        if "scan_strategy" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN scan_strategy TEXT DEFAULT 'realtime'")
            except Exception:
                pass
        if "scan_interval_seconds" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN scan_interval_seconds INTEGER")
            except Exception:
                pass
        if "last_scan_started_at" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN last_scan_started_at DATETIME")
            except Exception:
                pass
        if "last_scan_finished_at" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN last_scan_finished_at DATETIME")
            except Exception:
                pass
        if "last_error" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN last_error TEXT")
            except Exception:
                pass
        if "failure_count" not in columns:
            try:
                _alter("ALTER TABLE media_sources ADD COLUMN failure_count INTEGER DEFAULT 0")
            except Exception:
                pass

    if "media" in table_names:
        columns = {col["name"] for col in inspector.get_columns("media")}
        if "source_id" not in columns:
            try:
                _alter("ALTER TABLE media ADD COLUMN source_id INTEGER")
            except Exception:
                pass

    _backfill_media_sources()
    repair_media_sources_metadata()


def _normalize_root_path(raw_path: str, *, type_: str) -> str:
    if type_ == "local":
        return str(Path(raw_path).expanduser().resolve())
    return raw_path.rstrip("/")


def resolve_media_source(db_session, raw_path: str, *, source_id: Optional[int], type_: str):
    from app.db.models_extra import MediaSource

    if source_id is not None:
        return (
            db_session.query(MediaSource)
            .filter(MediaSource.id == source_id)
            .first()
        )

    normalized = _normalize_root_path(raw_path, type_=type_)
    source = (
        db_session.query(MediaSource)
        .filter(MediaSource.root_path == normalized)
        .first()
    )
    if source is None:
        display_name = Path(normalized).name if type_ == "local" else normalized
        scan_strategy = "realtime" if type_ == "local" else "scheduled"
        interval_seconds = _DEFAULT_SCHEDULED_INTERVAL_SECONDS if scan_strategy == "scheduled" else None
        source = MediaSource(
            type=type_,
            source_type=type_,
            display_name=display_name,
            root_path=normalized,
            scan_strategy=scan_strategy,
            scan_interval_seconds=interval_seconds,
        )
        db_session.add(source)
        db_session.flush()
    else:
        if source.status != "active":
            source.status = "active"
            source.deleted_at = None
        if not source.source_type:
            source.source_type = source.type or type_
        if source.scan_strategy is None:
            source.scan_strategy = "realtime" if source.source_type == "local" else "scheduled"
        if source.scan_strategy == "scheduled" and source.scan_interval_seconds is None:
            source.scan_interval_seconds = _DEFAULT_SCHEDULED_INTERVAL_SECONDS
    return source


def _backfill_media_sources() -> None:
    from app.db.models_extra import MediaSource

    session = SessionLocal()
    try:
        needs_backfill = (
            session.query(Media.id)
            .filter(Media.source_id.is_(None))
            .limit(1)
            .first()
        )
        if not needs_backfill:
            return

        sources = session.query(MediaSource).all()
        target_source = None
        if len(sources) == 1:
            target_source = sources[0]
        elif len(sources) == 0:
            configured_root = get_setting(session, MEDIA_ROOT_KEY)
            if configured_root:
                target_source = resolve_media_source(
                    session,
                    configured_root,
                    source_id=None,
                    type_="local",
                )

        if target_source is None:
            return

        session.query(Media).filter(Media.source_id.is_(None)).update(
            {Media.source_id: target_source.id},
            synchronize_session=False,
        )
        if target_source.status != "active":
            target_source.status = "active"
            target_source.deleted_at = None
        if target_source.last_scan_at is None:
            target_source.last_scan_at = datetime.utcnow()
        session.commit()
    finally:
        session.close()


def repair_media_sources_metadata() -> None:
    """为 media_sources 表补齐新增字段的默认值。"""
    from app.db.models_extra import MediaSource

    session = SessionLocal()
    try:
        rows = session.query(MediaSource).all()
        if not rows:
            return
        modified = False
        for row in rows:
            legacy_type = (row.type or "local").lower()
            inferred_type = (row.source_type or legacy_type).lower()
            if inferred_type not in {"local", "smb", "webdav"}:
                inferred_type = "local"

            if row.source_type != inferred_type:
                row.source_type = inferred_type
                modified = True
            if row.type != inferred_type:
                row.type = inferred_type
                modified = True

            valid_strategies = {"realtime", "scheduled", "manual", "disabled"}
            current_strategy = row.scan_strategy if row.scan_strategy in valid_strategies else "realtime"
            desired_strategy = current_strategy
            if inferred_type != "local" and current_strategy == "realtime":
                desired_strategy = "scheduled"
            if row.scan_strategy != desired_strategy:
                row.scan_strategy = desired_strategy
                modified = True

            if row.scan_interval_seconds is None and row.scan_strategy == "scheduled":
                row.scan_interval_seconds = _DEFAULT_SCHEDULED_INTERVAL_SECONDS
                modified = True

            if row.last_scan_at and row.last_scan_started_at is None:
                row.last_scan_started_at = row.last_scan_at
                modified = True
            if row.last_scan_at and row.last_scan_finished_at is None:
                row.last_scan_finished_at = row.last_scan_at
                modified = True

            if row.failure_count is None:
                row.failure_count = 0
                modified = True

        if modified:
            session.commit()
    finally:
        session.close()


def _ensure_cache_views() -> None:
    """保证缓存视图（只读索引）存在并保持最新结构。"""

    summary_sql = text(
        """
        CREATE VIEW IF NOT EXISTS media_cached_summary AS
        SELECT
            m.id              AS media_id,
            m.filename        AS filename,
            m.media_type      AS media_type,
            m.created_at      AS created_at,
            COALESCE(c.thumbnail_status, 'unknown')     AS thumbnail_status,
            COALESCE(c.metadata_status, 'unknown')      AS metadata_status,
            COALESCE(c.like_count, 0)                   AS like_count,
            COALESCE(c.favorite_count, 0)               AS favorite_count,
            COALESCE(c.hot_score, 0)                    AS hot_score,
            COALESCE(c.hit_count, 0)                    AS hit_count,
            COALESCE(c.last_accessed_at, m.created_at)  AS last_accessed_at,
            COALESCE(c.updated_at, m.created_at)        AS cache_updated_at
        FROM media AS m
        LEFT JOIN media_cache_state AS c ON c.media_id = m.id
        """
    )

    hot_sql = text(
        """
        CREATE VIEW IF NOT EXISTS media_hot_cache AS
        SELECT
            media_id,
            hot_score,
            hit_count,
            last_accessed_at,
            cache_updated_at
        FROM media_cached_summary
        """
    )

    with engine.begin() as conn:
        # 先清理依赖视图，再重建，避免结构变化导致查询失败
        conn.execute(text("DROP VIEW IF EXISTS media_hot_cache"))
        conn.execute(text("DROP VIEW IF EXISTS media_cached_summary"))
        conn.execute(summary_sql)
        conn.execute(hot_sql)


__all__ = [
    "SessionLocal",
    "Base",
    "create_database_and_tables",
    "seed_initial_data",
    "scan_and_populate_media",
    "clear_media_library",
    "get_setting",
    "set_setting",
    "resolve_media_source",
    "repair_media_sources_metadata",
]
