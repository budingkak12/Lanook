from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.schemas.tags import TagsRebuildRequest, TagsRebuildResponse, MediaTagsResponse
from app.services import wd_tag_service
from app.services.exceptions import ServiceError


router = APIRouter(tags=["tags"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _raise(exc: ServiceError):
    detail = str(exc) or exc.__class__.__name__
    raise HTTPException(status_code=exc.status_code, detail=detail)


@router.post("/tags/rebuild", response_model=TagsRebuildResponse)
def rebuild_tags(req: TagsRebuildRequest, db: Session = Depends(get_db)):
    try:
        stats = wd_tag_service.rebuild_tags(
            db,
            base_path=req.base_path,
            media_ids=req.media_ids,
            batch_size=req.batch_size,
            limit=req.limit,
            model_name=req.model,
            whitelist_path=req.whitelist_path,
            min_confidence=req.min_confidence,
            max_tags_per_media=req.max_tags_per_media,
        )
        return stats
    except ServiceError as exc:
        _raise(exc)


@router.get("/media/{media_id}/tags", response_model=MediaTagsResponse)
def get_media_tags(media_id: int, db: Session = Depends(get_db)):
    try:
        return wd_tag_service.list_media_tags(db, media_id)
    except ServiceError as exc:
        _raise(exc)
