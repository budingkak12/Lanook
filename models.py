from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# 数据库文件路径
DATABASE_URL = "sqlite:///./media_app.db"

# 创建数据库引擎
# connect_args 是 SQLite 特有的，为了允许多线程访问
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# 创建一个数据库会话类
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 创建所有ORM模型的基础类
Base = declarative_base()

# --- ORM 模型/表定义 ---

class Media(Base):
    """媒体信息表"""
    __tablename__ = "media"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    absolute_path = Column(String, nullable=False, unique=True)
    media_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    tags = relationship("UserTag", back_populates="media")

class User(Base):
    """用户信息表"""
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    tags = relationship("UserTag", back_populates="user")

class TagDefinition(Base):
    """预定义的标签类型表"""
    __tablename__ = "tag_definitions"
    name = Column(String, primary_key=True, index=True)

class UserTag(Base):
    """用户-媒体-标签 关联表"""
    __tablename__ = "user_tags"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    media_id = Column(Integer, ForeignKey("media.id"), nullable=False)
    tag_name = Column(String, ForeignKey("tag_definitions.name"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="tags")
    media = relationship("Media", back_populates="tags")
    __table_args__ = (UniqueConstraint('user_id', 'media_id', 'tag_name', name='_user_media_tag_uc'),)