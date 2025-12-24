from __future__ import annotations

import os
import re
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

import faiss
import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from tqdm.auto import tqdm
from sentence_transformers import SentenceTransformer
from sqlalchemy import func
from sqlalchemy.orm import Session

from transformers import (
    CLIPModel,
    CLIPProcessor,
    ChineseCLIPModel,
    ChineseCLIPProcessor,
    SiglipProcessor,
)
from transformers.models.chinese_clip.modeling_chinese_clip import ChineseCLIPTextPooler

from app.db import ClipEmbedding, MEDIA_ROOT_KEY, Media, get_setting
from app.db.models_extra import MediaSource
from app.services.exceptions import MediaNotFoundError, ServiceError
from app.services.model_input_image import resolve_model_input_image_path
from app.services.query_filters import apply_active_media_filter


class ClipSearchError(ServiceError):
    default_status = 500


class ClipIndexNotReady(ServiceError):
    default_status = 503


@dataclass
class ClipSearchResult:
    media: Media
    score: float


_MODEL_ALIASES = {
    # 默认走本地 SigLIP ONNX；如需回退可通过环境变量覆盖
    "siglip": "models/siglip-onnx",
    "siglip-base": "models/siglip-onnx",
    "siglip-base-patch16-224": "models/siglip-onnx",
    "siglip-onnx": "models/siglip-onnx",
    "clip": "models/chinese-clip-vit-base-patch16",
    "clip-zh": "models/chinese-clip-vit-base-patch16",
    "chinese-clip": "models/chinese-clip-vit-base-patch16",
    "clip-vit-b-32": "clip-ViT-B-32",
    "vit-b-32": "clip-ViT-B-32",
    "vit-l-14": "clip-ViT-L-14",
}

_SIGLIP_TEXT_ONNX = "siglip_text_encoder.onnx"
_SIGLIP_VISION_ONNX = "siglip_vision_encoder.onnx"

_DEFAULT_MODEL = os.environ.get("CLIP_MODEL", "siglip")
_DEFAULT_DEVICE = os.environ.get("CLIP_DEVICE", "cpu")
_FAISS_DIR = Path(os.environ.get("CLIP_FAISS_DIR", "faiss_vectors"))

# macOS/CPU 环境下限制 OMP 线程，避免 sentence-transformers/timm 初始化崩溃。
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

_encoder_cache: dict[str, "BaseClipEncoder"] = {}

# tqdm 的 monitor 线程在 macOS Python 3.12 上退出时偶发崩溃，这里关闭监控线程。
tqdm.monitor_interval = 0


def _resolve_model_name(name: str | None) -> str:
    if not name:
        name = _DEFAULT_MODEL
    lowered = name.strip().lower()
    return _MODEL_ALIASES.get(lowered, name.strip())


def _is_onnx_model(path_str: str) -> bool:
    path = Path(path_str)
    if path.is_dir():
        return (path / _SIGLIP_TEXT_ONNX).exists() and (path / _SIGLIP_VISION_ONNX).exists()
    return path.suffix.lower() == ".onnx"


def _is_transformers_clip_model(path_str: str) -> bool:
    path = Path(path_str)
    if not path.is_dir():
        return False
    has_config = (path / "config.json").exists()
    has_weights = any((path / candidate).exists() for candidate in ("pytorch_model.bin", "model.safetensors"))
    return has_config and has_weights


def _detect_model_type(path_str: str) -> Optional[str]:
    path = Path(path_str) / "config.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return data.get("model_type")
    except Exception:
        return None


def _get_encoder(model_name: str) -> "BaseClipEncoder":
    resolved = _resolve_model_name(model_name)
    cached = _encoder_cache.get(resolved)
    if cached:
        return cached
    if _is_onnx_model(resolved):
        encoder = SiglipOrtEncoder(resolved)
    elif _is_transformers_clip_model(resolved):
        encoder = TransformersClipEncoder(resolved)
    else:
        encoder = SentenceTransformerEncoder(resolved)
    _encoder_cache[resolved] = encoder
    return encoder


def _resolve_torch_device() -> torch.device:
    requested = (_DEFAULT_DEVICE or "cpu").strip().lower()
    if requested.startswith("cuda") and torch.cuda.is_available():
        return torch.device(requested)
    if requested in {"cuda", "cuda:0"} and torch.cuda.is_available():
        return torch.device("cuda")
    if requested.startswith("mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _normalize(vec: np.ndarray) -> np.ndarray:
    if vec.ndim == 1:
        norm = np.linalg.norm(vec)
        if norm == 0:
            return vec
        return vec / norm
    faiss.normalize_L2(vec)
    return vec


class BaseClipEncoder:
    def encode_images(self, images: List[Image.Image], batch_size: int = 8) -> np.ndarray:  # pragma: no cover - interface
        raise NotImplementedError

    def encode_texts(self, texts: List[str], batch_size: int = 8) -> np.ndarray:  # pragma: no cover - interface
        raise NotImplementedError


class SentenceTransformerEncoder(BaseClipEncoder):
    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self.model = SentenceTransformer(model_name, device=_DEFAULT_DEVICE)

    def encode_images(self, images: List[Image.Image], batch_size: int = 8) -> np.ndarray:
        return self.model.encode(
            images,
            batch_size=batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

    def encode_texts(self, texts: List[str], batch_size: int = 8) -> np.ndarray:
        emb = self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            batch_size=batch_size,
            show_progress_bar=False,
        )
        return np.asarray(emb, dtype=np.float32)


class SiglipOrtEncoder(BaseClipEncoder):
    TEXT_ONNX = _SIGLIP_TEXT_ONNX
    VISION_ONNX = _SIGLIP_VISION_ONNX

    def __init__(self, model_path: str) -> None:
        self.base_path = Path(model_path)
        if self.base_path.is_file():
            self.model_dir = self.base_path.parent
        else:
            self.model_dir = self.base_path

        self.text_model_path = self._resolve_file(self.TEXT_ONNX)
        self.vision_model_path = self._resolve_file(self.VISION_ONNX)
        if not self.text_model_path.exists() or not self.vision_model_path.exists():
            raise ClipSearchError(f"SigLIP ONNX 模型缺失，请检查目录 {self.model_dir}")

        providers_env = os.environ.get("CLIP_ORT_PROVIDERS", "CPUExecutionProvider")
        providers = [p.strip() for p in providers_env.split(",") if p.strip()]
        session_options = ort.SessionOptions()
        intra = os.environ.get("ORT_INTRA_OP_THREADS")
        inter = os.environ.get("ORT_INTER_OP_THREADS")
        if intra:
            session_options.intra_op_num_threads = int(intra)
        if inter:
            session_options.inter_op_num_threads = int(inter)

        self.processor = SiglipProcessor.from_pretrained(str(self.model_dir))
        self.text_session = ort.InferenceSession(
            str(self.text_model_path),
            sess_options=session_options,
            providers=providers,
        )
        self.vision_session = ort.InferenceSession(
            str(self.vision_model_path),
            sess_options=session_options,
            providers=providers,
        )
        self.text_dim = self._infer_output_dim(self.text_session)
        self.image_dim = self._infer_output_dim(self.vision_session)

    def _resolve_file(self, filename: str) -> Path:
        if self.base_path.is_file() and self.base_path.name == filename:
            return self.base_path
        return self.model_dir / filename

    def encode_texts(self, texts: List[str], batch_size: int = 8) -> np.ndarray:
        outputs: list[np.ndarray] = []
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            encoded = self.processor(
                text=batch,
                padding="max_length",
                truncation=True,
                return_attention_mask=True,
                return_tensors="np",
            )
            ids = encoded["input_ids"].astype(np.int64)
            mask = encoded["attention_mask"].astype(np.int64)
            for i in range(ids.shape[0]):
                inputs = {
                    "input_ids": ids[i : i + 1],
                    "attention_mask": mask[i : i + 1],
                }
                outputs.append(self.text_session.run(None, inputs)[0])
        dim = self.text_dim or self.image_dim or 768
        result = np.concatenate(outputs, axis=0) if outputs else np.zeros((0, dim), dtype=np.float32)
        _normalize(result)
        return result

    def encode_images(self, images: List[Image.Image], batch_size: int = 8) -> np.ndarray:
        outputs: list[np.ndarray] = []
        for start in range(0, len(images), batch_size):
            batch = images[start : start + batch_size]
            encoded = self.processor(images=batch, return_tensors="np")
            pixels = encoded["pixel_values"].astype(np.float32)
            for i in range(pixels.shape[0]):
                inputs = {"pixel_values": pixels[i : i + 1]}
                outputs.append(self.vision_session.run(None, inputs)[0])
        dim = self.image_dim or self.text_dim or 768
        result = np.concatenate(outputs, axis=0) if outputs else np.zeros((0, dim), dtype=np.float32)
        _normalize(result)
        return result

    @staticmethod
    def _infer_output_dim(session: ort.InferenceSession) -> int:
        outputs = session.get_outputs()
        if not outputs:
            return 0
        shape = outputs[0].shape
        if not shape:
            return 0
        dim = shape[-1]
        return int(dim) if isinstance(dim, int) else 0


class TransformersClipEncoder(BaseClipEncoder):
    def __init__(self, model_path: str) -> None:
        self.model_path = Path(model_path)
        self.device = _resolve_torch_device()
        model_type = _detect_model_type(model_path)
        if model_type == "chinese_clip":
            self.processor = ChineseCLIPProcessor.from_pretrained(str(self.model_path))
            self.model = ChineseCLIPModel.from_pretrained(str(self.model_path))
            if getattr(self.model.text_model, "pooler", None) is None:
                self.model.text_model.pooler = ChineseCLIPTextPooler(self.model.text_model.config)
        else:
            self.processor = CLIPProcessor.from_pretrained(str(self.model_path))
            self.model = CLIPModel.from_pretrained(str(self.model_path))
        self.model.to(self.device)
        self.model.eval()
        self.output_dim = int(getattr(self.model.config, "projection_dim", 512))

    def encode_images(self, images: List[Image.Image], batch_size: int = 8) -> np.ndarray:
        outputs: list[np.ndarray] = []
        for start in range(0, len(images), batch_size):
            batch = images[start : start + batch_size]
            encoded = self.processor(images=batch, return_tensors="pt")
            pixel_values = encoded["pixel_values"].to(self.device)
            with torch.no_grad():
                feats = self.model.get_image_features(pixel_values=pixel_values)
            outputs.append(feats.detach().cpu().numpy())
        result = np.concatenate(outputs, axis=0) if outputs else np.zeros((0, self.output_dim), dtype=np.float32)
        result = result.astype(np.float32)
        _normalize(result)
        return result

    def encode_texts(self, texts: List[str], batch_size: int = 8) -> np.ndarray:
        outputs: list[np.ndarray] = []
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            encoded = self.processor(text=batch, padding=True, truncation=True, return_tensors="pt")
            encoded = {k: v.to(self.device) for k, v in encoded.items()}
            with torch.no_grad():
                feats = self.model.get_text_features(**encoded)
            outputs.append(feats.detach().cpu().numpy())
        result = np.concatenate(outputs, axis=0) if outputs else np.zeros((0, self.output_dim), dtype=np.float32)
        result = result.astype(np.float32)
        _normalize(result)
        return result


def _load_image(path: Path) -> Optional[Image.Image]:
    try:
        with Image.open(path) as img:
            return img.convert("RGB")
    except Exception:
        return None


def _index_path(model_name: str) -> Path:
    safe_name = re.sub(r"[^A-Za-z0-9_.-]", "_", model_name)
    return _FAISS_DIR / f"{safe_name}.faiss"


def _ensure_base_dir(base_path: Optional[str]) -> Optional[Path]:
    if not base_path:
        return None
    p = Path(base_path)
    if not p.is_absolute():
        p = Path(os.getcwd()) / p
    resolved = p.expanduser().resolve()
    if not resolved.exists() or not resolved.is_dir():
        raise ClipSearchError(f"提供的目录无效: {resolved}")
    return resolved


def _iter_media(db: Session, media_ids: Optional[Sequence[int]]) -> Iterable[Media]:
    # 视频属于“抽帧后再走图像模型”的范畴：统一通过 resolve_model_input_image_path 读取缩略图帧。
    query = db.query(Media).filter(Media.media_type.in_(["image", "video"]))
    if media_ids:
        query = query.filter(Media.id.in_(media_ids))
    return query.order_by(Media.id.asc()).all()


def _encode_images(encoder: BaseClipEncoder, images: List[Image.Image], batch_size: int) -> np.ndarray:
    return encoder.encode_images(images, batch_size=batch_size)


def _encode_text(encoder: BaseClipEncoder, text: str) -> np.ndarray:
    emb = encoder.encode_texts([text])
    return emb[0] if emb.ndim > 1 else emb


def _save_index(vectors: np.ndarray, ids: np.ndarray, model_name: str) -> Path:
    if vectors.size == 0 or ids.size == 0:
        raise ClipIndexNotReady("没有可用的向量，无法写入索引，请先重建。")
    dim = vectors.shape[1]
    base = faiss.IndexFlatIP(dim)
    index = faiss.IndexIDMap2(base)
    index.add_with_ids(vectors.astype(np.float32), ids.astype(np.int64))
    _FAISS_DIR.mkdir(parents=True, exist_ok=True)
    path = _index_path(model_name)
    faiss.write_index(index, str(path))
    return path


def rebuild_embeddings(
    db: Session,
    *,
    base_path: str | None = None,
    model_name: str | None = None,
    media_ids: Optional[Sequence[int]] = None,
    batch_size: int = 8,
    limit: Optional[int] = None,
) -> dict:
    resolved_model = _resolve_model_name(model_name)
    encoder = _get_encoder(resolved_model)
    _ensure_base_dir(base_path)  # 仅校验目录，实际读取走 DB 里的绝对路径

    medias: List[Media] = list(_iter_media(db, media_ids))
    if limit is not None and limit > 0:
        medias = medias[:limit]

    # 先清空当前模型的旧向量，避免残留（含视频、已删除媒体等）混入索引
    db.query(ClipEmbedding).filter(ClipEmbedding.model == resolved_model).delete(synchronize_session=False)

    processed = 0
    skipped = 0
    in_memory_vectors: list[np.ndarray] = []
    in_memory_ids: list[int] = []

    for start in range(0, len(medias), batch_size):
        batch = medias[start : start + batch_size]
        images: list[Image.Image] = []
        alive = []
        for media in batch:
            input_path = resolve_model_input_image_path(media)
            img = _load_image(input_path) if input_path else None
            if img is None:
                skipped += 1
                continue
            images.append(img)
            alive.append(media)
        if not images:
            continue
        vectors = _encode_images(encoder, images, batch_size)
        for media, vec in zip(alive, vectors):
            vec = _normalize(np.asarray(vec, dtype=np.float32))
            row = ClipEmbedding(
                media_id=media.id,
                model=resolved_model,
                vector=vec.tobytes(),
                dim=int(vec.shape[0]),
                updated_at=datetime.utcnow(),
            )
            db.add(row)
            in_memory_vectors.append(vec)
            in_memory_ids.append(media.id)
            processed += 1

    db.commit()

    all_rows = db.query(ClipEmbedding).filter(ClipEmbedding.model == resolved_model).all()
    if not all_rows:
        raise ClipIndexNotReady("向量表为空，请确认媒体是否已导入。")
    dim = all_rows[0].dim
    vectors = np.stack([np.frombuffer(row.vector, dtype=np.float32) for row in all_rows])
    ids = np.array([row.media_id for row in all_rows], dtype=np.int64)
    _normalize(vectors)
    index_path = _save_index(vectors, ids, resolved_model)

    return {
        "model": resolved_model,
        "processed": processed,
        "skipped": skipped,
        "total_embeddings": len(all_rows),
        "index_path": str(index_path),
        "dim": dim,
    }


def build_missing_embeddings(
    db: Session,
    *,
    base_path: str | None = None,
    model_name: str | None = None,
    batch_size: int = 8,
    limit: Optional[int] = None,
    only_active_sources: bool = True,
) -> dict:
    """为缺少向量的媒体增量构建 CLIP/SigLIP 向量并重建索引。

    - 仅为当前模型下尚无向量记录的 image 媒体生成向量；
    - 不会删除已有的 ClipEmbedding 行；
    - 最终仍会基于该模型的所有向量重建一次索引文件。
    """
    resolved_model = _resolve_model_name(model_name)
    encoder = _get_encoder(resolved_model)

    # base_path 仅用于本地目录的存在性校验；为空时跳过。
    if base_path:
        _ensure_base_dir(base_path)

    # 查询当前模型下尚未创建向量的媒体
    subq = (
        db.query(ClipEmbedding.media_id)
        .filter(ClipEmbedding.model == resolved_model)
        .subquery()
    )
    query = (
        db.query(Media)
        .filter(Media.media_type.in_(["image", "video"]))
        .outerjoin(subq, Media.id == subq.c.media_id)
        .filter(subq.c.media_id.is_(None))
    )

    # 仅针对“活动媒体路径”下的媒体进行增量构建（默认行为）：
    # - 若尚未使用媒体源表，则保持 legacy 行为：全库缺失媒体；
    # - 若存在媒体源记录，则仅包含：
    #   * source_id 为空的媒体（历史数据），或
    #   * 绑定到 active 且未删除的 MediaSource 的媒体。
    if only_active_sources:
        has_any_source = (db.query(func.count(MediaSource.id)).scalar() or 0) > 0
        if has_any_source:
            query = apply_active_media_filter(query, join_source=True)

    query = query.order_by(Media.id.asc())

    total_missing = query.count()
    if total_missing == 0:
        # 虽然没有新向量需要生成，但为了与 rebuild_embeddings 行为保持一致，
        # 仍然返回当前索引的统计信息。
        existing_rows = db.query(ClipEmbedding).filter(ClipEmbedding.model == resolved_model).all()
        return {
            "model": resolved_model,
            "processed": 0,
            "skipped": 0,
            "total_embeddings": len(existing_rows),
            "index_path": str(_index_path(resolved_model)),
            "dim": existing_rows[0].dim if existing_rows else 0,
            "missing_before": 0,
        }

    if limit is not None and limit > 0:
        query = query.limit(limit)

    medias: List[Media] = query.all()

    processed = 0
    skipped = 0

    for start in range(0, len(medias), batch_size):
        batch = medias[start : start + batch_size]
        images: list[Image.Image] = []
        alive: list[Media] = []
        for media in batch:
            input_path = resolve_model_input_image_path(media)
            img = _load_image(input_path) if input_path else None
            if img is None:
                skipped += 1
                continue
            images.append(img)
            alive.append(media)
        if not images:
            continue
        vectors = _encode_images(encoder, images, batch_size)
        for media, vec in zip(alive, vectors):
            vec = _normalize(np.asarray(vec, dtype=np.float32))
            row = ClipEmbedding(
                media_id=media.id,
                model=resolved_model,
                vector=vec.tobytes(),
                dim=int(vec.shape[0]),
                updated_at=datetime.utcnow(),
            )
            db.add(row)
            processed += 1

    db.commit()

    # 重新加载当前模型的全部向量并重建索引
    all_rows = db.query(ClipEmbedding).filter(ClipEmbedding.model == resolved_model).all()
    if not all_rows:
        raise ClipIndexNotReady("向量表为空，请确认媒体是否已导入。")
    dim = all_rows[0].dim
    vectors = np.stack([np.frombuffer(row.vector, dtype=np.float32) for row in all_rows])
    ids = np.array([row.media_id for row in all_rows], dtype=np.int64)
    _normalize(vectors)
    index_path = _save_index(vectors, ids, resolved_model)

    return {
        "model": resolved_model,
        "processed": processed,
        "skipped": skipped,
        "total_embeddings": len(all_rows),
        "index_path": str(index_path),
        "dim": dim,
        "missing_before": total_missing,
    }


def build_embeddings_for_media_ids(
    db: Session,
    *,
    media_ids: Sequence[int],
    base_path: str | None = None,
    model_name: str | None = None,
    batch_size: int = 8,
) -> dict:
    """为指定 media_ids 增量构建向量（不影响其他媒体）。"""
    resolved_model = _resolve_model_name(model_name)
    encoder = _get_encoder(resolved_model)

    if base_path:
        _ensure_base_dir(base_path)

    ids = [int(x) for x in media_ids if int(x) > 0]
    if not ids:
        return {
            "model": resolved_model,
            "processed": 0,
            "skipped": 0,
            "total_embeddings": db.query(ClipEmbedding).filter(ClipEmbedding.model == resolved_model).count(),
            "index_path": str(_index_path(resolved_model)),
            "dim": 0,
        }

    medias: list[Media] = (
        db.query(Media)
        .filter(Media.id.in_(ids))
        .filter(Media.media_type.in_(["image", "video"]))
        .all()
    )
    if not medias:
        return {
            "model": resolved_model,
            "processed": 0,
            "skipped": 0,
            "total_embeddings": db.query(ClipEmbedding).filter(ClipEmbedding.model == resolved_model).count(),
            "index_path": str(_index_path(resolved_model)),
            "dim": 0,
        }

    existing = {
        int(mid)
        for (mid,) in db.query(ClipEmbedding.media_id)
        .filter(ClipEmbedding.model == resolved_model, ClipEmbedding.media_id.in_([m.id for m in medias]))
        .all()
    }
    targets = [m for m in medias if m.id not in existing]

    processed = 0
    skipped = 0

    for start in range(0, len(targets), batch_size):
        batch = targets[start : start + batch_size]
        images: list[Image.Image] = []
        alive: list[Media] = []
        for media in batch:
            input_path = resolve_model_input_image_path(media)
            img = _load_image(input_path) if input_path else None
            if img is None:
                skipped += 1
                continue
            images.append(img)
            alive.append(media)
        if not images:
            continue
        vectors = _encode_images(encoder, images, batch_size)
        for media, vec in zip(alive, vectors):
            vec = _normalize(np.asarray(vec, dtype=np.float32))
            row = ClipEmbedding(
                media_id=media.id,
                model=resolved_model,
                vector=vec.tobytes(),
                dim=int(vec.shape[0]),
                updated_at=datetime.utcnow(),
            )
            db.add(row)
            processed += 1

    db.commit()

    all_rows = db.query(ClipEmbedding).filter(ClipEmbedding.model == resolved_model).all()
    if not all_rows:
        raise ClipIndexNotReady("向量表为空，请确认媒体是否已导入。")
    dim = all_rows[0].dim
    vectors = np.stack([np.frombuffer(row.vector, dtype=np.float32) for row in all_rows])
    ids_arr = np.array([row.media_id for row in all_rows], dtype=np.int64)
    _normalize(vectors)
    index_path = _save_index(vectors, ids_arr, resolved_model)

    return {
        "model": resolved_model,
        "processed": processed,
        "skipped": skipped,
        "total_embeddings": len(all_rows),
        "index_path": str(index_path),
        "dim": dim,
    }


def _load_index_if_available(model_name: str, dim: int) -> Optional[faiss.Index]:
    path = _index_path(model_name)
    if not path.exists():
        return None
    try:
        index = faiss.read_index(str(path))
        if index.d != dim:
            return None
        return index
    except Exception:
        return None


def _fallback_vectors(db: Session, model_name: str) -> Tuple[np.ndarray, np.ndarray]:
    rows = db.query(ClipEmbedding).filter(ClipEmbedding.model == model_name).all()
    if not rows:
        raise ClipIndexNotReady("没有可用向量，请先运行 /clip/rebuild。")
    vectors = np.stack([np.frombuffer(r.vector, dtype=np.float32) for r in rows])
    ids = np.array([r.media_id for r in rows], dtype=np.int64)
    _normalize(vectors)
    return vectors, ids


def _search_vectors(
    db: Session,
    query_vec: np.ndarray,
    *,
    model_name: str,
    top_k: int = 20,
) -> Tuple[List[ClipSearchResult], bool]:
    if query_vec.ndim != 1:
        raise ClipSearchError("查询向量格式有误")
    vec = _normalize(query_vec.astype(np.float32))
    sample_row = db.query(ClipEmbedding).filter(ClipEmbedding.model == model_name).first()
    if not sample_row:
        raise ClipIndexNotReady("索引为空，请先重建向量。")
    dim = sample_row.dim
    if dim != vec.shape[0]:
        raise ClipSearchError(f"向量维度不匹配，期望 {dim}，得到 {vec.shape[0]}")

    index = _load_index_if_available(model_name, dim)
    used_index = index is not None
    if index is None:
        vectors, ids = _fallback_vectors(db, model_name)
        sims = vectors @ vec
        order = np.argsort(sims)[::-1][:top_k]
        scores = sims[order]
        found_ids = ids[order]
    else:
        scores, found_ids = index.search(vec.reshape(1, -1), top_k)
        scores = scores[0]
        found_ids = found_ids[0]

    valid_pairs: list[tuple[int, float]] = []
    for mid, score in zip(found_ids.tolist(), scores.tolist()):
        if mid < 0:
            continue
        valid_pairs.append((int(mid), float(score)))

    if not valid_pairs:
        return [], used_index

    media_map = {
        media.id: media
        for media in db.query(Media).filter(Media.id.in_([mid for mid, _ in valid_pairs])).all()
    }

    results: list[ClipSearchResult] = []
    for mid, score in valid_pairs:
        media = media_map.get(mid)
        if not media:
            continue
        results.append(ClipSearchResult(media=media, score=score))
    return results, used_index


def search(
    db: Session,
    *,
    query_text: Optional[str] = None,
    image_id: Optional[int] = None,
    top_k: int = 20,
    model_name: str | None = None,
) -> dict:
    resolved_model = _resolve_model_name(model_name)
    encoder = _get_encoder(resolved_model)
    vector: Optional[np.ndarray] = None
    mode = "text" if query_text else "image"

    if query_text:
        vector = _encode_text(encoder, query_text)
    elif image_id is not None:
        emb = (
            db.query(ClipEmbedding)
            .filter(ClipEmbedding.media_id == image_id, ClipEmbedding.model == resolved_model)
            .first()
        )
        if emb:
            vector = np.frombuffer(emb.vector, dtype=np.float32)
        else:
            media = db.query(Media).filter(Media.id == image_id).first()
            if not media:
                raise MediaNotFoundError("媒体不存在，无法做图搜图")
            input_path = resolve_model_input_image_path(media)
            img = _load_image(input_path) if input_path else None
            if img is None:
                raise MediaNotFoundError("找不到图像文件或文件不可读")
            vector = _encode_images(encoder, [img], batch_size=1)[0]
    else:
        raise ClipSearchError("query_text 或 image_id 至少提供一个")

    if vector is None:
        raise ClipSearchError("未能生成查询向量")

    results, used_index = _search_vectors(db, vector, model_name=resolved_model, top_k=top_k)

    media_root = get_setting(db, MEDIA_ROOT_KEY)
    items = [
        {
            "mediaId": res.media.id,
            "filename": res.media.filename,
            "mediaType": res.media.media_type,
            "createdAt": res.media.created_at.isoformat() if res.media.created_at else "",
            "url": f"/media-resource/{res.media.id}",
            "resourceUrl": f"/media-resource/{res.media.id}",
            "thumbnailUrl": f"/media/{res.media.id}/thumbnail",
            "score": res.score,
            "absolutePath": res.media.absolute_path,
            "relativePath": _to_relative_path(media_root, res.media.absolute_path),
        }
        for res in results
    ]

    return {
        "model": resolved_model,
        "mode": mode,
        "used_index": used_index,
        "count": len(items),
        "items": items,
    }


def _to_relative_path(media_root: Optional[str], absolute: str) -> Optional[str]:
    if not media_root:
        return None
    try:
        root_path = Path(media_root).expanduser().resolve()
        abs_path = Path(absolute).expanduser().resolve()
        return str(abs_path.relative_to(root_path))
    except Exception:
        return None
