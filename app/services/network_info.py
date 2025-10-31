from __future__ import annotations

import socket
import platform
from typing import List


def _try_primary_ip() -> str | None:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        return None


def _hostname_ip() -> str | None:
    try:
        return socket.gethostbyname(socket.gethostname())
    except Exception:
        return None


def list_lan_ips() -> List[str]:
    """返回可能可用的局域网 IPv4 地址（简单近似）。"""
    ips = []
    primary = _try_primary_ip()
    if primary:
        ips.append(primary)
    host = _hostname_ip()
    if host and host not in ips:
        ips.append(host)
    loop = "127.0.0.1"
    if loop not in ips:
        ips.append(loop)
    return ips


def detect_os_name() -> str:
    sys = platform.system().lower()
    if sys.startswith("win"):
        return "windows"
    if sys == "darwin":
        return "macos"
    return "linux"

