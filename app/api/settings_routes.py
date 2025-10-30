from fastapi import APIRouter, HTTPException, Request, status

from app.schemas.settings import AutoScanStatusResponse, AutoScanUpdateRequest
from app.services.auto_scan_service import (
    ensure_auto_scan_service,
    gather_runtime_status,
    set_auto_scan_enabled,
)
from app.services.init_state import InitializationCoordinator, InitializationState
from app.services.media_initializer import get_configured_media_root, has_indexed_media
from 初始化数据库 import SessionLocal, Media, MediaTag


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


@router.post("/reset-initialization", status_code=status.HTTP_200_OK)
def reset_initialization(request: Request):
    """重置初始化状态，让用户重新设置媒体库"""
    coordinator = getattr(request.app.state, "init_coordinator", None)
    if coordinator is None:
        coordinator = InitializationCoordinator()
        request.app.state.init_coordinator = coordinator

    # 重置为空闲状态
    coordinator.reset(
        state=InitializationState.IDLE,
        media_root_path=None,
        message="初始化状态已重置，请重新设置媒体库路径。"
    )

    # 直接清除数据库中的媒体数据
    db = SessionLocal()
    try:
        # 删除所有媒体标签记录
        deleted_tags = db.query(MediaTag).delete(synchronize_session=False)
        # 删除所有媒体文件记录
        deleted_media = db.query(Media).delete(synchronize_session=False)

        db.commit()
        print(f"清除数据库完成：删除媒体 {deleted_media} 条、关联标签 {deleted_tags} 条。")
    except Exception as e:
        print(f"清除数据库时出错: {e}")
        db.rollback()
    finally:
        db.close()

    return {"message": "初始化状态已重置"}
