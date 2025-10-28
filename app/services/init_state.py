from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import Optional

from fastapi import BackgroundTasks

from app.services.media_initializer import InitializationResult, MediaInitializationError, run_full_initialization


class InitializationState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class InitializationStatus:
    state: InitializationState
    message: Optional[str] = None
    media_root_path: Optional[str] = None


class InitializationCoordinator:
    """协调初始化流程，避免并发运行并对外提供状态。"""

    def __init__(self) -> None:
        self._lock = Lock()
        self._status = InitializationStatus(state=InitializationState.IDLE)

    def reset(self, *, state: InitializationState, media_root_path: Optional[str], message: Optional[str] = None) -> None:
        with self._lock:
            self._status = InitializationStatus(
                state=state,
                media_root_path=media_root_path,
                message=message,
            )

    def snapshot(self) -> InitializationStatus:
        with self._lock:
            return InitializationStatus(
                state=self._status.state,
                message=self._status.message,
                media_root_path=self._status.media_root_path,
            )

    def start(self, background_tasks: BackgroundTasks, media_root: Path) -> None:
        with self._lock:
            if self._status.state == InitializationState.RUNNING:
                raise RuntimeError("initialization already running")
            self._status = InitializationStatus(
                state=InitializationState.RUNNING,
                media_root_path=str(media_root),
                message=None,
            )
        background_tasks.add_task(self._run_task, media_root)

    def _run_task(self, media_root: Path) -> None:
        try:
            result = run_full_initialization(media_root)
        except MediaInitializationError as exc:
            self._update_status(
                state=InitializationState.FAILED,
                media_root=str(media_root),
                message=str(exc),
            )
        except Exception as exc:  # pragma: no cover - 兜底未预期异常
            self._update_status(
                state=InitializationState.FAILED,
                media_root=str(media_root),
                message=f"初始化失败：{exc}",
            )
        else:
            self._update_status(
                state=InitializationState.COMPLETED,
                media_root=str(result.media_root),
                message=f"初始化完成，新增 {result.new_media_count} 个媒体文件（共 {result.total_media_count} 个）。",
            )

    def _update_status(self, *, state: InitializationState, media_root: Optional[str], message: Optional[str]) -> None:
        with self._lock:
            self._status = InitializationStatus(
                state=state,
                media_root_path=media_root,
                message=message,
            )
