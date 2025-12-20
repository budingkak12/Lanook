from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Set

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

from app.db import (
    AUTO_SCAN_ENABLED_KEY,
    SCAN_MODE_KEY,
    SCAN_INTERVAL_KEY,
    SessionLocal,
    Media,
    create_database_and_tables,
    get_setting,
    set_setting,
)
from app.db.models_extra import MediaSource
from app.services.access_layer import SourceAccessLayer, classify_media_type, detect_source_type
from app.services.media_initializer import get_configured_media_root
from app.services.scan_service import scan_source_once
from app.services.query_filters import apply_active_source_filter


_STATE_ATTR = "auto_scan_service"
_DEFAULT_ENABLED = True


def _is_remote_path(path: str) -> bool:
    return detect_source_type(path) != "local"


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


def get_scan_mode(*, default: str = "realtime") -> str:
    """获取扫描模式：realtime/scheduled/disabled"""
    session = SessionLocal()
    try:
        stored = get_setting(session, SCAN_MODE_KEY)
        if stored is None:
            # 兼容旧版本，如果只有enabled设置则推断模式
            enabled = get_auto_scan_enabled(default=False)
            mode = "realtime" if enabled else "disabled"
            set_setting(session, SCAN_MODE_KEY, mode)
            session.commit()
            return mode
        return stored
    finally:
        session.close()


def set_scan_mode(mode: str) -> None:
    """设置扫描模式"""
    if mode not in ["realtime", "scheduled", "disabled"]:
        raise ValueError(f"Invalid scan mode: {mode}")
    session = SessionLocal()
    try:
        set_setting(session, SCAN_MODE_KEY, mode)
        session.commit()
    finally:
        session.close()


def get_scan_interval(*, default: str = "hourly") -> str:
    """获取定时扫描间隔：hourly/daily/weekly"""
    session = SessionLocal()
    try:
        stored = get_setting(session, SCAN_INTERVAL_KEY)
        if stored is None:
            set_setting(session, SCAN_INTERVAL_KEY, default)
            session.commit()
            return default
        return stored
    finally:
        session.close()


def set_scan_interval(interval: str) -> None:
    """设置定时扫描间隔"""
    if interval not in ["hourly", "daily", "weekly"]:
        raise ValueError(f"Invalid scan interval: {interval}")
    session = SessionLocal()
    try:
        set_setting(session, SCAN_INTERVAL_KEY, interval)
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
    if _is_remote_path(raw_str):
        return raw_str.rstrip("/")
    return str(Path(raw_str).expanduser().resolve())


def _is_media_file(file_path: str) -> bool:
    """检查文件是否为支持的媒体文件类型"""
    return classify_media_type(file_path) is not None


def _is_file_complete(file_path: str, check_interval: float = 0.5, max_checks: int = 6) -> bool:
    """检查文件是否已完整写入（通过检查文件大小是否稳定）"""
    try:
        path = Path(file_path)
        if not path.exists():
            return False

        last_size = -1
        checks = 0

        while checks < max_checks:
            current_size = path.stat().st_size
            if current_size == last_size and current_size > 0:
                return True
            last_size = current_size
            time.sleep(check_interval)
            checks += 1

        return last_size > 0
    except (OSError, PermissionError):
        return False


def _is_file_in_database(file_path: str, source_id: Optional[int] = None) -> bool:
    """检查文件是否已在数据库中"""
    session = SessionLocal()
    try:
        query = session.query(Media).filter(Media.absolute_path == file_path)
        if source_id is not None:
            query = query.filter(Media.source_id == source_id)
        return query.first() is not None
    finally:
        session.close()


class _MediaFileHandler(FileSystemEventHandler):
    """媒体文件系统事件处理器"""

    def __init__(self, root_path: str, source_id: Optional[int] = None):
        super().__init__()
        self.root_path = root_path
        self.source_id = source_id
        self._pending_files: Dict[str, float] = {}  # 文件路径 -> 首次检测时间
        self._processed_files: Set[str] = set()  # 已处理的文件，避免重复

    def on_created(self, event: FileSystemEvent) -> None:
        """处理文件创建事件"""
        if event.is_directory:
            return

        file_path = event.src_path
        if not _is_media_file(file_path):
            return

        # 避免重复处理
        if file_path in self._processed_files:
            return

        # 记录待处理文件
        self._pending_files[file_path] = time.time()
        print(f"[auto-scan] 检测到新文件: {file_path}")

    def on_moved(self, event: FileSystemEvent) -> None:
        """处理文件移动事件"""
        if event.is_directory:
            return

        dest_path = event.dest_path
        if not _is_media_file(dest_path):
            return

        # 避免重复处理
        if dest_path in self._processed_files:
            return

        # 记录待处理文件
        self._pending_files[dest_path] = time.time()
        print(f"[auto-scan] 检测到文件移动: {dest_path}")

    def process_pending_files(self) -> None:
        """处理待检测的文件"""
        current_time = time.time()
        files_to_process = []

        for file_path, first_seen in list(self._pending_files.items()):
            # 等待2秒后再检查文件完整性
            if current_time - first_seen >= 2.0:
                files_to_process.append(file_path)

        for file_path in files_to_process:
            if self._process_file_if_ready(file_path):
                self._pending_files.pop(file_path, None)
                self._processed_files.add(file_path)

    def _process_file_if_ready(self, file_path: str) -> bool:
        """如果文件就绪则处理入库"""
        try:
            # 检查文件完整性
            if not _is_file_complete(file_path):
                return False

            # 检查是否已在数据库中
            if _is_file_in_database(file_path, self.source_id):
                print(f"[auto-scan] 文件已存在，跳过: {file_path}")
                return True

            session = SessionLocal()
            try:
                access = SourceAccessLayer(session)
                inserted = access.ingest_local_file(
                    file_path,
                    source_id=self.source_id,
                    root_hint=self.root_path,
                )
                if inserted:
                    session.commit()
                    print(f"[auto-scan] 新媒体文件入库: {Path(file_path).name}")
                else:
                    session.rollback()
                    print(f"[auto-scan] 文件已存在或类型不受支持，跳过: {file_path}")
                return inserted
            except Exception as exc:
                session.rollback()
                print(f"[auto-scan] 入库失败 {file_path}: {exc}")
                return False
            finally:
                session.close()

        except Exception as exc:
            print(f"[auto-scan] 处理文件失败 {file_path}: {exc}")
            return False


class AutoScanService:
    def __init__(self, *, idle_seconds: float = DEFAULT_IDLE_SECONDS) -> None:
        self._lock = threading.RLock()
        self._workers: Dict[str, _ScanWorker] = {}
        self._scheduled_workers: Dict[str, _ScheduledScanWorker] = {}
        self._idle_seconds = idle_seconds
        self._last_error: Optional[str] = None
        self._running = False

    @property
    def is_active(self) -> bool:
        with self._lock:
            if not self._running:
                return False
            # 检查实时监控workers和定时扫描workers
            realtime_active = any(worker.is_alive for worker in self._workers.values())
            scheduled_active = any(worker.is_alive for worker in self._scheduled_workers.values())
            return realtime_active or scheduled_active

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
                message = "尚未配置媒体目录，文件索引服务暂不可用。"
                self._last_error = message
                self._running = False
                return False, message

            scan_mode = get_scan_mode()
            create_database_and_tables(echo=False)
            self._running = True
            self._last_error = None

            if scan_mode == "realtime":
                self._sync_workers(targets)
                print(f"[auto-scan] 已启动 {len(self._workers)} 个目录实时监控任务。")
            elif scan_mode == "scheduled":
                self._sync_scheduled_workers(targets)
                print(f"[auto-scan] 已启动 {len(self._scheduled_workers)} 个目录定时扫描任务。")
            else:
                # 默认使用实时模式
                self._sync_workers(targets)
                print(f"[auto-scan] 已启动 {len(self._workers)} 个目录实时监控任务。")

            return True, None

    def stop(self, *, clear_error: bool = True) -> None:
        with self._lock:
            # 停止实时监控workers
            for worker in self._workers.values():
                worker.stop()
            self._workers.clear()

            # 停止定时扫描workers
            for worker in self._scheduled_workers.values():
                worker.stop()
            self._scheduled_workers.clear()

            self._running = False
            if clear_error:
                self._last_error = None

        scan_mode = get_scan_mode()
        if scan_mode == "realtime":
            print("[auto-scan] 实时监控任务已停止。")
        elif scan_mode == "scheduled":
            print("[auto-scan] 定时扫描任务已停止。")
        else:
            print("[auto-scan] 文件索引服务已停止。")

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
            scan_mode = get_scan_mode()

            if scan_mode == "realtime":
                self._sync_workers(targets)
            elif scan_mode == "scheduled":
                self._sync_scheduled_workers(targets)
            else:
                # 默认使用实时模式
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
            rows = apply_active_source_filter(session.query(MediaSource)).all()
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

        # 获取source_id（如果有的话）
        source_id = self._get_source_id_for_path(raw)
        worker = _ScanWorker(raw, source_id=source_id)
        worker.start()
        self._workers[key] = worker
        worker.trigger()

    def _get_source_id_for_path(self, path: str) -> Optional[int]:
        """根据路径获取对应的媒体源ID"""
        with SessionLocal() as session:
            source = session.query(MediaSource).filter(MediaSource.root_path == path).first()
            return source.id if source else None

    def _sync_scheduled_workers(self, targets: Dict[str, str]) -> None:
        """同步定时扫描workers"""
        scan_interval = get_scan_interval()

        # 停止已不存在的scheduled workers
        for key in list(self._scheduled_workers.keys()):
            if key not in targets:
                self._scheduled_workers[key].stop()
                del self._scheduled_workers[key]

        # 确保目标路径均有scheduled worker
        for key, raw in targets.items():
            self._ensure_scheduled_worker(key, raw, scan_interval)

    def _ensure_scheduled_worker(self, key: str, raw: str, scan_interval: str) -> None:
        """确保定时扫描worker存在并运行"""
        worker = self._scheduled_workers.get(key)
        if worker and worker.is_alive:
            return

        # 获取source_id（如果有的话）
        source_id = self._get_source_id_for_path(raw)
        worker = _ScheduledScanWorker(raw, scan_interval, source_id=source_id)
        worker.start()
        self._scheduled_workers[key] = worker


class _ScheduledScanWorker:
    """定时扫描工作器"""

    def __init__(self, path: str, scan_interval: str, *, source_id: Optional[int] = None) -> None:
        self._path = path
        self._scan_interval = scan_interval
        self._source_id = source_id
        self._scan_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._last_error: Optional[str] = None

    @property
    def is_alive(self) -> bool:
        return self._scan_thread is not None and self._scan_thread.is_alive()

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def start(self) -> None:
        if self.is_alive:
            return

        self._scan_thread = threading.Thread(
            target=self._run_scheduled_scan,
            name=f"ScheduledScanner[{self._path}:{self._scan_interval}]",
            daemon=True
        )
        self._scan_thread.start()
        print(f"[auto-scan] 开始定时扫描目录: {self._path} (间隔: {self._scan_interval})")

    def stop(self) -> None:
        self._stop_event.set()

        if self._scan_thread and self._scan_thread.is_alive():
            self._scan_thread.join(timeout=5)

        print(f"[auto-scan] 停止定时扫描目录: {self._path}")

    def _run_scheduled_scan(self) -> None:
        """定时扫描线程主循环"""
        # 计算扫描间隔（秒）
        interval_map = {
            "hourly": 3600,      # 1小时
            "daily": 86400,      # 24小时
            "weekly": 604800,    # 7天
        }
        scan_interval_seconds = interval_map.get(self._scan_interval, 3600)

        last_scan_time = 0

        while not self._stop_event.is_set():
            current_time = time.time()

            try:
                # 检查是否需要执行扫描
                if current_time - last_scan_time >= scan_interval_seconds:
                    session = SessionLocal()
                    try:
                        added = scan_source_once(session, self._path, source_id=self._source_id)
                        session.commit()
                        if added > 0:
                            print(f"[auto-scan] 定时扫描新增 {added} 个文件: {self._path}")
                        last_scan_time = current_time
                    except Exception:
                        session.rollback()
                        raise
                    finally:
                        session.close()

            except Exception as exc:
                self._last_error = f"定时扫描失败：{exc}"
                print(f"[auto-scan] 定时扫描失败 {self._path}: {exc}")

            # 每30秒检查一次是否需要停止
            self._stop_event.wait(30.0)


class _ScanWorker:
    """基于文件系统监控的扫描工作器"""

    def __init__(self, path: str, *, source_id: Optional[int] = None) -> None:
        self._path = path
        self._source_id = source_id
        self._observer = Observer()
        self._handler = _MediaFileHandler(path, source_id=source_id)
        self._monitor_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._last_error: Optional[str] = None

    @property
    def is_alive(self) -> bool:
        return self._monitor_thread is not None and self._monitor_thread.is_alive()

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def start(self) -> None:
        if self.is_alive:
            return

        # 远程路径暂不支持文件系统监控，回退到定期扫描
        if _is_remote_path(self._path):
            print(f"[auto-scan] 远程路径使用定期扫描: {self._path}")
            self._monitor_thread = threading.Thread(
                target=self._run_smb_scan,
                name=f"RemoteScanner[{self._path}]",
                daemon=True
            )
            self._monitor_thread.start()
            return

        try:
            # 设置文件系统监控（仅适用于本地路径）
            self._observer.schedule(self._handler, self._path, recursive=True)
            self._observer.start()

            # 启动处理待处理文件的线程
            self._monitor_thread = threading.Thread(
                target=self._run_monitor,
                name=f"FileSystemMonitor[{self._path}]",
                daemon=True
            )
            self._monitor_thread.start()
            print(f"[auto-scan] 开始监控目录: {self._path}")

        except Exception as exc:
            self._last_error = f"启动监控失败：{exc}"
            print(f"[auto-scan] 启动监控失败 {self._path}: {exc}")
            self.stop()

    def stop(self) -> None:
        self._stop_event.set()

        if self._observer.is_alive():
            self._observer.stop()
            self._observer.join(timeout=5)

        if self._monitor_thread and self._monitor_thread.is_alive():
            self._monitor_thread.join(timeout=5)

        print(f"[auto-scan] 停止监控目录: {self._path}")

    def trigger(self) -> None:
        """手动触发处理待处理文件"""
        if _is_remote_path(self._path):
            # 远程路径没有文件系统事件处理器，但可以手动触发扫描
            print(f"[auto-scan] 手动触发远程路径扫描: {self._path}")
            session = SessionLocal()
            try:
                added = scan_source_once(session, self._path, source_id=self._source_id)
                session.commit()
                if added > 0:
                    print(f"[auto-scan] 手动扫描新增 {added} 个文件: {self._path}")
            except Exception as exc:
                session.rollback()
                print(f"[auto-scan] 手动扫描失败 {self._path}: {exc}")
            finally:
                session.close()
        elif self._handler:
            self._handler.process_pending_files()

    def _run_monitor(self) -> None:
        """监控线程：定期处理待处理的文件"""
        while not self._stop_event.is_set():
            try:
                self._handler.process_pending_files()
            except Exception as exc:  # pragma: no cover - 防御性记录
                self._last_error = f"处理待处理文件失败：{exc}"
                print(f"[auto-scan] 处理待处理文件失败: {exc}")

            # 每秒检查一次
            self._stop_event.wait(1.0)

    def _run_smb_scan(self) -> None:
        """远程路径定期扫描（回退方案）"""
        scan_interval = 300.0  # 5分钟扫描一次远程路径
        last_scan_time = 0

        while not self._stop_event.is_set():
            current_time = time.time()

            try:
                # 每隔5分钟扫描一次远程路径
                if current_time - last_scan_time >= scan_interval:
                    session = SessionLocal()
                    try:
                        added = scan_source_once(session, self._path, source_id=self._source_id)
                        session.commit()
                        if added > 0:
                            print(f"[auto-scan] 远程路径扫描新增 {added} 个文件: {self._path}")
                        last_scan_time = current_time
                    except Exception:
                        session.rollback()
                        raise
                    finally:
                        session.close()

            except Exception as exc:  # pragma: no cover - 防御性记录
                self._last_error = f"远程扫描失败：{exc}"
                print(f"[auto-scan] 远程扫描失败 {self._path}: {exc}")

            # 每30秒检查一次是否需要停止
            self._stop_event.wait(30.0)


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
        scan_mode = get_scan_mode()
        if scan_mode == "realtime":
            message = "实时监控已启用，但监听任务尚未运行。请确认媒体目录有效。"
        elif scan_mode == "scheduled":
            message = "定时扫描已启用，但扫描任务尚未运行。请确认媒体目录有效。"
        else:
            message = "文件索引服务已启用，但扫描任务尚未运行。"

    return AutoScanRuntimeStatus(enabled=enabled, active=active, message=message)
