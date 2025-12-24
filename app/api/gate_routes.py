from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import Media, SessionLocal
from app.services.asset_pipeline import enqueue_security_gate

router = APIRouter(prefix="/gate", tags=["gate"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class GateByPathRequest(BaseModel):
    absolute_path: str = Field(..., description="媒体绝对路径（与 media.absolute_path 完全一致）")


@router.post("/media/{media_id}")
def run_gate_for_media(media_id: int):
    enqueue_security_gate(media_id)
    return {"queued": True, "media_id": media_id}


@router.post("/by-path")
def run_gate_by_path(req: GateByPathRequest, db: Session = Depends(get_db)):
    media = db.query(Media).filter(Media.absolute_path == req.absolute_path).first()
    if not media:
        raise HTTPException(status_code=404, detail="media not found")
    enqueue_security_gate(int(media.id))
    return {"queued": True, "media_id": int(media.id)}

