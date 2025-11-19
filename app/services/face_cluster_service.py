from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence

import cv2
import numpy as np
import hdbscan
import onnxruntime as ort
from insightface.app import FaceAnalysis
from insightface.model_zoo import model_zoo
from sqlalchemy.orm import Session

from app.db import Media
from app.db.models import FaceCluster, FaceEmbedding
from app.services.exceptions import FaceClusterNotFoundError, FaceProcessingError


_SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
_face_app: FaceAnalysis | None = None
_face_model_descriptor: str | None = None

PIPELINE_VERSION = "face-v3"
_FACE_MODEL_NAME = os.environ.get("FACE_CLUSTER_MODEL", "buffalo_l")
_FACE_MODEL_DIR = Path(os.environ.get("FACE_CLUSTER_MODEL_DIR", "models/insightface/buffalo_l")).expanduser()
_FACE_MODEL_ROOT = os.environ.get("FACE_CLUSTER_MODEL_ROOT", "~/.insightface")
_FACE_MODEL_PROVIDERS = os.environ.get("FACE_CLUSTER_ORT_PROVIDERS", "CPUExecutionProvider")
_MIN_DET_SCORE = 0.6
_MIN_FACE_SIZE = 48  # pixels


def _get_face_app() -> FaceAnalysis:
    global _face_app, _face_model_descriptor
    if _face_app is None:
        providers = _parse_providers(_FACE_MODEL_PROVIDERS)
        if _FACE_MODEL_DIR.exists():
            face_app = _load_local_face_app(_FACE_MODEL_DIR, providers)
            _face_model_descriptor = str(_FACE_MODEL_DIR.resolve())
        else:
            face_app = FaceAnalysis(
                name=_FACE_MODEL_NAME,
                root=_FACE_MODEL_ROOT,
                providers=providers,
            )
            _face_model_descriptor = str(Path(face_app.model_dir).expanduser().resolve())
        face_app.prepare(ctx_id=-1, det_size=(640, 640))
        _face_app = face_app
    return _face_app


def _parse_providers(raw: str | None) -> list[str]:
    if not raw:
        return ["CPUExecutionProvider"]
    providers = [item.strip() for item in raw.split(",") if item.strip()]
    return providers or ["CPUExecutionProvider"]


def _load_local_face_app(model_dir: Path, providers: Sequence[str]) -> FaceAnalysis:
    if not model_dir.is_dir():
        raise FaceProcessingError(f"本地 ONNX 模型目录不存在: {model_dir}")
    onnx_files = sorted(model_dir.glob("*.onnx"))
    if not onnx_files:
        raise FaceProcessingError(f"目录中未找到 ONNX 模型: {model_dir}")

    ort.set_default_logger_severity(3)
    face_app = FaceAnalysis.__new__(FaceAnalysis)
    face_app.models = {}
    face_app.model_dir = str(model_dir)

    for onnx_file in onnx_files:
        try:
            model = model_zoo.get_model(str(onnx_file), providers=providers)
        except Exception as exc:  # pragma: no cover - 防止环境差异导致崩溃
            raise FaceProcessingError(f"加载人脸模型失败: {onnx_file}") from exc
        if model is None:
            continue
        taskname = getattr(model, "taskname", None)
        if taskname is None:
            continue
        if taskname in face_app.models:
            continue
        face_app.models[taskname] = model

    if "detection" not in face_app.models:
        raise FaceProcessingError(f"本地模型缺少人脸检测子模型: {model_dir}")

    face_app.det_model = face_app.models["detection"]
    return face_app


def _current_pipeline_signature() -> str:
    descriptor = _face_model_descriptor
    if descriptor:
        return f"{PIPELINE_VERSION}:{descriptor}"
    if _FACE_MODEL_DIR.exists():
        return f"{PIPELINE_VERSION}:{_FACE_MODEL_DIR}"
    return f"{PIPELINE_VERSION}:{_FACE_MODEL_NAME}"


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
    # 已弃用（V1/V2 兼容函数），保留占位以防外部引用；V3 直接使用 HDBSCAN
    return [], []


def rebuild_clusters(db: Session, *, base_path: str, similarity_threshold: float) -> tuple[int, int, int, Path, str]:
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
            bbox = face.bbox
            left, top, right, bottom = map(float, bbox)
            width = max(right - left, 1.0)
            height = max(bottom - top, 1.0)
            if width < _MIN_FACE_SIZE or height < _MIN_FACE_SIZE:
                continue
            if face.det_score is not None and face.det_score < _MIN_DET_SCORE:
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
        return media_count, 0, 0, root, _current_pipeline_signature()

    embeddings = np.stack([_normalize(face.embedding.astype(np.float32)) for face in detected], axis=0)
    if embeddings.shape[0] >= 2:
        min_cluster_size = max(2, int(len(embeddings) * 0.05))
        min_samples = max(1, int(min_cluster_size * 0.5))
        epsilon = max(0.25 * (1 - similarity_threshold), 1e-3)
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric="euclidean",
            cluster_selection_epsilon=epsilon,
            cluster_selection_method="eom",
        )
        labels = clusterer.fit_predict(embeddings)
    else:
        labels = np.zeros(embeddings.shape[0], dtype=int)

    if hasattr(labels, "tolist"):
        label_list = [int(v) for v in labels.tolist()]
    else:
        label_list = [int(v) for v in labels]

    clusters: dict[int, list[int]] = {}
    noise_indices: list[int] = []
    for idx, label in enumerate(label_list):
        if label < 0:
            noise_indices.append(idx)
            continue
        clusters.setdefault(label, []).append(idx)

    # 把噪声单独作为小簇，避免漏掉人脸
    next_label = (max(clusters.keys()) + 1) if clusters else 0
    noise_label_map: dict[int, int] = {}
    for idx in noise_indices:
        clusters[next_label] = [idx]
        noise_label_map[idx] = next_label
        next_label += 1

    if noise_label_map:
        for idx, label in enumerate(label_list):
            if label < 0:
                label_list[idx] = noise_label_map.get(idx, label)

    ordered = sorted(clusters.items(), key=lambda item: (-len(item[1]), item[0]))
    label_to_new_index = {label: new_idx for new_idx, (label, _) in enumerate(ordered)}
    sorted_clusters = [members for _, members in ordered]

    cluster_objs: list[FaceCluster] = []
    for cid, member_indices in enumerate(sorted_clusters, start=1):
        rep_idx = member_indices[0]
        rep_face = detected[rep_idx]
        cluster_obj = FaceCluster(
            label=f"Cluster {cid:02d}",
            face_count=len(member_indices),
            representative_media_id=rep_face.media_id,
        )
        db.add(cluster_obj)
        cluster_objs.append(cluster_obj)

    db.flush()

    face_rows: list[FaceEmbedding] = []
    for idx, face in enumerate(detected):
        mapped_index = label_to_new_index[label_list[idx]]
        cluster_obj = cluster_objs[mapped_index]
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

    for cid, cluster_obj in enumerate(cluster_objs):
        rep_idx = sorted_clusters[cid][0]
        cluster_obj.representative_face_id = face_rows[rep_idx].id

    db.commit()

    return media_count, len(detected), len(cluster_objs), root, _current_pipeline_signature()


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
