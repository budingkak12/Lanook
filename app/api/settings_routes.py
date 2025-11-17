from fastapi import APIRouter, HTTPException, Request, status

from app.schemas.settings import AutoScanStatusResponse, AutoScanUpdateRequest, DbResetRequest, DbResetResponse
from app.services.auto_scan_service import (
    ensure_auto_scan_service,
    gather_runtime_status,
    set_auto_scan_enabled,
    set_scan_mode,
    set_scan_interval,
    get_scan_mode,
    get_scan_interval,
)
from app.services.init_state import InitializationCoordinator, InitializationState
from app.services.media_initializer import get_configured_media_root, has_indexed_media
from app.db import SessionLocal, Media, MediaTag, SCAN_MODE_KEY, SCAN_INTERVAL_KEY
from app.services.db_reset_service import reset_database_file


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/auto-scan", response_model=AutoScanStatusResponse)
def get_auto_scan_status(request: Request):
    runtime = gather_runtime_status(request.app)
    scan_mode = get_scan_mode()
    scan_interval = get_scan_interval()

    return AutoScanStatusResponse(
        enabled=runtime.enabled,
        active=runtime.active,
        scan_mode=scan_mode,
        scan_interval=scan_interval,
        message=runtime.message,
    )


@router.post("/auto-scan", response_model=AutoScanStatusResponse, status_code=status.HTTP_200_OK)
def update_auto_scan_setting(payload: AutoScanUpdateRequest, request: Request):
    service = ensure_auto_scan_service(request.app)
    before = gather_runtime_status(request.app)

    try:
        if payload.enabled:
            # 启用功能时必须指定扫描模式
            if not payload.scan_mode:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="启用文件索引服务时必须指定扫描模式（实时或定时）"
                )

            # 如果是定时模式，必须指定间隔
            if payload.scan_mode == "scheduled" and not payload.scan_interval:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="定时扫描模式必须指定扫描间隔"
                )

            # 应用设置
            set_auto_scan_enabled(True)
            set_scan_mode(payload.scan_mode)
            if payload.scan_interval:
                set_scan_interval(payload.scan_interval)

            # 启动服务
            success, message = service.start()
            if not success:
                # 回滚状态
                set_auto_scan_enabled(before.enabled)
                runtime = gather_runtime_status(request.app)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=message or runtime.message or "文件索引服务暂不可用，请稍后再试。",
                )
            service.refresh()
        else:
            # 禁用功能
            set_auto_scan_enabled(False)
            set_scan_mode("disabled")
            service.stop()

    except HTTPException:
        raise
    except Exception as e:
        # 其他异常时的回滚
        set_auto_scan_enabled(before.enabled)
        runtime = gather_runtime_status(request.app)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"设置更新失败：{str(e)}"
        )

    runtime = gather_runtime_status(request.app)
    return AutoScanStatusResponse(
        enabled=runtime.enabled,
        active=runtime.active,
        scan_mode=get_scan_mode(),
        scan_interval=get_scan_interval(),
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
        from app.db import AppSetting, TagDefinition, MEDIA_ROOT_KEY, AUTO_SCAN_ENABLED_KEY

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


@router.post("/db-reset", response_model=DbResetResponse, status_code=status.HTTP_200_OK)
def reset_database(payload: DbResetRequest, request: Request):
    if not payload.confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请显式确认后再执行数据库重置。")

    try:
        result = reset_database_file(drop_existing=payload.drop_existing)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:  # pragma: no cover - 运行时兜底
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"数据库重置失败：{exc}")

    coordinator = getattr(request.app.state, "init_coordinator", None)
    if coordinator is None:
        coordinator = InitializationCoordinator()
        request.app.state.init_coordinator = coordinator

    coordinator.reset(
        state=InitializationState.IDLE,
        media_root_path=None,
        message="数据库已重置，请重新设置媒体库路径。",
    )

    return DbResetResponse(
        db_path=str(result.db_path),
        deleted=result.deleted,
        recreated=result.recreated,
        message="数据库文件已重建并回到初始化流程。",
    )
