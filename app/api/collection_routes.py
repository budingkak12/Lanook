from __future__ import annotations

from typing import List

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import SessionLocal
# Corrected schemas import to point to the created collection schema file
from app.schemas.collection import (
    Collection,
    CollectionCreate,
    CollectionUpdate,
    SmartAddRequest,
)
from app.schemas.media import MediaItem
from app.services import collection_service, media_service
from app.services.exceptions import ServiceError

router = APIRouter(prefix="/collections", tags=["collections"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _raise_service_error(exc: ServiceError):
    detail = str(exc) or exc.__class__.__name__
    raise HTTPException(status_code=exc.status_code, detail=detail)


@router.post("/", response_model=Collection)
def create_collection(data: CollectionCreate, db: Session = Depends(get_db)):
    try:
        return collection_service.create_collection(db, data)
    except ServiceError as exc:
        _raise_service_error(exc)


@router.get("/", response_model=List[Collection])
def list_collections(db: Session = Depends(get_db)):
    try:
        return collection_service.list_collections(db)
    except ServiceError as exc:
        _raise_service_error(exc)


@router.get("/{col_id}", response_model=Collection)
def get_collection(col_id: int, db: Session = Depends(get_db)):
    try:
        col = collection_service.get_collection(db, col_id)
        if not col:
            raise HTTPException(status_code=404, detail="Collection not found")
        return col
    except ServiceError as exc:
        _raise_service_error(exc)


@router.patch("/{col_id}", response_model=Collection)
def update_collection(col_id: int, data: CollectionUpdate, db: Session = Depends(get_db)):
    try:
        col = collection_service.update_collection(db, col_id, data)
        if not col:
            raise HTTPException(status_code=404, detail="Collection not found")
        return col
    except ServiceError as exc:
        _raise_service_error(exc)


@router.delete("/{col_id}")
def delete_collection(col_id: int, db: Session = Depends(get_db)):
    try:
        success = collection_service.delete_collection(db, col_id)
        if not success:
            raise HTTPException(status_code=404, detail="Collection not found")
        return {"ok": True}
    except ServiceError as exc:
        _raise_service_error(exc)


@router.post("/{col_id}/items")
def add_items_to_collection(col_id: int, req: SmartAddRequest, db: Session = Depends(get_db)):
    try:
        count = collection_service.add_items_to_collection(db, col_id, req)
        return {"added_count": count}
    except ServiceError as exc:
        _raise_service_error(exc)


@router.delete("/{col_id}/items")
def remove_items_from_collection(col_id: int, media_ids: List[int] = Body(...), db: Session = Depends(get_db)):
    try:
        count = collection_service.remove_items_from_collection(db, col_id, media_ids)
        return {"removed_count": count}
    except ServiceError as exc:
        _raise_service_error(exc)


@router.get("/{col_id}/items", response_model=List[MediaItem])
def list_collection_items(
    col_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    try:
        medias = collection_service.list_collection_items(db, col_id, offset, limit)
        return [media_service._to_media_item(db, m, include_thumb=True) for m in medias]
    except ServiceError as exc:
        _raise_service_error(exc)
