from pydantic import BaseModel
from typing import Literal, Optional


class AutoScanStatusResponse(BaseModel):
    enabled: bool
    active: bool
    scan_mode: Optional[Literal["realtime", "scheduled", "disabled"]] = None
    scan_interval: Optional[Literal["hourly", "daily", "weekly"]] = None
    message: str | None = None


class AutoScanUpdateRequest(BaseModel):
    enabled: bool
    scan_mode: Optional[Literal["realtime", "scheduled", "disabled"]] = None
    scan_interval: Optional[Literal["hourly", "daily", "weekly"]] = None
