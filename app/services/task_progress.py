from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

from sqlalchemy import func

from 初始化数据库 import Media, SessionLocal
from app.services.media_initializer import (
    INITIAL_PREVIEW_BATCH_SIZE,
    MediaInitializationError,
    get_configured_media_root,
    validate_media_root,
)
from app.services.media_stats import count_supported_media


class ScanTaskState(str, Enum):
    NO_MEDIA_ROOT = "no_media_root"
    READY = "ready"
    ERROR = "error"


@dataclass
class ScanTaskProgress:
    state: ScanTaskState
    generated_at: datetime
    media_root_path: Optional[Path]
    scanned_count: int
    total_discovered: Optional[int]
    remaining_count: Optional[int]
    preview_batch_size: int
    message: Optional[str] = None


def compute_scan_task_progress(*, force_refresh_directory: bool = False) -> ScanTaskProgress:
    """统计媒体扫描任务的进度情况。"""
    now = datetime.now(timezone.utc)
    media_root = get_configured_media_root()
    if media_root is None:
        return ScanTaskProgress(
            state=ScanTaskState.NO_MEDIA_ROOT,
            generated_at=now,
            media_root_path=None,
            scanned_count=0,
            total_discovered=None,
            remaining_count=None,
            preview_batch_size=INITIAL_PREVIEW_BATCH_SIZE,
            message="尚未配置媒体目录。",
        )

    try:
        validated_root = validate_media_root(media_root)
    except MediaInitializationError as exc:
        return ScanTaskProgress(
            state=ScanTaskState.ERROR,
            generated_at=now,
            media_root_path=media_root,
            scanned_count=0,
            total_discovered=None,
            remaining_count=None,
            preview_batch_size=INITIAL_PREVIEW_BATCH_SIZE,
            message=str(exc),
        )

    try:
        total_discovered = count_supported_media(validated_root, force_refresh=force_refresh_directory)
    except (FileNotFoundError, NotADirectoryError, PermissionError) as exc:
        return ScanTaskProgress(
            state=ScanTaskState.ERROR,
            generated_at=now,
            media_root_path=validated_root,
            scanned_count=0,
            total_discovered=None,
            remaining_count=None,
            preview_batch_size=INITIAL_PREVIEW_BATCH_SIZE,
            message=str(exc),
        )
    except Exception as exc:  # pragma: no cover - 防御性兜底
        return ScanTaskProgress(
            state=ScanTaskState.ERROR,
            generated_at=now,
            media_root_path=validated_root,
            scanned_count=0,
            total_discovered=None,
            remaining_count=None,
            preview_batch_size=INITIAL_PREVIEW_BATCH_SIZE,
            message=f"无法统计媒体文件：{exc}",
        )

    with SessionLocal() as session:
        scanned_count = session.query(func.count(Media.id)).scalar() or 0

    remaining_count = max(total_discovered - scanned_count, 0)
    return ScanTaskProgress(
        state=ScanTaskState.READY,
        generated_at=now,
        media_root_path=validated_root,
        scanned_count=scanned_count,
        total_discovered=total_discovered,
        remaining_count=remaining_count,
        preview_batch_size=INITIAL_PREVIEW_BATCH_SIZE,
    )
