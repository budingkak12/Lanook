from __future__ import annotations

from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    LOCAL = "local"
    SMB = "smb"
    WEBDAV = "webdav"


class SourceStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class ScanStrategy(str, Enum):
    REALTIME = "realtime"
    SCHEDULED = "scheduled"
    MANUAL = "manual"
    DISABLED = "disabled"


class SourceCredentialFieldModel(BaseModel):
    key: str
    label: str
    required: bool = False
    secret: bool = False
    description: Optional[str] = None


class SourceProviderCapabilityModel(BaseModel):
    name: str
    displayName: str
    protocols: List[str] = Field(default_factory=list)
    requiresCredentials: bool = False
    supportsAnonymous: bool = False
    canValidate: bool = False
    credentialFields: List[SourceCredentialFieldModel] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


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
    scanStrategy: Optional[ScanStrategy] = Field(
        default=None,
        description="来源级扫描策略，默认 local=Realtime, 其余=Scheduled",
    )
    scanIntervalSeconds: Optional[int] = Field(
        default=None,
        description="定时扫描间隔（秒），仅在 scheduled 策略下生效",
    )


class MediaSourceModel(BaseModel):
    id: int
    type: SourceType
    sourceType: SourceType
    displayName: Optional[str] = None
    rootPath: str
    createdAt: str
    status: SourceStatus
    deletedAt: Optional[str] = None
    lastScanAt: Optional[str] = None
    scanStrategy: ScanStrategy
    scanIntervalSeconds: Optional[int] = None
    lastScanStartedAt: Optional[str] = None
    lastScanFinishedAt: Optional[str] = None
    lastError: Optional[str] = None
    failureCount: int = 0


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
