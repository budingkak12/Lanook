from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from sqlalchemy import or_

from 初始化数据库 import (
    AUTO_SCAN_ENABLED_KEY,
    SessionLocal,
    get_setting,
    set_setting,
    create_database_and_tables,
)
from app.db.models_extra import MediaSource
from app.services.fs_providers import is_smb_url
from app.services.media_initializer import get_configured_media_root
from app.services.scan_service import scan_source_once


_STATE_ATTR = "auto_scan_service"
_DEFAULT_ENABLED = True


def _normalize_bool(value: Optional[str], *, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def get_auto_scan_enabled(*, default: bool = _DEFAULT_ENABLED) -> bool:
    session = SessionLocal()
    try:
        stored = get_setting(session, AUTO_SCAN_ENABLED_KEY)
        if stored is None:
            set_setting(session, AUTO_SCAN_ENABLED_KEY, "1" if default else "0")
            session.commit()
            return default
        return _normalize_bool(stored, default=default)
    finally:
        session.close()


def set_auto_scan_enabled(enabled: bool) -> None:
    session = SessionLocal()
    try:
        set_setting(session, AUTO_SCAN_ENABLED_KEY, "1" if enabled else "0")
        session.commit()
    finally:
        session.close()


@dataclass
class AutoScanRuntimeStatus:
    enabled: bool
    active: bool
    message: Optional[str]


DEFAULT_IDLE_SECONDS = 60.0


def _normalize_path_key(raw: str | Path) -> str:
    raw_str = str(raw)
    if is_smb_url(raw_str):
        return raw_str.rstrip("/")
    return str(Path(raw_str).expanduser().resolve())


class AutoScanService:
    def __init__(self, *, idle_seconds: float = DEFAULT_IDLE_SECONDS) -> None:
        self._lock = threading.RLock()
        self._workers: Dict[str, _ScanWorker] = {}
        self._idle_seconds = idle_seconds
        self._last_error: Optional[str] = None
        self._running = False

    @property
    def is_active(self) -> bool:
        with self._lock:
            if not self._running:
                return False
            return any(worker.is_alive for worker in self._workers.values())

    @property
    def last_error(self) -> Optional[str]:
        with self._lock:
            if self._last_error:
                return self._last_error
            for worker in self._workers.values():
                if worker.last_error:
                    return worker.last_error
            return None

    def start(self) -> tuple[bool, Optional[str]]:
        with self._lock:
            targets = self._collect_targets()
            if not targets:
                message = "尚未配置媒体目录，自动扫描暂不可用。"
                self._last_error = message
                self._running = False
                return False, message

            create_database_and_tables(echo=False)
            self._running = True
            self._last_error = None
            self._sync_workers(targets)
            print(f"[auto-scan] 已启动 {len(self._workers)} 个目录扫描任务。")
            return True, None

    def stop(self, *, clear_error: bool = True) -> None:
        with self._lock:
            for worker in self._workers.values():
                worker.stop()
            self._workers.clear()
            self._running = False
            if clear_error:
                self._last_error = None

    def register_path(self, path: str | Path) -> None:
        """注册新的扫描路径；服务运行时会立即创建/唤醒对应 worker。"""
        normalized = _normalize_path_key(path)
        with self._lock:
            if self._running:
                self._ensure_worker(normalized, str(path))
                return

        # 自动扫描未运行，若开关开启则尝试启动
        if get_auto_scan_enabled():
            started, message = self.start()
            if started:
                self.trigger_path(path)
            else:
                with self._lock:
                    self._last_error = message
        else:
            with self._lock:
                self._last_error = "自动扫描已关闭，未启动后台扫描线程。"

    def trigger_path(self, path: str | Path) -> None:
        normalized = _normalize_path_key(path)
        with self._lock:
            worker = self._workers.get(normalized)
            if worker:
                worker.trigger()

    def refresh(self) -> None:
        """重新同步所有已知路径的 worker（用于新增/删除来源后）。"""
        with self._lock:
            if not self._running:
                return
            targets = self._collect_targets()
            self._sync_workers(targets)

    def _collect_targets(self) -> Dict[str, str]:
        targets: Dict[str, str] = {}

        def _add(raw: str | Path) -> None:
            key = _normalize_path_key(raw)
            targets.setdefault(key, str(raw))

        media_root = get_configured_media_root()
        if media_root is not None:
            _add(media_root)

        with SessionLocal() as session:
            rows = (
                session.query(MediaSource)
                .filter(or_(MediaSource.status.is_(None), MediaSource.status == "active"))
                .all()
            )
            for row in rows:
                _add(row.root_path)

        return targets

    def _sync_workers(self, targets: Dict[str, str]) -> None:
        # 停止已不存在的 worker
        for key in list(self._workers.keys()):
            if key not in targets:
                self._workers[key].stop()
                del self._workers[key]

        # 确保目标路径均有 worker
        for key, raw in targets.items():
            self._ensure_worker(key, raw)

    def _ensure_worker(self, key: str, raw: str) -> None:
        worker = self._workers.get(key)
        if worker and worker.is_alive:
            worker.trigger()
            return
        worker = _ScanWorker(raw, idle_seconds=self._idle_seconds)
        worker.start()
        self._workers[key] = worker
        worker.trigger()


class _ScanWorker:
    def __init__(self, path: str, *, idle_seconds: float) -> None:
        self._path = path
        self._idle_seconds = idle_seconds
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"AutoScan[{path}]", daemon=True)
        self._last_error: Optional[str] = None

    @property
    def is_alive(self) -> bool:
        return self._thread.is_alive()

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def start(self) -> None:
        if not self._thread.is_alive():
            self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._thread.is_alive():
            self._thread.join(timeout=5)

    def trigger(self) -> None:
        self._wake_event.set()

    def _run(self) -> None:
        while not self._stop_event.is_set():
            triggered = self._wake_event.wait(timeout=self._idle_seconds)
            if not triggered and not self._wake_event.is_set():
                # 周期性自动扫描
                self._wake_event.set()
            self._wake_event.clear()
            if self._stop_event.is_set():
                break

            try:
                self._scan_until_idle()
            except Exception as exc:  # pragma: no cover - 防御性记录
                self._last_error = f"自动扫描失败：{exc}"
                print(f"[auto-scan] 扫描 {self._path} 失败：{exc}")
                time.sleep(min(self._idle_seconds, 5.0))

    def _scan_until_idle(self) -> None:
        while not self._stop_event.is_set():
            session = SessionLocal()
            try:
                added = scan_source_once(session, self._path)
                session.commit()
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()

            if added <= 0:
                break


def ensure_auto_scan_service(app) -> AutoScanService:
    service = getattr(app.state, _STATE_ATTR, None)
    if not isinstance(service, AutoScanService):
        service = AutoScanService()
        setattr(app.state, _STATE_ATTR, service)
    return service


def gather_runtime_status(app) -> AutoScanRuntimeStatus:
    enabled = get_auto_scan_enabled()
    service = ensure_auto_scan_service(app)
    active = service.is_active if enabled else False
    message = service.last_error
    if enabled and not active and message is None:
        message = "自动扫描已启用，但监听任务尚未运行。请确认媒体目录有效。"
    return AutoScanRuntimeStatus(enabled=enabled, active=active, message=message)
