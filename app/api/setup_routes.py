from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException, Query, Request, Response, BackgroundTasks

from app.schemas.setup import (
    DirectoryEntryModel,
    DirectoryListResponse,
    CommonFolderEntryModel,
    CommonFolderCategory,
    OSInfoResponse,
    ProbeRequest,
    ProbeResultModel,
    InitializationStateModel,
    InitializationStatusResponse,
    MediaRootRequest,
)
from app.services.filesystem_browser import DirectoryInfo, list_roots, list_subdirectories
from app.services.permissions import probe_paths
from app.services.common_folders import list_common_folders
from app.services.network_info import list_lan_ips, detect_os_name
from app.services.init_state import InitializationCoordinator, InitializationState
from app.services.media_initializer import (
    MediaInitializationError,
    get_configured_media_root,
    has_indexed_media,
    validate_media_root,
)
from app.services.sources_service import list_sources
from app.services.auto_scan_service import ensure_auto_scan_service
from app.services.scan_service import scan_source_once
from app.services.clip_warmup import warmup_missing_clip_embeddings
from app.services.asset_warmup import warmup_assets_for_source, is_thumbnail_warmup_enabled
from app.services.tag_warmup import warmup_rebuild_tags_for_active_media
from app.services.face_warmup import warmup_rebuild_face_clusters

router = APIRouter(tags=["setup"])


def _ensure_coordinator(request: Request) -> InitializationCoordinator:
    coordinator = getattr(request.app.state, "init_coordinator", None)
    if coordinator is None:
        coordinator = InitializationCoordinator()
        request.app.state.init_coordinator = coordinator
    return coordinator


def _info_to_model(info: DirectoryInfo) -> DirectoryEntryModel:
    return DirectoryEntryModel(
        path=info.path,
        name=info.name,
        readable=info.readable,
        writable=info.writable,
        is_root=info.is_root,
        is_symlink=info.is_symlink,
    )


@router.get("/filesystem/roots", response_model=List[DirectoryEntryModel])
def get_filesystem_roots():
    infos = list_roots()
    return [_info_to_model(info) for info in infos]


@router.get("/filesystem/list", response_model=DirectoryListResponse)
def get_directory_listing(path: str = Query(..., description="要查看的目录绝对路径")):
    try:
        entries = list_subdirectories(path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except NotADirectoryError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    resolved = Path(path).expanduser().resolve()
    parent = resolved.parent if resolved != resolved.parent else None
    return DirectoryListResponse(
        current_path=str(resolved),
        parent_path=str(parent) if parent else None,
        entries=[_info_to_model(info) for info in entries],
    )


@router.get("/filesystem/common-folders", response_model=list[CommonFolderEntryModel])
def get_common_folders():
    infos = list_common_folders()
    results: list[CommonFolderEntryModel] = []
    for info in infos:
        results.append(
            CommonFolderEntryModel(
                path=info.path,
                name=info.name,
                readable=info.readable,
                writable=info.writable,
                is_root=info.is_root,
                is_symlink=info.is_symlink,
                category=CommonFolderCategory(info.category),
            )
        )
    return results


@router.post("/media-root", status_code=200)
def set_media_root(
    request: Request,
    payload: MediaRootRequest,
    background: BackgroundTasks = None,
):
    # 若未提供 path，则从 DB 中自动选择一个来源
    if not payload.path:
        try:
            from app.db import SessionLocal as _SL
            db = _SL()
            try:
                sources = list_sources(db, include_inactive=False)
            finally:
                db.close()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"读取媒体来源失败：{exc}")
        if not sources:
            # 不再返回 404，统一 200 并给出指示
            return {"success": False, "code": "no_media_source", "message": "没有媒体路径，请先添加"}
        # 使用第一个活跃来源
        candidate = sources[0].root_path
        try:
            validated_path = validate_media_root(candidate)
        except MediaInitializationError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    else:
        try:
            validated_path = validate_media_root(payload.path)
        except MediaInitializationError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    # 设置媒体根路径
    from app.db import SessionLocal, set_setting, MEDIA_ROOT_KEY
    db = SessionLocal()
    try:
        set_setting(db, MEDIA_ROOT_KEY, str(validated_path))
        db.commit()
    finally:
        db.close()

    # 先同步导入一小批媒体，确保前端立即可见（不阻塞后续的全库后台处理）
    initial_batch = 0
    try:
        from app.db import seed_initial_data, create_database_and_tables

        create_database_and_tables(echo=False)
        task_db = SessionLocal()
        try:
            seed_initial_data(task_db)
            initial_batch = scan_source_once(task_db, str(validated_path), limit=50)
            task_db.commit()
            if initial_batch:
                print(f"[media-root] 首批导入 {initial_batch} 个媒体文件。")
        except Exception as exc:
            task_db.rollback()
            print(f"[media-root] 首批导入失败：{exc}")
        finally:
            task_db.close()
    except Exception as exc:
        print(f"[media-root] 初始化首批导入失败：{exc}")

    # 注册后台持续导入/监控服务（自动发现新增/变更的媒体文件）
    service = ensure_auto_scan_service(request.app)
    service.register_path(str(validated_path))
    service.trigger_path(str(validated_path))

    # 立即启动后台导入/索引任务 + 资产流水线预热 + 向量/标签/人脸 暖机任务
    try:
        if background is not None:
            # 查找/创建该 root 的来源ID
            from app.db import SessionLocal as _SL
            from app.db.models_extra import MediaSource as _MediaSource
            _db = _SL()
            try:
                src = _db.query(_MediaSource).filter(_MediaSource.root_path == str(validated_path)).first()
                if src:
                    from app.services.scan_service import start_scan_job
                    start_scan_job(src.id, src.root_path, background)
                    # 媒体根路径设置成功后，可选地为该来源预热缩略图/元数据等资产任务，
                    # 以便在“设置 > 资产处理进度”中能立即看到非 0 的统计。
                    if is_thumbnail_warmup_enabled():
                        background.add_task(warmup_assets_for_source, src.id)
                # 同时启动一次 CLIP/SigLIP 向量的增量构建任务，仅为当前活动媒体路径下
                # 缺少向量的媒体补齐 embedding。
                background.add_task(warmup_missing_clip_embeddings)
                # 标签暖机：对当前“活动媒体”做一轮标签重建，便于后续按标签检索。
                background.add_task(warmup_rebuild_tags_for_active_media)
                # 人脸暖机：基于当前媒体根目录跑一轮人脸聚类，写入 face_embeddings / face_clusters。
                background.add_task(warmup_rebuild_face_clusters, str(validated_path))
            finally:
                _db.close()
    except Exception:
        pass

    # 更新初始化协调器状态为已完成
    coordinator = _ensure_coordinator(request)
    from app.services.init_state import InitializationState
    coordinator.reset(
        state=InitializationState.COMPLETED,
        media_root_path=str(validated_path),
        message=(
            f"媒体库初始化完成，首批导入 {initial_batch} 个文件，后台持续导入/处理中。"
            if initial_batch
            else "媒体库初始化完成，后台持续导入/处理中。"
        ),
    )

    return {"success": True, "message": "媒体根路径设置成功"}


@router.get("/os-info", response_model=OSInfoResponse)
def get_os_info(request: Request, refresh: bool = Query(False, description="是否强制刷新网络信息缓存")):
    try:
        port = int(request.headers.get("x-forwarded-port") or request.url.port or 8000)
    except Exception:
        port = 8000

    # 读取缓存；当刷新参数为真或缓存过期时，快速重新探测
    ips = list_lan_ips(force_refresh=refresh)
    return OSInfoResponse(os=detect_os_name(), lan_ips=ips, port=port)


@router.post("/permissions/probe", response_model=list[ProbeResultModel])
def post_permissions_probe(payload: ProbeRequest):
    results = probe_paths(payload.paths)
    return [
        ProbeResultModel(path=r.path, status=r.status, reason=r.reason) for r in results
    ]


@router.get("/init-status", response_model=InitializationStatusResponse)
def get_initialization_status(request: Request, skip_auto_restore: bool = Query(False, description="跳过自动恢复状态")):
    coordinator = _ensure_coordinator(request)
    status = coordinator.snapshot()

    # 若初次访问时仍为默认状态，则根据数据库信息推断一次
    # 但只有在明确没有被手动重置的情况下才自动恢复
    if (not skip_auto_restore and
        status.state == InitializationState.IDLE and
        status.media_root_path is None and
        status.message != "初始化状态已重置，请重新设置媒体库路径。"):
        media_root = get_configured_media_root()
        if media_root and has_indexed_media():
            coordinator.reset(
                state=InitializationState.COMPLETED,
                media_root_path=str(media_root),
                message="媒体库已初始化。",
            )
            status = coordinator.snapshot()
    return InitializationStatusResponse(
        state=InitializationStateModel(status.state.value),
        message=status.message,
        media_root_path=status.media_root_path,
    )
