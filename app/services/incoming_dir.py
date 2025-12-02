"""Incoming upload directory helpers."""

from __future__ import annotations

import os
from pathlib import Path


DEFAULT_INCOMING_SUBDIR = Path("incoming/mobile")
ENV_KEY = "MEDIA_APP_INCOMING_DIR"


class IncomingDirError(RuntimeError):
    """Raised when the incoming directory cannot be prepared."""


def resolve_incoming_dir() -> Path:
    """Resolve configured incoming directory (env override)."""
    raw = os.environ.get(ENV_KEY)
    base = Path(raw) if raw else DEFAULT_INCOMING_SUBDIR
    return base.expanduser().resolve()


def ensure_incoming_dir() -> Path:
    """Create the incoming directory if needed and verify writability."""
    target = resolve_incoming_dir()
    target.mkdir(parents=True, exist_ok=True)

    if not target.is_dir():
        raise IncomingDirError(f"上传目录不是有效文件夹：{target}")
    if not os.access(target, os.W_OK):
        raise IncomingDirError(f"没有写入权限：{target}")
    return target

