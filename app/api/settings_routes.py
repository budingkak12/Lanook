from fastapi import APIRouter, HTTPException, Request, status

from app.schemas.settings import AutoScanStatusResponse, AutoScanUpdateRequest
from app.services.auto_scan_service import (
    ensure_auto_scan_service,
    gather_runtime_status,
    set_auto_scan_enabled,
)


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/auto-scan", response_model=AutoScanStatusResponse)
def get_auto_scan_status(request: Request):
    runtime = gather_runtime_status(request.app)
    return AutoScanStatusResponse(
        enabled=runtime.enabled,
        active=runtime.active,
        message=runtime.message,
    )


@router.post("/auto-scan", response_model=AutoScanStatusResponse, status_code=status.HTTP_200_OK)
def update_auto_scan_setting(payload: AutoScanUpdateRequest, request: Request):
    service = ensure_auto_scan_service(request.app)
    before = gather_runtime_status(request.app)

    if payload.enabled:
        success, message = service.start()
        if not success:
            # 回滚状态
            set_auto_scan_enabled(before.enabled)
            runtime = gather_runtime_status(request.app)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=message or runtime.message or "自动扫描暂不可用，请稍后再试。",
            )
        set_auto_scan_enabled(True)
    else:
        set_auto_scan_enabled(False)
        service.stop()

    runtime = gather_runtime_status(request.app)
    return AutoScanStatusResponse(
        enabled=runtime.enabled,
        active=runtime.active,
        message=runtime.message,
    )
