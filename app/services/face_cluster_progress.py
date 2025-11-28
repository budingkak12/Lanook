from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import List, Optional


class FaceProgressState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    CLUSTERING = "clustering"
    DONE = "done"
    ERROR = "error"


@dataclass
class FaceProgressSnapshot:
    state: FaceProgressState
    total_files: int
    processed_files: int
    eta_ms: Optional[int]
    started_at: Optional[datetime]
    updated_at: Optional[datetime]
    message: Optional[str]
    base_paths: List[str]


class FaceProgress:
    """线程安全的人脸处理进度快照，仅存放于内存。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: FaceProgressState = FaceProgressState.IDLE
        self._total_files = 0
        self._processed_files = 0
        self._started_at: Optional[datetime] = None
        self._updated_at: Optional[datetime] = None
        self._eta_ms: Optional[int] = None
        self._message: Optional[str] = None
        self._base_paths: List[str] = []

    # 内部帮助函数
    def _snapshot_unlocked(self) -> FaceProgressSnapshot:
        return FaceProgressSnapshot(
            state=self._state,
            total_files=self._total_files,
            processed_files=self._processed_files,
            eta_ms=self._eta_ms,
            started_at=self._started_at,
            updated_at=self._updated_at,
            message=self._message,
            base_paths=list(self._base_paths),
        )

    # 对外接口
    def reset(self) -> None:
        with self._lock:
            self._state = FaceProgressState.IDLE
            self._total_files = 0
            self._processed_files = 0
            self._started_at = None
            self._updated_at = None
            self._eta_ms = None
            self._message = None
            self._base_paths = []

    def start(self, *, total_files: int, base_paths: list[str]) -> None:
        now = datetime.utcnow()
        with self._lock:
            self._state = FaceProgressState.RUNNING
            self._total_files = max(int(total_files or 0), 0)
            self._processed_files = 0
            self._started_at = now
            self._updated_at = now
            self._eta_ms = None
            self._message = None
            self._base_paths = list(base_paths)

    def tick(self, step: int = 1) -> None:
        now = datetime.utcnow()
        with self._lock:
            if self._state not in {FaceProgressState.RUNNING, FaceProgressState.CLUSTERING}:
                return
            self._processed_files += max(step, 0)
            self._updated_at = now
            if self._started_at and self._processed_files > 0:
                elapsed_ms = (now - self._started_at).total_seconds() * 1000.0
                avg_ms = elapsed_ms / float(self._processed_files)
                remaining = max(self._total_files - self._processed_files, 0)
                self._eta_ms = int(avg_ms * remaining) if self._total_files > 0 else None

    def set_clustering(self) -> None:
        now = datetime.utcnow()
        with self._lock:
            if self._state in {FaceProgressState.RUNNING, FaceProgressState.CLUSTERING}:
                self._state = FaceProgressState.CLUSTERING
                self._updated_at = now
                # 进入聚类阶段后不再估算 ETA
                self._eta_ms = None

    def done(self, message: Optional[str] = None) -> None:
        now = datetime.utcnow()
        with self._lock:
            self._state = FaceProgressState.DONE
            self._updated_at = now
            self._message = message
            self._eta_ms = 0

    def error(self, message: str) -> None:
        now = datetime.utcnow()
        with self._lock:
            self._state = FaceProgressState.ERROR
            self._updated_at = now
            self._message = message
            self._eta_ms = None

    def snapshot(self) -> FaceProgressSnapshot:
        with self._lock:
            return self._snapshot_unlocked()


_FACE_PROGRESS = FaceProgress()


def get_face_progress() -> FaceProgress:
    return _FACE_PROGRESS
