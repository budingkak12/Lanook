from pydantic import BaseModel


class AutoScanStatusResponse(BaseModel):
    enabled: bool
    active: bool
    message: str | None = None


class AutoScanUpdateRequest(BaseModel):
    enabled: bool
