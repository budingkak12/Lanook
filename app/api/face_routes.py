from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.schemas.face import (
    ClusterMediaItem,
    ClusterMediaResponse,
    FaceClusterModel,
    RebuildFacesRequest,
    RebuildFacesResponse,
)
from app.services import face_cluster_service
from app.services.exceptions import ServiceError

router = APIRouter(prefix="/face-clusters", tags=["faces"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _raise_service_error(exc: ServiceError):
    detail = str(exc) or exc.__class__.__name__
    raise HTTPException(status_code=exc.status_code, detail=detail)


@router.post("/rebuild", response_model=RebuildFacesResponse)
def rebuild_face_clusters(req: RebuildFacesRequest, db: Session = Depends(get_db)):
    try:
        media_count, face_count, cluster_count, path, version = face_cluster_service.rebuild_clusters(
            db,
            base_path=req.base_path,
            similarity_threshold=req.similarity_threshold,
        )
    except ServiceError as exc:
        _raise_service_error(exc)

    return RebuildFacesResponse(
        mediaCount=media_count,
        faceCount=face_count,
        clusterCount=cluster_count,
        threshold=req.similarity_threshold,
        basePath=str(path),
        pipelineVersion=version,
    )


@router.get("", response_model=list[FaceClusterModel])
def list_face_clusters(db: Session = Depends(get_db)):
    try:
        clusters = face_cluster_service.list_clusters(db)
    except ServiceError as exc:
        _raise_service_error(exc)

    return [
        FaceClusterModel(
            id=cluster.id,
            label=cluster.label,
            faceCount=cluster.face_count,
            representativeMediaId=cluster.representative_media_id,
            representativeFaceId=cluster.representative_face_id,
        )
        for cluster in clusters
    ]


@router.get("/{cluster_id}", response_model=ClusterMediaResponse)
def get_cluster_media(cluster_id: int, db: Session = Depends(get_db)):
    try:
        cluster, faces = face_cluster_service.list_cluster_media(db, cluster_id)
    except ServiceError as exc:
        _raise_service_error(exc)

    seen_media: set[int] = set()
    items: list[ClusterMediaItem] = []
    for face in faces:
        if face.media_id in seen_media:
            continue
        seen_media.add(face.media_id)
        media = face.media
        items.append(
            ClusterMediaItem(
                mediaId=face.media_id,
                filename=media.filename if media else "unknown",
                thumbnailUrl=f"/media/{face.media_id}/thumbnail",
            )
        )

    cluster_payload = FaceClusterModel(
        id=cluster.id,
        label=cluster.label,
        faceCount=cluster.face_count,
        representativeMediaId=cluster.representative_media_id,
        representativeFaceId=cluster.representative_face_id,
    )

    return ClusterMediaResponse(cluster=cluster_payload, items=items)
