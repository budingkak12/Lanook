from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.services.fs_providers import iter_bytes

REPO_ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS_ROOT = REPO_ROOT / "artifacts"
ARTIFACTS_ROOT.mkdir(exist_ok=True)


def ensure_artifact_dir(name: str) -> Path:
    path = ARTIFACTS_ROOT / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def read_remote_head(url: str, length: int, *, chunk_size: int = 512 * 1024) -> bytes:
    data = bytearray()
    for chunk in iter_bytes(url, start=0, length=length, chunk_size=chunk_size):
        data.extend(chunk)
        if len(data) >= length:
            break
    return bytes(data)


def stream_remote_to_file(url: str, dest: Path, *, chunk_size: int = 4 * 1024 * 1024) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as target:
        for chunk in iter_bytes(url, start=0, length=None, chunk_size=chunk_size):
            if not chunk:
                break
            target.write(chunk)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


__all__ = [
    "ARTIFACTS_ROOT",
    "REPO_ROOT",
    "ensure_artifact_dir",
    "ensure_parent",
    "read_remote_head",
    "stream_remote_to_file",
]
