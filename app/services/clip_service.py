from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

import faiss
import numpy as np
from PIL import Image
from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session

from app.db import ClipEmbedding, MEDIA_ROOT_KEY, Media, get_setting
from app.services.exceptions import MediaNotFoundError, ServiceError


class ClipSearchError(ServiceError):
    default_status = 500


class ClipIndexNotReady(ServiceError):
    default_status = 503


@dataclass
class ClipSearchResult:
    media: Media
    score: float


_MODEL_ALIASES = {
    "siglip": "sentence-transformers/siglip-base-patch16-224",
    "siglip-base": "sentence-transformers/siglip-base-patch16-224",
    "siglip-base-patch16-224": "sentence-transformers/siglip-base-patch16-224",
    "clip": "clip-ViT-B-32",
    "vit-b-32": "clip-ViT-B-32",
    "vit-l-14": "clip-ViT-L-14",
}

_DEFAULT_MODEL = os.environ.get("CLIP_MODEL", "siglip")
_DEFAULT_DEVICE = os.environ.get("CLIP_DEVICE", "cpu")
_FAISS_DIR = Path(os.environ.get("CLIP_FAISS_DIR", "faiss_vectors"))

_model_cache: dict[str, SentenceTransformer] = {}


def _resolve_model_name(name: str | None) -> str:
    if not name:
        name = _DEFAULT_MODEL
    lowered = name.strip().lower()
    return _MODEL_ALIASES.get(lowered, name.strip())


def _get_model(model_name: str) -> SentenceTransformer:
    resolved = _resolve_model_name(model_name)
    cached = _model_cache.get(resolved)
    if cached:
        return cached
    model = SentenceTransformer(resolved, device=_DEFAULT_DEVICE)
    _model_cache[resolved] = model
    return model


def _normalize(vec: np.ndarray) -> np.ndarray:
    if vec.ndim == 1:
        norm = np.linalg.norm(vec)
        if norm == 0:
            return vec
        return vec / norm
    faiss.normalize_L2(vec)
    return vec


def _load_image(path: Path) -> Optional[Image.Image]:
    try:
        with Image.open(path) as img:
            return img.convert("RGB")
    except Exception:
        return None


def _index_path(model_name: str) -> Path:
    safe_name = model_name.replace("/", "_")
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
    query = db.query(Media).filter(Media.media_type == "image")
    if media_ids:
        query = query.filter(Media.id.in_(media_ids))
    return query.order_by(Media.id.asc()).all()


def _encode_images(model: SentenceTransformer, images: List[Image.Image], batch_size: int) -> np.ndarray:
    return model.encode(images, batch_size=batch_size, convert_to_numpy=True, normalize_embeddings=True)


def _encode_text(model: SentenceTransformer, text: str) -> np.ndarray:
    emb = model.encode([text], convert_to_numpy=True, normalize_embeddings=True)
    if isinstance(emb, list):
        emb = np.array(emb, dtype=np.float32)
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
    model = _get_model(resolved_model)
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
            path = Path(media.absolute_path)
            img = _load_image(path)
            if img is None:
                skipped += 1
                continue
            images.append(img)
            alive.append(media)
        if not images:
            continue
        vectors = _encode_images(model, images, batch_size)
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
    model = _get_model(resolved_model)
    vector: Optional[np.ndarray] = None
    mode = "text" if query_text else "image"

    if query_text:
        vector = _encode_text(model, query_text)
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
            img = _load_image(Path(media.absolute_path))
            if img is None:
                raise MediaNotFoundError("找不到图像文件或文件不可读")
            vector = _encode_images(model, [img], batch_size=1)[0]
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
