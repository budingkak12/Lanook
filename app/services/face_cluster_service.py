from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from sqlalchemy.orm import Session

from app.db import Media
from app.db.models import FaceCluster, FaceEmbedding
from app.services.exceptions import FaceClusterNotFoundError, FaceProcessingError


_SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
_face_app: FaceAnalysis | None = None


def _get_face_app() -> FaceAnalysis:
    global _face_app
    if _face_app is None:
        face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        face_app.prepare(ctx_id=-1, det_size=(640, 640))
        _face_app = face_app
    return _face_app


def _normalize(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    if norm == 0:
        return vec
    return vec / norm


def _resolve_base_path(base_path: str) -> Path:
    raw = Path(base_path)
    if not raw.is_absolute():
        raw = Path(os.getcwd()) / raw
    resolved = raw.expanduser().resolve()
    if not resolved.exists():
        raise FaceProcessingError(f"目录不存在: {resolved}")
    if not resolved.is_dir():
        raise FaceProcessingError(f"目标必须是目录: {resolved}")
    return resolved


def _iter_media_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in _SUPPORTED_SUFFIXES:
            yield path


def _read_image(file_path: Path):
    data = np.fromfile(str(file_path), dtype=np.uint8)
    if data.size == 0:
        return None
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    return image


def _ensure_media_record(db: Session, file_path: Path) -> Media:
    absolute = str(file_path)
    media = db.query(Media).filter(Media.absolute_path == absolute).first()
    if media:
        return media
    media_type = "image"
    media = Media(filename=file_path.name, absolute_path=absolute, media_type=media_type)
    db.add(media)
    db.flush()
    return media


@dataclass
class _DetectedFace:
    embedding: np.ndarray
    bbox: Sequence[float]
    score: float
    media_id: int
    media_filename: str
    face_index: int


def _cluster_embeddings(faces: List[_DetectedFace], threshold: float):
    clusters: list[dict] = []
    assignments: list[int] = []
    for idx, face in enumerate(faces):
        vec = _normalize(face.embedding.astype(np.float32))
        best_idx = -1
        best_score = -1.0
        for cid, info in enumerate(clusters):
            score = float(np.dot(info["centroid"], vec))
            if score > best_score:
                best_score = score
                best_idx = cid
        if best_idx >= 0 and best_score >= threshold:
            info = clusters[best_idx]
            info["members"].append(idx)
            info["centroid_sum"] += vec
            info["centroid"] = _normalize(info["centroid_sum"] / len(info["members"]))
            assignments.append(best_idx)
        else:
            clusters.append({
                "centroid": vec,
                "centroid_sum": vec.copy(),
                "members": [idx],
            })
            assignments.append(len(clusters) - 1)
    return assignments, clusters


def rebuild_clusters(db: Session, *, base_path: str, similarity_threshold: float) -> tuple[int, int, int, Path]:
    root = _resolve_base_path(base_path)
    face_app = _get_face_app()

    db.query(FaceEmbedding).delete(synchronize_session=False)
    db.query(FaceCluster).delete(synchronize_session=False)
    db.commit()

    detected: list[_DetectedFace] = []
    media_count = 0
    for file_path in _iter_media_files(root):
        image = _read_image(file_path)
        if image is None:
            continue
        media = _ensure_media_record(db, file_path)
        media_count += 1
        faces = face_app.get(image)
        for idx, face in enumerate(faces):
            if face.embedding is None:
                continue
            detected.append(
                _DetectedFace(
                    embedding=face.embedding.astype(np.float32),
                    bbox=face.bbox,
                    score=float(face.det_score) if face.det_score is not None else 0.0,
                    media_id=media.id,
                    media_filename=media.filename,
                    face_index=idx,
                )
            )

    if not detected:
        db.commit()
        return media_count, 0, 0, root

    assignments, clusters = _cluster_embeddings(detected, similarity_threshold)

    cluster_objs: list[FaceCluster] = []
    for cid, info in enumerate(clusters, start=1):
        rep_idx = info["members"][0]
        rep_face = detected[rep_idx]
        cluster_obj = FaceCluster(
            label=f"Cluster {cid:02d}",
            face_count=len(info["members"]),
            representative_media_id=rep_face.media_id,
        )
        db.add(cluster_obj)
        cluster_objs.append(cluster_obj)

    db.flush()

    face_rows: list[FaceEmbedding] = []
    for idx, face in enumerate(detected):
        cluster_obj = cluster_objs[assignments[idx]]
        bbox = face.bbox
        left, top, right, bottom = map(int, bbox)
        row = FaceEmbedding(
            media_id=face.media_id,
            face_index=face.face_index,
            embedding=face.embedding.astype(np.float32).tobytes(),
            embedding_dim=face.embedding.shape[0],
            detection_confidence=face.score,
            bbox_left=left,
            bbox_top=top,
            bbox_width=max(right - left, 1),
            bbox_height=max(bottom - top, 1),
            cluster_id=cluster_obj.id,
        )
        db.add(row)
        face_rows.append(row)

    db.flush()

    for idx, cluster_obj in enumerate(cluster_objs):
        rep_idx = clusters[idx]["members"][0]
        cluster_obj.representative_face_id = face_rows[rep_idx].id

    db.commit()

    return media_count, len(detected), len(cluster_objs), root


def list_clusters(db: Session) -> list[FaceCluster]:
    return db.query(FaceCluster).order_by(FaceCluster.face_count.desc(), FaceCluster.id.asc()).all()


def get_cluster_or_404(db: Session, cluster_id: int) -> FaceCluster:
    cluster = db.query(FaceCluster).filter(FaceCluster.id == cluster_id).first()
    if not cluster:
        raise FaceClusterNotFoundError(f"未找到聚类 {cluster_id}")
    return cluster


def list_cluster_media(db: Session, cluster_id: int) -> tuple[FaceCluster, List[FaceEmbedding]]:
    cluster = get_cluster_or_404(db, cluster_id)
    faces = (
        db.query(FaceEmbedding)
        .filter(FaceEmbedding.cluster_id == cluster.id)
        .order_by(FaceEmbedding.media_id.asc())
        .all()
    )
    return cluster, faces
