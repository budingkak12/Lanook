from pathlib import Path
from typing import List

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request

from app.schemas.setup import (
    DirectoryEntryModel,
    DirectoryListResponse,
    InitializationStateModel,
    InitializationStatusResponse,
    MediaRootRequest,
)
from app.services.filesystem_browser import DirectoryInfo, list_roots, list_subdirectories
from app.services.init_state import InitializationCoordinator, InitializationState
from app.services.media_initializer import (
    MediaInitializationError,
    get_configured_media_root,
    has_indexed_media,
    validate_media_root,
)

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


@router.post("/media-root", response_model=InitializationStatusResponse, status_code=202)
def set_media_root(
    request: Request,
    payload: MediaRootRequest,
    background_tasks: BackgroundTasks,
):
    try:
        validated_path = validate_media_root(Path(payload.path))
    except MediaInitializationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    coordinator = _ensure_coordinator(request)
    try:
        coordinator.start(background_tasks, validated_path)
    except RuntimeError:
        raise HTTPException(status_code=409, detail="初始化已在进行中，请稍候。")

    status = coordinator.snapshot()
    return InitializationStatusResponse(
        state=InitializationStateModel(status.state.value),
        message=status.message,
        media_root_path=status.media_root_path,
    )


@router.get("/init-status", response_model=InitializationStatusResponse)
def get_initialization_status(request: Request):
    coordinator = _ensure_coordinator(request)
    status = coordinator.snapshot()

    # 若初次访问时仍为默认状态，则根据数据库信息推断一次
    if status.state == InitializationState.IDLE and status.media_root_path is None:
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
