from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


@dataclass
class ArtifactPayload:
    """标准化的资产产物结构，允许 handler 返回文件/附加 JSON。"""

    path: Optional[Path] = None
    extra: Optional[Dict[str, Any]] = None
    checksum: Optional[str] = None

    def has_materialized_output(self) -> bool:
        if self.path and Path(self.path).exists():
            return True
        return self.extra is not None


__all__ = ["ArtifactPayload"]
