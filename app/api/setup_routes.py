from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException, Query, Request, Response

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
from app.services.auto_scan_service import ensure_auto_scan_service
from app.services.scan_service import scan_source_once

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
):
    try:
        # 允许本地目录或 SMB URL
        validated_path = validate_media_root(payload.path)
    except MediaInitializationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # 设置媒体根路径
    from 初始化数据库 import SessionLocal, set_setting, MEDIA_ROOT_KEY
    db = SessionLocal()
    try:
        set_setting(db, MEDIA_ROOT_KEY, str(validated_path))
        db.commit()
    finally:
        db.close()

    # 先同步导入一小批媒体，确保前端立即可见
    initial_batch = 0
    try:
        from 初始化数据库 import seed_initial_data, create_database_and_tables

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
        print(f"[media-root] 初始化首批扫描失败：{exc}")

    # 注册后台持续扫描
    service = ensure_auto_scan_service(request.app)
    service.register_path(str(validated_path))
    service.trigger_path(str(validated_path))

    # 更新初始化协调器状态为已完成
    coordinator = _ensure_coordinator(request)
    from app.services.init_state import InitializationState
    coordinator.reset(
        state=InitializationState.COMPLETED,
        media_root_path=str(validated_path),
        message=(
            f"媒体库初始化完成，首批导入 {initial_batch} 个文件，后台持续扫描中。"
            if initial_batch
            else "媒体库初始化完成，后台持续扫描中。"
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
