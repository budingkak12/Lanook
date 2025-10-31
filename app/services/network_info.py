from __future__ import annotations

import socket
import platform
from typing import List, Callable, Optional
import threading
import time


def _try_primary_ip() -> str | None:
    """尽快推断本机在局域网中的 IPv4。

    之前实现使用 UDP connect 到 8.8.8.8，但在某些无网络/路由异常的环境下，
    connect 可能阻塞数秒，导致 /os-info 整体请求变慢并拖慢前端初始化。

    这里强制设置极短超时（默认 0.25s），一旦失败立即返回 None，
    由后续的备用策略（主机名解析、127.0.0.1）补充。
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # 将超时限制在较小范围，避免无网络环境阻塞
            s.settimeout(0.25)
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            try:
                s.close()
            except Exception:
                pass
    except Exception:
        return None


def _hostname_ip() -> str | None:
    try:
        return socket.gethostbyname(socket.gethostname())
    except Exception:
        return None


def _within_timeout(fn: Callable[[], Optional[str]], timeout: float) -> Optional[str]:
    """在超时内执行 fn，超时返回 None，不阻塞主线程。

    用线程而非 socket 超时是因为在部分系统上（如 macOS），
    UDP connect 在路由异常时仍可能阻塞数秒，settimeout 不总是生效。
    """
    result: list[Optional[str]] = [None]
    done = threading.Event()

    def runner():
        try:
            result[0] = fn()
        finally:
            done.set()

    t = threading.Thread(target=runner, daemon=True)
    t.start()
    done.wait(timeout)
    return result[0] if done.is_set() else None


_CACHE_LOCK = threading.Lock()
_CACHE_IPS: List[str] | None = None
_CACHE_TS: float | None = None


def _detect_ips_fast() -> List[str]:
    ips: List[str] = []
    primary = _within_timeout(_try_primary_ip, timeout=0.1)
    if primary:
        ips.append(primary)
    host = _within_timeout(_hostname_ip, timeout=0.05)
    if host and host not in ips:
        ips.append(host)
    # 过滤回环地址
    return [ip for ip in ips if ip and ip != "127.0.0.1"]


def list_lan_ips(max_age: float = 10.0, force_refresh: bool = False) -> List[str]:
    """带缓存的 LAN IP 发现。

    - 使用极短超时的快速探测，正常情况下几十毫秒内返回。
    - 结果保留到内存缓存，默认有效期 10 秒；可通过 force_refresh 强制刷新。
    - 永远不返回 127.0.0.1。
    """
    global _CACHE_IPS, _CACHE_TS
    now = time.time()
    with _CACHE_LOCK:
        if not force_refresh and _CACHE_IPS is not None and _CACHE_TS is not None and now - _CACHE_TS < max_age:
            return list(_CACHE_IPS)
        ips = _detect_ips_fast()
        _CACHE_IPS, _CACHE_TS = ips, now
        return list(ips)


def detect_os_name() -> str:
    sys = platform.system().lower()
    if sys.startswith("win"):
        return "windows"
    if sys == "darwin":
        return "macos"
    return "linux"
