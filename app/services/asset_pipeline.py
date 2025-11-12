from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from itertools import count
from pathlib import Path
from queue import Empty, PriorityQueue
from typing import Callable, Dict, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from 初始化数据库 import Media, SessionLocal, create_database_and_tables
from app.db.models_extra import AssetArtifact
from app.services.thumbnails_service import get_or_generate_thumbnail, resolve_cached_thumbnail


class ArtifactType(str, Enum):
    THUMBNAIL = "thumbnail"


class AssetArtifactStatus(str, Enum):
    READY = "ready"
    QUEUED = "queued"
    PROCESSING = "processing"
    FAILED = "failed"
    TIMEOUT = "timeout"


@dataclass
class ArtifactHandler:
    artifact_type: ArtifactType
    cache_lookup: Callable[[Media], Optional[Path]]
    generator: Callable[[Media], Optional[Path]]
    priority: int = 100


@dataclass
class AssetTask:
    media_id: int
    artifact_type: ArtifactType


@dataclass
class AssetArtifactResult:
    status: AssetArtifactStatus
    path: Optional[Path] = None
    detail: Optional[str] = None


class _JobSignal:
    def __init__(self) -> None:
        self.event = threading.Event()
        self._lock = threading.Lock()
        self.inflight = False
        self.status = AssetArtifactStatus.QUEUED
        self.path: Optional[str] = None
        self.error: Optional[str] = None

    def mark_enqueued(self) -> bool:
        with self._lock:
            if self.inflight:
                return False
            self.inflight = True
            self.status = AssetArtifactStatus.QUEUED
            self.path = None
            self.error = None
            self.event.clear()
            return True

    def mark_processing(self) -> None:
        with self._lock:
            self.status = AssetArtifactStatus.PROCESSING

    def mark_success(self, path: str) -> None:
        with self._lock:
            self.inflight = False
            self.status = AssetArtifactStatus.READY
            self.path = path
            self.error = None
            self.event.set()

    def mark_failure(self, message: str) -> None:
        with self._lock:
            self.inflight = False
            self.status = AssetArtifactStatus.FAILED
            self.error = message
            self.path = None
            self.event.set()

    def snapshot(self) -> tuple[AssetArtifactStatus, Optional[str], Optional[str]]:
        with self._lock:
            return self.status, self.path, self.error


class AssetPipeline:
    def __init__(self, *, worker_count: Optional[int] = None) -> None:
        self._worker_count = worker_count or int(os.environ.get("MEDIAAPP_ASSET_WORKERS", "2"))
        self._queue: PriorityQueue[tuple[int, int, Optional[AssetTask]]] = PriorityQueue()
        self._queue_counter = count()
        self._stop_event = threading.Event()
        self._workers: list[threading.Thread] = []
        self._signals: Dict[str, _JobSignal] = {}
        self._signals_lock = threading.Lock()
        self._handlers: Dict[ArtifactType, ArtifactHandler] = {}
        self.thumbnail_wait_timeout = float(os.environ.get("MEDIAAPP_THUMBNAIL_WAIT_SECS", "8"))
        self._started = False
        self._register_default_handlers()

    # ------------------------------------------------------------------
    # Public lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        if self._started:
            return
        self._stop_event.clear()
        for idx in range(max(self._worker_count, 1)):
            worker = threading.Thread(target=self._worker_loop, name=f"asset-worker-{idx}", daemon=True)
            worker.start()
            self._workers.append(worker)
        self._started = True

    def stop(self) -> None:
        if not self._started:
            return
        self._stop_event.set()
        for _ in self._workers:
            self._queue.put((0, next(self._queue_counter), None))
        for worker in self._workers:
            worker.join(timeout=2)
        self._workers.clear()
        self._started = False

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register_handler(self, handler: ArtifactHandler) -> None:
        self._handlers[handler.artifact_type] = handler

    def _register_default_handlers(self) -> None:
        self.register_handler(
            ArtifactHandler(
                artifact_type=ArtifactType.THUMBNAIL,
                cache_lookup=resolve_cached_thumbnail,
                generator=get_or_generate_thumbnail,
                priority=int(os.environ.get("MEDIAAPP_THUMBNAIL_PRIORITY", "80")),
            )
        )

    # ------------------------------------------------------------------
    # Request entrypoint
    # ------------------------------------------------------------------

    def ensure_artifact(
        self,
        *,
        media: Media,
        artifact_type: ArtifactType,
        session: Session,
        wait_timeout: Optional[float] = None,
    ) -> AssetArtifactResult:
        handler = self._handlers.get(artifact_type)
        if handler is None:
            raise ValueError(f"未注册的资产处理类型: {artifact_type}")

        wait_seconds = self.thumbnail_wait_timeout if wait_timeout is None else wait_timeout
        record = self._get_or_create_record(session, media.id, artifact_type)

        cached_path: Optional[Path] = None
        try:
            cached_path = handler.cache_lookup(media)
        except Exception:
            cached_path = None

        if cached_path:
            self._mark_record_ready(session, record, cached_path)
            self._update_signal_ready(media.id, artifact_type, cached_path)
            return AssetArtifactResult(status=AssetArtifactStatus.READY, path=cached_path)

        if record.status != AssetArtifactStatus.PROCESSING.value:
            self._mark_record_queued(session, record, handler.priority)
        signal = self._ensure_signal(media.id, artifact_type)
        if signal.mark_enqueued():
            self._enqueue_task(handler.priority, AssetTask(media_id=media.id, artifact_type=artifact_type))

        if wait_seconds <= 0:
            return AssetArtifactResult(status=AssetArtifactStatus.QUEUED)

        finished = signal.event.wait(wait_seconds)
        status, path, detail = signal.snapshot()
        if finished and status == AssetArtifactStatus.READY and path:
            return AssetArtifactResult(status=AssetArtifactStatus.READY, path=Path(path))
        if finished and status == AssetArtifactStatus.FAILED:
            return AssetArtifactResult(status=AssetArtifactStatus.FAILED, detail=detail)
        return AssetArtifactResult(status=AssetArtifactStatus.TIMEOUT)

    # ------------------------------------------------------------------
    # Queue / worker internals
    # ------------------------------------------------------------------

    def _enqueue_task(self, priority: int, task: AssetTask) -> None:
        self._queue.put((priority, next(self._queue_counter), task))

    def _worker_loop(self) -> None:
        while True:
            try:
                _priority, _idx, task = self._queue.get(timeout=0.5)
            except Empty:
                if self._stop_event.is_set():
                    break
                continue

            if task is None:
                self._queue.task_done()
                break

            try:
                self._process_task(task)
            finally:
                self._queue.task_done()

    def _process_task(self, task: AssetTask) -> None:
        handler = self._handlers.get(task.artifact_type)
        if handler is None:
            return

        signal = self._ensure_signal(task.media_id, task.artifact_type)
        signal.mark_processing()

        with SessionLocal() as session:
            record = self._get_or_create_record(session, task.media_id, task.artifact_type)
            record.status = AssetArtifactStatus.PROCESSING.value
            record.started_at = datetime.utcnow()
            record.last_error = None
            record.attempt_count = (record.attempt_count or 0) + 1
            session.commit()
            media = session.query(Media).filter(Media.id == task.media_id).first()

        if media is None:
            self._mark_failure(task.media_id, task.artifact_type, "media missing")
            signal.mark_failure("media missing")
            return

        try:
            generated = handler.generator(media)
            if generated is None or not Path(generated).exists():
                raise RuntimeError("asset generator did not produce output")
            result_path = Path(generated)
            with SessionLocal() as session:
                record = self._get_or_create_record(session, task.media_id, task.artifact_type)
                self._mark_record_ready(session, record, result_path)
            signal.mark_success(str(result_path))
        except Exception as exc:
            message = (str(exc) or exc.__class__.__name__)[:2000]
            self._mark_failure(task.media_id, task.artifact_type, message)
            signal.mark_failure(message)

    # ------------------------------------------------------------------
    # Record helpers
    # ------------------------------------------------------------------

    def _get_or_create_record(self, session: Session, media_id: int, artifact_type: ArtifactType) -> AssetArtifact:
        record = (
            session.query(AssetArtifact)
            .filter(AssetArtifact.media_id == media_id, AssetArtifact.artifact_type == artifact_type.value)
            .first()
        )
        if record:
            return record
        record = AssetArtifact(media_id=media_id, artifact_type=artifact_type.value, status=AssetArtifactStatus.QUEUED.value)
        session.add(record)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            record = (
                session.query(AssetArtifact)
                .filter(AssetArtifact.media_id == media_id, AssetArtifact.artifact_type == artifact_type.value)
                .first()
            )
            if record is None:
                raise
        return record

    def _mark_record_ready(self, session: Session, record: AssetArtifact, path: Path) -> None:
        record.status = AssetArtifactStatus.READY.value
        record.file_path = str(path)
        record.finished_at = datetime.utcnow()
        record.last_error = None
        session.commit()

    def _mark_record_queued(self, session: Session, record: AssetArtifact, priority: int) -> None:
        record.status = AssetArtifactStatus.QUEUED.value
        record.priority = priority
        record.queued_at = datetime.utcnow()
        record.file_path = None
        record.finished_at = None
        session.commit()

    def _mark_failure(self, media_id: int, artifact_type: ArtifactType, message: str) -> None:
        with SessionLocal() as session:
            record = (
                session.query(AssetArtifact)
                .filter(AssetArtifact.media_id == media_id, AssetArtifact.artifact_type == artifact_type.value)
                .first()
            )
            if not record:
                return
            record.status = AssetArtifactStatus.FAILED.value
            record.last_error = message
            record.file_path = None
            record.finished_at = datetime.utcnow()
            session.commit()

    # ------------------------------------------------------------------
    # Signal helpers
    # ------------------------------------------------------------------

    def _make_key(self, media_id: int, artifact_type: ArtifactType) -> str:
        return f"{artifact_type.value}:{media_id}"

    def _ensure_signal(self, media_id: int, artifact_type: ArtifactType) -> _JobSignal:
        key = self._make_key(media_id, artifact_type)
        with self._signals_lock:
            signal = self._signals.get(key)
            if signal is None:
                signal = _JobSignal()
                self._signals[key] = signal
            return signal

    def _update_signal_ready(self, media_id: int, artifact_type: ArtifactType, path: Path) -> None:
        signal = self._ensure_signal(media_id, artifact_type)
        signal.mark_success(str(path))


_PIPELINE_LOCK = threading.Lock()
_PIPELINE_INSTANCE: Optional[AssetPipeline] = None


def ensure_pipeline_started() -> AssetPipeline:
    global _PIPELINE_INSTANCE
    with _PIPELINE_LOCK:
        if _PIPELINE_INSTANCE is None:
            try:
                create_database_and_tables(echo=False)
            except Exception:
                pass
            _PIPELINE_INSTANCE = AssetPipeline()
            _PIPELINE_INSTANCE.start()
        else:
            _PIPELINE_INSTANCE.start()
        return _PIPELINE_INSTANCE


def shutdown_pipeline() -> None:
    global _PIPELINE_INSTANCE
    with _PIPELINE_LOCK:
        if _PIPELINE_INSTANCE is not None:
            _PIPELINE_INSTANCE.stop()
            _PIPELINE_INSTANCE = None


def request_thumbnail_artifact(media: Media, session: Session, *, wait_timeout: Optional[float] = None) -> AssetArtifactResult:
    pipeline = ensure_pipeline_started()
    return pipeline.ensure_artifact(media=media, artifact_type=ArtifactType.THUMBNAIL, session=session, wait_timeout=wait_timeout)
