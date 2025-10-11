import os
import sys
from pathlib import Path
from datetime import datetime

from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# ===================================================================
# 1. 配置 (Configuration)
# ===================================================================

# --- !!! 请修改这里 !!! ---
# --- 请将此路径修改为你电脑上存放媒体文件的文件夹绝对路径 ---
# 示例 (Windows): "D:\\MyVideos\\ToScan"
# 示例 (macOS/Linux): "/Users/yourname/Movies/ToScan"
MEDIA_DIRECTORY_TO_SCAN = "./abc"  # 使用相对路径作为示例，建议使用绝对路径

# 数据库文件将创建在脚本运行的目录下
DATABASE_URL = "sqlite:///./media_app.db"

# 定义支持的媒体文件扩展名
SUPPORTED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
SUPPORTED_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv"}


# ===================================================================
# 2. SQLAlchemy ORM 设置 (SQLAlchemy ORM Setup)
# ===================================================================

# 创建数据库引擎
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

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


# ===================================================================
# 4. 核心功能函数 (Core Functions)
# ===================================================================

def create_database_and_tables():
    """创建所有在Base中定义的表"""
    print("正在创建数据库表...")
    Base.metadata.create_all(bind=engine)
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


def scan_and_populate_media(db_session, media_path: str):
    """扫描指定目录并将媒体信息存入数据库"""
    print(f"\n正在扫描目录: {media_path}")

    # 检查目录是否存在
    if not os.path.isdir(media_path):
        print(f"❌ 错误: 目录 '{media_path}' 不存在。请检查 `MEDIA_DIRECTORY_TO_SCAN` 配置。")
        sys.exit(1)

    # 获取数据库中已存在的所有路径，用于去重
    existing_paths = {path for (path,) in db_session.query(Media.absolute_path)}
    print(f"数据库中已存在 {len(existing_paths)} 个媒体记录。")

    new_files_count = 0
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

    if new_files_count > 0:
        print(f"正在将 {new_files_count} 个新媒体文件信息提交到数据库...")
        db_session.commit()
        print("✅ 新媒体文件入库成功。")
    else:
        print("✅ 没有发现新的媒体文件。")


# ===================================================================
# 5. 脚本执行入口 (Script Entry Point)
# ===================================================================

if __name__ == "__main__":
    print("--- 数据库初始化脚本（无用户概念） ---")

    # 1. 创建表结构
    create_database_and_tables()

    # 2. 获取数据库会话
    db = SessionLocal()

    try:
        # 3. 填充预定义标签
        seed_initial_data(db)

        # 4. 扫描并入库媒体文件
        scan_and_populate_media(db, MEDIA_DIRECTORY_TO_SCAN)
    finally:
        # 5. 关闭会话
        db.close()

    print("\n--- 初始化完成 ---")
    print("数据库文件 'media_app.db' 已在当前目录生成或更新。")