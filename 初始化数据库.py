import argparse
import os
from pathlib import Path
from datetime import datetime
from typing import Optional
import sys
sys.stdout.reconfigure(encoding='utf-8')


from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    text,
    inspect,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.pool import NullPool

# ===================================================================
# 1. 配置 (Configuration)
# ===================================================================

# --- !!! 请修改这里 !!! ---
# --- 请将此路径修改为你电脑上存放媒体文件的文件夹绝对路径 ---
# 示例 (Windows): "D:\\MyVideos\\ToScan"
# 示例 (macOS/Linux): "/Users/yourname/Movies/ToScan"
MEDIA_DIRECTORY_TO_SCAN = "./sample_media"  # 使用相对路径作为示例，建议使用绝对路径

# 数据库文件将创建在脚本运行的目录下
DATABASE_URL = "sqlite:///./media_app.db"

# 定义支持的媒体文件扩展名
SUPPORTED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
SUPPORTED_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv"}

# 设置键：媒体根目录
MEDIA_ROOT_KEY = "media_root_path"
# 设置键：自动扫描开关（"1" / "0"）
AUTO_SCAN_ENABLED_KEY = "auto_scan_enabled"
# 设置键：扫描模式（"realtime" / "scheduled" / "disabled"）
SCAN_MODE_KEY = "scan_mode"
# 设置键：定时扫描间隔（"hourly" / "daily" / "weekly"）
SCAN_INTERVAL_KEY = "scan_interval"


# ===================================================================
# 2. SQLAlchemy ORM 设置 (SQLAlchemy ORM Setup)
# ===================================================================

# 创建数据库引擎（禁用连接池，避免快照恢复后持有陈旧连接导致只读错误）
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=NullPool,
)

# 创建一个数据库会话类
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建所有ORM模型的基础类
Base = declarative_base()


# ===================================================================
# 3. ORM 模型/表定义 (ORM Models / Table Definitions)
#    无“用户”概念；标签为全局状态
# ===================================================================

class Media(Base):
    """媒体信息表"""
    __tablename__ = "media"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    absolute_path = Column(String, nullable=False, unique=True)
    media_type = Column(String, nullable=False)  # 'image' or 'video'
    created_at = Column(DateTime, default=datetime.utcnow)
    source_id = Column(Integer, ForeignKey("media_sources.id"), nullable=True, index=True)

    # 建立与MediaTag的关系（全局标签，无用户）
    tags = relationship("MediaTag", back_populates="media", cascade="all, delete-orphan")


class TagDefinition(Base):
    """预定义的标签类型表"""
    __tablename__ = "tag_definitions"

    name = Column(String, primary_key=True, index=True)  # e.g., 'like', 'favorite'


class MediaTag(Base):
    """媒体-标签 关联表（无用户概念，标签为全局状态）"""
    __tablename__ = "media_tags"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("media.id"), nullable=False)
    tag_name = Column(String, ForeignKey("tag_definitions.name"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 建立与Media的反向关系
    media = relationship("Media", back_populates="tags")

    # 同一媒体同一种标签只出现一次（全局）
    __table_args__ = (UniqueConstraint("media_id", "tag_name", name="_media_tag_uc"),)


class AppSetting(Base):
    """应用级配置表，存储系统设置，例如媒体根目录。"""
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)


# ===================================================================
# 4. 核心功能函数 (Core Functions)
# ===================================================================

def create_database_and_tables(echo: bool = True):
    """创建所有在Base中定义的表

    :param echo: 是否打印提示信息。用于服务端启动时减少重复日志。
    """
    # 确保扩展模型已加载（媒体来源、扫描任务等）
    try:
        import app.db.models_extra  # noqa: F401
    except Exception:
        # 导入失败不阻断主流程；后续再次调用时可补充
        pass
    if echo:
        print("正在创建数据库表...")
    Base.metadata.create_all(bind=engine)
    _ensure_schema_upgrades()
    if echo:
        print("✅ 表结构创建成功。")


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

    if "media" in table_names:
        columns = {col["name"] for col in inspector.get_columns("media")}
        if "source_id" not in columns:
            try:
                _alter("ALTER TABLE media ADD COLUMN source_id INTEGER")
            except Exception:
                pass

    _backfill_media_sources()


def seed_initial_data(db_session):
    """填充基础数据，如预定义的标签类型"""
    print("正在填充初始数据...")
    predefined_tags = ["like", "favorite"]
    for tag_name in predefined_tags:
        # 检查标签是否已存在
        existing_tag = db_session.query(TagDefinition).filter(TagDefinition.name == tag_name).first()
        if not existing_tag:
            db_session.add(TagDefinition(name=tag_name))
            print(f"  - 添加标签类型: '{tag_name}'")

    # 设置文件索引服务的默认值
    default_settings = {
        AUTO_SCAN_ENABLED_KEY: "1",  # 默认开启
        SCAN_MODE_KEY: "realtime",   # 默认实时模式
        SCAN_INTERVAL_KEY: "hourly"  # 默认每小时扫描（如果启用的话）
    }

    for key, value in default_settings.items():
        existing_setting = db_session.query(AppSetting).filter(AppSetting.key == key).first()
        if not existing_setting:
            db_session.add(AppSetting(key=key, value=value))
            print(f"  - 添加默认设置: '{key}' = '{value}'")

    db_session.commit()
    print("✅ 初始数据填充完毕。")


def _normalize_root_path(raw_path: str, *, type_: str) -> str:
    if type_ == "local":
        return str(Path(raw_path).expanduser().resolve())
    return raw_path.rstrip("/")


def _resolve_media_source(db_session, raw_path: str, *, source_id: Optional[int], type_: str):
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
        source = MediaSource(
            type=type_,
            display_name=display_name,
            root_path=normalized,
        )
        db_session.add(source)
        db_session.flush()
    else:
        if source.status != "active":
            source.status = "active"
            source.deleted_at = None
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
                target_source = _resolve_media_source(
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


def scan_and_populate_media(
    db_session,
    media_path: str,
    *,
    limit: Optional[int] = None,
    source_id: Optional[int] = None,
) -> int:
    """扫描指定目录并将媒体信息存入数据库（统一走 indexer）。

    :param limit: 当设置时，最多入库指定数量的新媒体后立即返回，
                  以便调用方可以先行提交供前端使用，再继续后续扫描。
    """
    print(f"\n正在扫描目录: {media_path}")

    from app.services.indexer import scan_into_db

    # 无论 local/SMB，统一通过 FS 层遍历并入库
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
    """删除媒体相关表中的数据，为重新初始化做准备。"""
    print("正在清空既有媒体索引...")
    deleted_tags = db_session.query(MediaTag).delete(synchronize_session=False)
    deleted_media = db_session.query(Media).delete(synchronize_session=False)
    db_session.commit()
    print(f"✅ 已清空媒体数据：删除媒体 {deleted_media} 条、关联标签 {deleted_tags} 条。")


def get_setting(db_session, key: str) -> Optional[str]:
    setting = (
        db_session.query(AppSetting)
        .filter(AppSetting.key == key)
        .first()
    )
    return setting.value if setting else None


def set_setting(db_session, key: str, value: str) -> None:
    existing = (
        db_session.query(AppSetting)
        .filter(AppSetting.key == key)
        .first()
    )
    if existing:
        existing.value = value
    else:
        db_session.add(AppSetting(key=key, value=value))


# ===================================================================
# 5. 脚本执行入口 (Script Entry Point)
# ===================================================================

if __name__ == "__main__":
    print("--- 数据库初始化脚本（无用户概念） ---")

    parser = argparse.ArgumentParser(description="初始化媒体数据库，扫描指定目录。")
    parser.add_argument(
        "--media-path",
        type=str,
        default=None,
        help="要扫描的媒体目录（绝对路径）。未指定时按环境变量 MEDIA_DIRECTORY_TO_SCAN 或默认示例目录。",
    )
    args = parser.parse_args()

    candidate_path = (
        args.media_path
        or os.environ.get("MEDIA_DIRECTORY_TO_SCAN")
        or MEDIA_DIRECTORY_TO_SCAN
    )
    resolved_media_path = Path(candidate_path).expanduser().resolve()

    # 1. 创建表结构
    create_database_and_tables()

    # 2. 获取数据库会话
    db = SessionLocal()

    try:
        # 2.1 更新媒体根目录设置
        set_setting(db, MEDIA_ROOT_KEY, str(resolved_media_path))

        # 3. 填充预定义标签
        seed_initial_data(db)

        # 3.1 清空旧数据（避免重复记录）
        clear_media_library(db)

        # 4. 扫描并入库媒体文件
        new_count = scan_and_populate_media(db, str(resolved_media_path))
        db.commit()
        print(f"✅ 初始化完成，共新增 {new_count} 个媒体文件。")
    finally:
        # 5. 关闭会话
        db.close()

    print("\n--- 初始化完成 ---")
    print(f"媒体目录：{resolved_media_path}")
    print("数据库文件 'media_app.db' 已在当前目录生成或更新。")
