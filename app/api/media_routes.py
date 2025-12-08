from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.schemas.media import (
    DeleteBatchReq,
    DeleteBatchResp,
    MediaMetadata,
    PageResponse,
    TagRequest,
)
from app.services import media_service
from app.services.exceptions import ServiceError

router = APIRouter(tags=["media"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _raise_service_error(exc: ServiceError):
    detail = str(exc) or exc.__class__.__name__
    raise HTTPException(status_code=exc.status_code, detail=detail)


@router.get("/media-list", response_model=PageResponse)
def get_media_list(
    seed: str | None = Query(None, description="会话随机种子（当未指定 tag 时必填）"),
    tag: str | None = Query(None, description="标签名，指定时返回该标签的列表"),
    query_text: str | None = Query(None, description="文本查询，支持词匹配标签 + CLIP 检索"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    order: str = Query("seeded", regex="^(seeded|recent)$"),
    db: Session = Depends(get_db),
):
    try:
        return media_service.get_media_page(
            db,
            seed=seed,
            tag=tag,
            query_text=query_text,
            offset=offset,
            limit=limit,
            order=order,
        )
    except ServiceError as exc:
        _raise_service_error(exc)


@router.post("/tag")
def add_tag(req: TagRequest, db: Session = Depends(get_db)):
    try:
        media_service.add_tag(db, media_id=req.media_id, tag=req.tag)
        return {"success": True}
    except ServiceError as exc:
        _raise_service_error(exc)


@router.delete("/tag", status_code=204)
def remove_tag(req: TagRequest, db: Session = Depends(get_db)):
    try:
        media_service.remove_tag(db, media_id=req.media_id, tag=req.tag)
    except ServiceError as exc:
        _raise_service_error(exc)


@router.get("/tags")
def list_tags(
    with_translation: bool = Query(False, description="返回包含 display_name 的对象数组"),
    db: Session = Depends(get_db),
):
    try:
        if with_translation:
            tags = media_service.list_tags_with_translation(db)
            return {"tags": tags}
        tags = media_service.list_tags(db)
        return {"tags": tags}
    except ServiceError as exc:
        _raise_service_error(exc)


@router.delete("/media/{media_id}", status_code=204)
def delete_media_item(
    media_id: int,
    delete_file: bool = Query(True, description="是否同时删除原始文件"),
    db: Session = Depends(get_db),
):
    try:
        media_service.delete_media(db, media_id=media_id, delete_file=delete_file)
    except ServiceError as exc:
        _raise_service_error(exc)


@router.post("/media/batch-delete", response_model=DeleteBatchResp)
def batch_delete_media(req: DeleteBatchReq, db: Session = Depends(get_db)):
    try:
        return media_service.batch_delete_media(db, ids=req.ids, delete_file=req.delete_file)
    except ServiceError as exc:
        _raise_service_error(exc)


@router.get("/media/{key}/thumbnail")
def get_media_thumbnail(key: str, db: Session = Depends(get_db)):
    try:
        payload = media_service.get_thumbnail_payload(db, key=key)
        return FileResponse(path=payload.path, media_type=payload.media_type, headers=payload.headers)
    except ServiceError as exc:
        _raise_service_error(exc)


@router.get("/media/{media_id}/metadata", response_model=MediaMetadata)
def get_media_metadata(media_id: int, db: Session = Depends(get_db)):
    try:
        return media_service.get_media_metadata(db, media_id=media_id)
    except ServiceError as exc:
        _raise_service_error(exc)


@router.get("/media-resource/{media_id}")
def get_media_resource(media_id: int, request: Request, db: Session = Depends(get_db)):
    range_header = request.headers.get("range") or request.headers.get("Range")
    try:
        payload = media_service.get_media_resource_payload(db, media_id=media_id, range_header=range_header)
    except ServiceError as exc:
        _raise_service_error(exc)
    if payload.use_file_response:
        if not payload.file_path:
            raise HTTPException(status_code=500, detail="missing file path")
        return FileResponse(path=payload.file_path, media_type=payload.media_type, headers=payload.headers)
    return StreamingResponse(
        payload.stream,
        status_code=payload.status_code,
        media_type=payload.media_type,
        headers=payload.headers,
    )
