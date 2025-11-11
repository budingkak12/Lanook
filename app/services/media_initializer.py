import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union

from sqlalchemy.orm import Session

from 初始化数据库 import (
    MEDIA_ROOT_KEY,
    SessionLocal,
    Media,
    clear_media_library,
    create_database_and_tables,
    get_setting,
    scan_and_populate_media,
    seed_initial_data,
    set_setting,
)
from app.services.fs_providers import is_smb_url, ro_fs_for_url, parse_smb_url
from app.services.credentials import get_smb_password


class MediaInitializationError(Exception):
    """初始化媒体库时的异常，用于向上游传递友好的错误信息。"""


@dataclass
class InitializationResult:
    media_root: Path
    new_media_count: int
    total_media_count: int


def _ensure_directory_accessible(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.exists():
        raise MediaInitializationError(f"路径不存在：{resolved}")
    if not resolved.is_dir():
        raise MediaInitializationError(f"路径不是文件夹：{resolved}")
    if not os.access(resolved, os.R_OK):
        raise MediaInitializationError(f"没有读取权限：{resolved}")
    return resolved


INITIAL_PREVIEW_BATCH_SIZE = 100


def run_full_initialization(target_path: Path, *, preview_batch_size: int = INITIAL_PREVIEW_BATCH_SIZE) -> InitializationResult:
    """执行快速的媒体库初始化流程。

    1. 校验路径可达；
    2. 创建表并确保标签设置；
    3. 清空既有索引数据；
    4. 扫描目标目录前100个文件写入数据库；
    5. 更新媒体根路径设置。

    注意：为了快速响应，只扫描前100个文件就返回，剩余文件在后续处理。
    """
    resolved = _ensure_directory_accessible(target_path)
    create_database_and_tables()

    session: Session = SessionLocal()
    try:
        # 准备基础数据
        seed_initial_data(session)

        # 清空旧数据，避免重复
        clear_media_library(session)

        # 只扫描前100个文件，快速响应用户
        preview_count = scan_and_populate_media(session, str(resolved), limit=preview_batch_size)

        # 暂时不扫描剩余文件，让用户快速进入应用
        # TODO: 后续可以添加后台任务扫描剩余文件

        # 扫描成功后再更新配置，避免失败时覆盖已有设置
        set_setting(session, MEDIA_ROOT_KEY, str(resolved))
        total_count = session.query(Media).count()
        session.commit()
        return InitializationResult(
            media_root=resolved,
            new_media_count=preview_count,
            total_media_count=total_count,
        )
    except MediaInitializationError:
        session.rollback()
        raise
    except Exception as exc:  # pragma: no cover - 运行时异常统一兜底
        session.rollback()
        raise MediaInitializationError(str(exc)) from exc
    finally:
        session.close()


def get_configured_media_root() -> Optional[Union[Path, str]]:
    """读取数据库中保存的媒体根路径。
    - 本地目录返回 Path
    - SMB 返回原始 URL 字符串
    若不存在，返回 None。
    """
    session: Session = SessionLocal()
    try:
        value = get_setting(session, MEDIA_ROOT_KEY)
        if not value:
            return None
        v = str(value)
        if v.strip().lower().startswith("smb://"):
            return v
        return Path(v)
    finally:
        session.close()


def has_indexed_media() -> bool:
    """判断数据库中是否已经存在媒体数据。"""
    session: Session = SessionLocal()
    try:
        return session.query(Media.id).limit(1).first() is not None
    finally:
        session.close()


def validate_media_root(path: Union[Path, str]) -> Union[Path, str]:
    """校验媒体根路径（不挂载）：
    - 本地目录：返回规范化后的 Path；
    - SMB URL：使用 smbprotocol 直连，打开目录并列举少量项后返回原始 URL。
    """
    # SMB URL 字符串
    if isinstance(path, str) and is_smb_url(path):
        try:
            from smbprotocol.connection import Connection
            from smbprotocol.session import Session
            from smbprotocol.tree import TreeConnect
            from smbprotocol.open import Open, CreateDisposition, CreateOptions, ShareAccess, FilePipePrinterAccessMask, ImpersonationLevel
            parts = parse_smb_url(path)
            password = get_smb_password(parts.host, parts.share, parts.username) or ""
            conn = Connection(os.urandom(16), parts.host, parts.port or 445)
            conn.connect()
            sess = Session(conn, username=parts.username or "", password=password)
            sess.connect()
            tree = TreeConnect(sess, f"\\\\{parts.host}\\{parts.share}")
            tree.connect()
            dir_rel = parts.path.replace('/', '\\') if parts.path else ""
            h = Open(tree, dir_rel)
            h.create(ImpersonationLevel.Impersonation, FilePipePrinterAccessMask.GENERIC_READ, 0, ShareAccess.FILE_SHARE_READ, CreateDisposition.FILE_OPEN, CreateOptions.FILE_DIRECTORY_FILE)
            # 列举确认可读
            _ = h.query_directory('*', 1)  # FILE_DIRECTORY_INFORMATION
            h.close(); tree.disconnect(); sess.disconnect(); conn.disconnect(True)
            return path
        except Exception as exc:
            raise MediaInitializationError(f"无法访问 SMB 目录：{path}，原因：{exc}")

    # 其他情况按本地目录处理
    if isinstance(path, str):
        return _ensure_directory_accessible(Path(path))
    return _ensure_directory_accessible(path)
