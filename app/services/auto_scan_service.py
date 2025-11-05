from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:  # watchdog 可能在尚未安装依赖时缺失
    from watchdog.events import FileSystemEventHandler
    from watchdog.observers import Observer
except ImportError:  # pragma: no cover - 仅在缺失依赖时触发
    FileSystemEventHandler = object  # type: ignore
    Observer = None  # type: ignore

from 初始化数据库 import (
    AUTO_SCAN_ENABLED_KEY,
    SessionLocal,
    get_setting,
    _resolve_media_source,
    scan_and_populate_media,
    set_setting,
)
from app.services.media_initializer import get_configured_media_root


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


class _MediaEventHandler(FileSystemEventHandler):
    def __init__(self, trigger: threading.Event) -> None:
        self._trigger = trigger

    def on_created(self, event):  # type: ignore[override]
        if getattr(event, "is_directory", False):
            return
        self._trigger.set()

    def on_moved(self, event):  # type: ignore[override]
        if getattr(event, "is_directory", False):
            return
        self._trigger.set()

    def on_modified(self, event):  # type: ignore[override]
        if getattr(event, "is_directory", False):
            return
        self._trigger.set()


class AutoScanService:
    def __init__(self, *, debounce_seconds: float = 1.5) -> None:
        self._lock = threading.RLock()
        self._observer: Optional[Observer] = None
        self._worker: Optional[threading.Thread] = None
        self._trigger_event = threading.Event()
        self._stop_event = threading.Event()
        self._last_error: Optional[str] = None
        self._debounce_seconds = debounce_seconds
        self._current_root: Optional[Path] = None

    @property
    def is_active(self) -> bool:
        worker_alive = self._worker is not None and self._worker.is_alive()
        observer_alive = self._observer is not None and getattr(self._observer, "is_alive", lambda: False)()
        return worker_alive and observer_alive

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def start(self) -> tuple[bool, Optional[str]]:
        with self._lock:
            if Observer is None:
                message = "watchdog 未安装，无法开启自动扫描。请先安装依赖。"
                self._last_error = message
                return False, message

            target_root = get_configured_media_root()
            if target_root is None:
                message = "尚未配置媒体目录，自动扫描暂不可用。"
                self._last_error = message
                return False, message

            target_root = target_root.expanduser().resolve()
            if not target_root.exists() or not target_root.is_dir():
                message = f"媒体目录不可达：{target_root}"
                self._last_error = message
                return False, message

            if self.is_active and self._current_root and self._current_root == target_root:
                return True, None

            if self.is_active:
                self._stop_locked()

            handler = _MediaEventHandler(self._trigger_event)
            observer = Observer()
            try:
                observer.schedule(handler, str(target_root), recursive=True)
                observer.start()
            except Exception as exc:  # pragma: no cover - watchdog 启动异常
                message = f"启动目录监听失败：{exc}"
                self._last_error = message
                try:
                    observer.stop()
                except Exception:
                    pass
                return False, message

            self._observer = observer
            self._current_root = target_root
            self._last_error = None
            self._trigger_event.clear()
            self._stop_event.clear()
            worker = threading.Thread(target=self._worker_loop, name="AutoScanWorker", daemon=True)
            worker.start()
            self._worker = worker
            print(f"[auto-scan] 已启动目录监听：{target_root}")
            return True, None

    def stop(self, *, clear_error: bool = True) -> None:
        with self._lock:
            self._stop_locked()
            if clear_error:
                self._last_error = None

    def _stop_locked(self) -> None:
        observer = self._observer
        worker = self._worker
        self._observer = None
        self._worker = None
        self._current_root = None
        self._stop_event.set()
        self._trigger_event.set()

        if observer is not None:
            try:
                observer.stop()
                observer.join(timeout=5)
            except Exception:
                pass

        if worker is not None and worker.is_alive():
            worker.join(timeout=5)

        self._trigger_event = threading.Event()
        self._stop_event = threading.Event()

    def _worker_loop(self) -> None:
        while not self._stop_event.is_set():
            triggered = self._trigger_event.wait(timeout=1.0)
            if not triggered:
                continue

            self._trigger_event.clear()
            # 去抖动：合并短时间内的连续文件事件
            waited = 0.0
            while waited < self._debounce_seconds and not self._stop_event.is_set():
                time.sleep(0.2)
                waited += 0.2

            if self._stop_event.is_set():
                break

            try:
                self._perform_scan()
            except Exception as exc:  # pragma: no cover - 后台错误记录
                self._last_error = f"自动扫描失败：{exc}"
                print(f"[auto-scan] 扫描失败：{exc}")

    def _perform_scan(self) -> None:
        root = self._current_root or get_configured_media_root()
        if root is None:
            self._last_error = "媒体目录未配置，已暂停自动扫描。"
            return

        root = root.expanduser().resolve()
        if not root.exists():
            self._last_error = f"媒体目录已丢失：{root}"
            return

        session = SessionLocal()
        try:
            source = _resolve_media_source(
                session,
                str(root),
                source_id=None,
                type_="local",
            )
            new_count = scan_and_populate_media(
                session,
                str(root),
                source_id=source.id if source else None,
            )
            if new_count:
                print(f"[auto-scan] 已入库 {new_count} 个新增媒体。")
        except Exception as exc:
            session.rollback()
            raise exc
        finally:
            session.close()


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
