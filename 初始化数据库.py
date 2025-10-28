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
    if echo:
        print("正在创建数据库表...")
    Base.metadata.create_all(bind=engine)
    if echo:
        print("✅ 表结构创建成功。")


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

    db_session.commit()
    print("✅ 初始数据填充完毕。")


def scan_and_populate_media(db_session, media_path: str, *, limit: Optional[int] = None) -> int:
    """扫描指定目录并将媒体信息存入数据库。

    :param limit: 当设置时，最多入库指定数量的新媒体后立即返回，
                  以便调用方可以先行提交供前端使用，再继续后续扫描。
    """
    print(f"\n正在扫描目录: {media_path}")

    # 检查目录是否存在
    if not os.path.isdir(media_path):
        raise FileNotFoundError(f"目录 '{media_path}' 不存在。")

    # 获取数据库中已存在的所有路径，用于去重
    existing_paths = {path for (path,) in db_session.query(Media.absolute_path)}
    print(f"数据库中已存在 {len(existing_paths)} 个媒体记录。")

    new_files_count = 0
    limit_reached = False
    for root, _, files in os.walk(media_path):
        for filename in files:
            file_ext = os.path.splitext(filename)[1].lower()
            media_type = None

            if file_ext in SUPPORTED_IMAGE_EXTS:
                media_type = "image"
            elif file_ext in SUPPORTED_VIDEO_EXTS:
                media_type = "video"

            if media_type:
                # 使用 pathlib 获取规范化的绝对路径
                absolute_path = str(Path(root) / filename)

                # 如果路径未在数据库中，则添加
                if absolute_path not in existing_paths:
                    new_media = Media(
                        filename=filename,
                        absolute_path=absolute_path,
                        media_type=media_type,
                    )
                    db_session.add(new_media)
                    new_files_count += 1
                    print(f"  - [发现新文件] 类型: {media_type}, 路径: {filename}")
                    existing_paths.add(absolute_path)
                    if limit is not None and new_files_count >= limit:
                        limit_reached = True
                        break
        if limit_reached:
            break

    if new_files_count > 0:
        print(f"正在将 {new_files_count} 个新媒体文件信息提交到数据库...")
        db_session.commit()
        print("✅ 新媒体文件入库成功。")
        if limit_reached:
            print("⚡️ 首批媒体已准备，后台将继续扫描剩余文件。")
    else:
        print("✅ 没有发现新的媒体文件。")
    return new_files_count


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
