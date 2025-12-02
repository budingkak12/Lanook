from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.schemas.upload import ChunkRequest, FinishRequest, InitUploadRequest, InitUploadResponse
from app.services.upload_service import (
    ChecksumMismatch,
    ChunkOutOfRange,
    DuplicateFinish,
    SizeMismatch,
    UploadNotFound,
    UploadService,
)

router = APIRouter(prefix="/upload", tags=["upload"])

_upload_service = UploadService()


def get_upload_service() -> UploadService:
    return _upload_service


@router.post("/init", response_model=InitUploadResponse)
def init_upload(req: InitUploadRequest, service: UploadService = Depends(get_upload_service)):
    return service.init_upload(req)


@router.get("/{upload_id}")
def chunk_status(upload_id: str, service: UploadService = Depends(get_upload_service)):
    return service.get_status(upload_id)


@router.post("/chunk", status_code=status.HTTP_204_NO_CONTENT)
async def upload_chunk(
    upload_id: str = Form(...),
    index: int = Form(...),
    checksum: str | None = Form(None),
    file: UploadFile = File(...),
    service: UploadService = Depends(get_upload_service),
):
    try:
        await service.save_chunk(
            ChunkRequest(upload_id=upload_id, index=index, checksum=checksum),
            file,
        )
    except DuplicateFinish as exc:
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": str(exc)})
    except UploadNotFound as exc:
        raise HTTPException(status_code=404, detail={"code": exc.code, "message": str(exc)})
    except ChunkOutOfRange as exc:
        raise HTTPException(status_code=400, detail={"code": exc.code, "message": str(exc)})
    return None


@router.post("/finish")
def finish_upload(req: FinishRequest, service: UploadService = Depends(get_upload_service)):
    try:
        final_path = service.finish_upload(req)
        return {"path": str(final_path)}
    except UploadNotFound as exc:
        raise HTTPException(status_code=404, detail={"code": exc.code, "message": str(exc)})
    except DuplicateFinish as exc:
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": str(exc)})
    except (ChunkOutOfRange, ChecksumMismatch, SizeMismatch) as exc:
        raise HTTPException(status_code=400, detail={"code": exc.code, "message": str(exc)})
