from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.schemas.fs import (
    DeleteRequest,
    ListResponse,
    MkdirRequest,
    MoveCopyRequest,
    RenameRequest,
    RootInfo,
    SortField,
    SortOrder,
)
from app.services import fs_service

router = APIRouter(prefix="/fs", tags=["fs"])


@router.get("/roots", response_model=list[RootInfo])
def list_roots():
    entries = fs_service.discover_roots()
    return [
        RootInfo(
            id=e.id,
            display_name=e.display_name,
            abs_path=str(e.path),
            writable=e.writable,
            available=e.available,
            removable=e.removable,
            total_bytes=e.total_bytes,
            free_bytes=e.free_bytes,
            platform=e.platform,
        )
        for e in entries
    ]


@router.get("/list", response_model=ListResponse)
def list_dir(
    root_id: str = Query(..., description="root id"),
    path: str = Query("", description="相对路径"),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    show_hidden: bool = Query(False),
    sort: SortField = Query(SortField.name),
    order: SortOrder = Query(SortOrder.asc),
):
    items, total = fs_service.list_dir(
        root_id,
        path,
        offset=offset,
        limit=limit,
        show_hidden=show_hidden,
        sort=sort.value,
        order=order.value,
    )
    return ListResponse(items=items, total=total, offset=offset, limit=limit)


@router.post("/mkdir", status_code=201)
def make_dir(req: MkdirRequest):
    fs_service.mkdir(req.root_id, req.path)
    return {"success": True}


@router.post("/rename")
def rename(req: RenameRequest):
    fs_service.rename(req.root_id, req.src_path, req.dst_path)
    return {"success": True}


@router.post("/delete")
def delete(req: DeleteRequest):
    fs_service.delete(req.root_id, req.paths)
    return {"success": True}


@router.post("/move")
def move(req: MoveCopyRequest):
    fs_service.move_or_copy(req.root_id, req.src_paths, req.dst_dir, op="move")
    return {"success": True}


@router.post("/copy")
def copy(req: MoveCopyRequest):
    fs_service.move_or_copy(req.root_id, req.src_paths, req.dst_dir, op="copy")
    return {"success": True}


@router.get("/file")
def get_file(root_id: str = Query(...), path: str = Query(...), disposition: str = Query("inline")):
    file_path = fs_service.file_path(root_id, path)
    mime = fs_service.guess_mime(file_path)
    response = FileResponse(path=file_path, filename=file_path.name, media_type=mime)
    if disposition == "attachment":
        response.headers["Content-Disposition"] = f"attachment; filename=\"{file_path.name}\""
    return response


@router.get("/thumb")
def get_thumb(
    root_id: str = Query(...),
    path: str = Query(...),
    w: int = Query(320, ge=64, le=1200),
    h: int = Query(320, ge=64, le=1200),
):
    file_path = fs_service.file_path(root_id, path)
    fingerprint = fs_service.compute_fingerprint(file_path)
    dest = fs_service.thumb_path_for_fingerprint(fingerprint)
    if not dest.exists():
        ok = fs_service.generate_thumbnail(file_path, dest, max_size=(w, h))
        if not ok:
            raise HTTPException(status_code=404, detail={"code": "thumb_failed", "message": "cannot generate thumbnail"})
    return FileResponse(dest, media_type="image/jpeg")
