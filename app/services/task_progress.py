from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

from sqlalchemy import func

from app.db import Media, SessionLocal
from app.db.models_extra import MediaSource
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
    """统计媒体扫描任务的进度情况。

    设计说明：
    - 优先使用 media_sources 中已配置的媒体路径（支持多个本地/SMB 源）；
    - 若尚未配置媒体源，则回退到 legacy 的单一 MEDIA_ROOT 配置；
    - total_discovered 为所有有效媒体路径的受支持文件总和，避免只看老的 sample_media 目录。
    """
    now = datetime.now(timezone.utc)
    scan_roots: list[Path | str] = []

    # 1. 优先读取媒体源表（新架构，多路径）
    has_any_source = False
    with SessionLocal() as session:
        all_sources = session.query(MediaSource).all()
        has_any_source = bool(all_sources)
        active_sources = [
            src
            for src in all_sources
            if (src.status is None or src.status == "active") and src.deleted_at is None
        ]
        for src in active_sources:
            if src.root_path:
                scan_roots.append(src.root_path)

    # 2. 如未配置媒体源，则回退到 legacy 的 MEDIA_ROOT（仅在“完全没有媒体源表记录”时）
    #    一旦用户使用了新的媒体路径管理（存在任意 MediaSource 行），则来源表成为唯一真相，
    #    删除所有媒体路径后视为“没有媒体目录”而不是退回旧的 MEDIA_ROOT 配置。
    if not scan_roots and not has_any_source:
        media_root = get_configured_media_root()
        if media_root is not None:
            scan_roots.append(media_root)

    if not scan_roots:
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
        validated_roots: list[Path | str] = []
        for root in scan_roots:
            validated_roots.append(validate_media_root(root))
    except MediaInitializationError as exc:
        return ScanTaskProgress(
            state=ScanTaskState.ERROR,
            generated_at=now,
            media_root_path=scan_roots[0] if scan_roots else None,
            scanned_count=0,
            total_discovered=None,
            remaining_count=None,
            preview_batch_size=INITIAL_PREVIEW_BATCH_SIZE,
            message=str(exc),
        )

    try:
        total_discovered = 0
        for root in validated_roots:
            total_discovered += count_supported_media(root, force_refresh=force_refresh_directory)
    except (FileNotFoundError, NotADirectoryError, PermissionError) as exc:
        return ScanTaskProgress(
            state=ScanTaskState.ERROR,
            generated_at=now,
            media_root_path=validated_roots[0] if validated_roots else None,
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
            media_root_path=validated_roots[0] if validated_roots else None,
            scanned_count=0,
            total_discovered=None,
            remaining_count=None,
            preview_batch_size=INITIAL_PREVIEW_BATCH_SIZE,
            message=f"无法统计媒体文件：{exc}",
        )

    with SessionLocal() as session:
        # 若已经采用媒体源表，则仅统计属于“活动媒体路径”的媒体；
        # legacy 场景（没有任何 MediaSource 记录）则退回到全库计数。
        has_any_source = (session.query(func.count(MediaSource.id)).scalar() or 0) > 0
        if has_any_source:
            scanned_query = (
                session.query(Media)
                .outerjoin(MediaSource, Media.source_id == MediaSource.id)
                .filter(
                    # legacy：source_id 为空的媒体（未绑定来源）
                    (Media.source_id.is_(None))
                    |
                    # 新架构：绑定到“存在且为 active 的媒体路径”的媒体
                    (
                        (Media.source_id.isnot(None))
                        & (MediaSource.id.isnot(None))
                        & (MediaSource.deleted_at.is_(None))
                        & (MediaSource.status.is_(None) | (MediaSource.status == "active"))
                    )
                )
            )
            scanned_count = scanned_query.with_entities(func.count(Media.id)).scalar() or 0
        else:
            scanned_count = session.query(func.count(Media.id)).scalar() or 0

    # 如果数据库数量已经大于文件系统统计量（例如历史配置变化），为了避免“47529%”这类极端比例，
    # 将 total_discovered 至少提升到 scanned_count。
    if total_discovered < scanned_count:
        total_discovered = scanned_count

    remaining_count = max(total_discovered - scanned_count, 0)

    # media_root_path 字段名称保留兼容性：多路径时用一个简要描述。
    if len(scan_roots) == 1:
        root_repr: Path | str | None = scan_roots[0]
    else:
        root_repr = Path("多个媒体路径")  # 仅用于展示说明

    return ScanTaskProgress(
        state=ScanTaskState.READY,
        generated_at=now,
        media_root_path=root_repr,
        scanned_count=scanned_count,
        total_discovered=total_discovered,
        remaining_count=remaining_count,
        preview_batch_size=INITIAL_PREVIEW_BATCH_SIZE,
    )
