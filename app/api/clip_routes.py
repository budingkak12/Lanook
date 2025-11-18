from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.schemas.clip import (
    ClipRebuildRequest,
    ClipRebuildResponse,
    ClipSearchRequest,
    ClipSearchResponse,
)
from app.services import clip_service
from app.services.exceptions import ServiceError

router = APIRouter(tags=["clip"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _raise(exc: ServiceError):
    detail = str(exc) or exc.__class__.__name__
    raise HTTPException(status_code=exc.status_code, detail=detail)


@router.post("/clip/rebuild", response_model=ClipRebuildResponse)
def rebuild_clip_embeddings(req: ClipRebuildRequest, db: Session = Depends(get_db)):
    try:
        stats = clip_service.rebuild_embeddings(
            db,
            base_path=req.base_path,
            model_name=req.model,
            media_ids=req.media_ids,
            batch_size=req.batch_size,
            limit=req.limit,
        )
        return stats
    except ServiceError as exc:
        _raise(exc)


@router.post("/search/clip", response_model=ClipSearchResponse)
def clip_search(req: ClipSearchRequest, db: Session = Depends(get_db)):
    if not req.query_text and req.image_id is None:
        raise HTTPException(status_code=400, detail="query_text 或 image_id 至少提供一个")
    try:
        payload = clip_service.search(
            db,
            query_text=req.query_text,
            image_id=req.image_id,
            top_k=req.top_k,
            model_name=req.model,
        )
        return payload
    except ServiceError as exc:
        _raise(exc)
