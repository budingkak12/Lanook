from __future__ import annotations

import os
import platform
from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass
class ProbeResult:
    path: str
    status: str  # ok/denied/not_found/error
    reason: str | None = None


def _probe_path(target: Path) -> ProbeResult:
    try:
        resolved = target.expanduser().resolve(strict=False)
        if not resolved.exists():
            return ProbeResult(str(resolved), "not_found", None)
        if resolved.is_dir():
            # 目录只读取一层名称，触发潜在的 TCC 弹窗（macOS）
            try:
                with os.scandir(resolved) as it:
                    for _ in it:
                        break
            except PermissionError as exc:
                reason = "macos_tcc" if platform.system().lower() == "darwin" else None
                return ProbeResult(str(resolved), "denied", reason)
        else:
            try:
                with open(resolved, "rb"):
                    pass
            except PermissionError:
                reason = "macos_tcc" if platform.system().lower() == "darwin" else None
                return ProbeResult(str(resolved), "denied", reason)

        # 二次判定：可读？
        if not os.access(resolved, os.R_OK):
            reason = "macos_tcc" if platform.system().lower() == "darwin" else None
            return ProbeResult(str(resolved), "denied", reason)
        return ProbeResult(str(resolved), "ok", None)
    except Exception as exc:  # 兜底异常
        return ProbeResult(str(target), "error", str(exc))


def probe_paths(paths: List[str]) -> List[ProbeResult]:
    results: List[ProbeResult] = []
    for p in paths:
        results.append(_probe_path(Path(p)))
    return results

