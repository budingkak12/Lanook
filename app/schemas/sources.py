from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    LOCAL = "local"
    SMB = "smb"


class SourceStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class SourceValidateRequest(BaseModel):
    type: SourceType = Field(..., description="来源类型：local 或 smb")
    # local
    path: str | None = Field(None, description="本地来源根路径（绝对路径）")
    # smb
    host: str | None = None
    share: str | None = None
    subPath: str | None = None
    username: str | None = None
    password: str | None = None
    domain: str | None = None
    port: int | None = None
    anonymous: bool | None = None


class SourceValidateResponse(BaseModel):
    ok: bool
    readable: bool
    absPath: str
    estimatedCount: int
    samples: List[str] = []
    note: str | None = None


class SourceCreateRequest(BaseModel):
    type: SourceType
    # local
    rootPath: Optional[str] = None
    # smb
    host: Optional[str] = None
    share: Optional[str] = None
    subPath: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    domain: Optional[str] = None
    port: Optional[int] = None
    anonymous: Optional[bool] = None
    # common
    displayName: Optional[str] = None
    # control
    scan: Optional[bool] = Field(default=True, description="是否立即触发扫描与后台监控")


class MediaSourceModel(BaseModel):
    id: int
    type: SourceType
    displayName: Optional[str] = None
    rootPath: str
    createdAt: str
    status: SourceStatus
    deletedAt: Optional[str] = None
    lastScanAt: Optional[str] = None


class ScanStartResponse(BaseModel):
    jobId: str


class ScanState(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ScanStatusResponse(BaseModel):
    jobId: str
    sourceId: int
    state: ScanState
    scannedCount: int = 0
    message: Optional[str] = None
    startedAt: Optional[str] = None
    finishedAt: Optional[str] = None
