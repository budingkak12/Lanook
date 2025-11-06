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
    """重置初始化状态，完全清除所有数据库信息，让用户重新设置媒体库"""
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

    # 完全清除数据库中的所有相关数据
    db = SessionLocal()
    try:
        # 导入额外的模型
        from app.db.models_extra import MediaSource, ScanJob
        from 初始化数据库 import AppSetting, TagDefinition, MEDIA_ROOT_KEY, AUTO_SCAN_ENABLED_KEY

        # 统计删除数量
        deletion_stats = {}

        # 1. 删除所有扫描任务记录
        deleted_scan_jobs = db.query(ScanJob).delete(synchronize_session=False)
        deletion_stats['scan_jobs'] = deleted_scan_jobs

        # 2. 删除所有媒体标签记录
        deleted_tags = db.query(MediaTag).delete(synchronize_session=False)
        deletion_stats['media_tags'] = deleted_tags

        # 3. 删除所有媒体文件记录
        deleted_media = db.query(Media).delete(synchronize_session=False)
        deletion_stats['media'] = deleted_media

        # 4. 删除所有媒体来源记录
        deleted_sources = db.query(MediaSource).delete(synchronize_session=False)
        deletion_stats['media_sources'] = deleted_sources

        # 5. 删除媒体相关的应用设置
        # 删除媒体根目录设置
        deleted_root_setting = db.query(AppSetting).filter(AppSetting.key == MEDIA_ROOT_KEY).delete(synchronize_session=False)
        deletion_stats['media_root_setting'] = deleted_root_setting

        # 删除自动扫描设置
        deleted_auto_scan_setting = db.query(AppSetting).filter(AppSetting.key == AUTO_SCAN_ENABLED_KEY).delete(synchronize_session=False)
        deletion_stats['auto_scan_setting'] = deleted_auto_scan_setting

        db.commit()

        # 详细的删除日志
        print(f"完全清除数据库完成：")
        print(f"  - 媒体文件: {deletion_stats['media']} 条")
        print(f"  - 媒体标签: {deletion_stats['media_tags']} 条")
        print(f"  - 媒体来源: {deletion_stats['media_sources']} 条")
        print(f"  - 扫描任务: {deletion_stats['scan_jobs']} 条")
        print(f"  - 媒体根目录设置: {deletion_stats['media_root_setting']} 条")
        print(f"  - 自动扫描设置: {deletion_stats['auto_scan_setting']} 条")
        print(f"总计删除 {sum(deletion_stats.values())} 条记录")

    except Exception as e:
        print(f"清除数据库时出错: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"重置失败：{str(e)}"
        )
    finally:
        db.close()

    return {"message": "初始化状态已完全重置，所有数据库信息已清除"}
