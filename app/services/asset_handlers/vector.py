from __future__ import annotations

import json
from typing import Optional

from app.db import ClipEmbedding, Media, SessionLocal
from app.db.models_extra import AssetArtifact
from app.services.asset_models import ArtifactPayload
from app.services import clip_service


_REQUIRED_MODELS = [None, "chinese-clip"]


def _has_required_embeddings(media_id: int) -> bool:
    with SessionLocal() as db:
        for model_name in _REQUIRED_MODELS:
            resolved = clip_service._resolve_model_name(model_name)  # noqa: SLF001
            exists = (
                db.query(ClipEmbedding.id)
                .filter(ClipEmbedding.media_id == media_id, ClipEmbedding.model == resolved)
                .first()
            )
            if not exists:
                return False
        return True


def vector_cache_lookup(media: Media) -> Optional[ArtifactPayload]:
    if _has_required_embeddings(media.id):
        return ArtifactPayload(extra={"ready": True})

    with SessionLocal() as db:
        record = (
            db.query(AssetArtifact)
            .filter(AssetArtifact.media_id == media.id, AssetArtifact.artifact_type == "vector")
            .first()
        )
        if not record or not record.extra_json:
            return None
        try:
            extra = json.loads(record.extra_json)
        except Exception:
            extra = {"ready": True}
        return ArtifactPayload(extra=extra)


def vector_generator(media: Media) -> Optional[ArtifactPayload]:
    stats: dict[str, object] = {"media_id": media.id, "models": []}
    with SessionLocal() as db:
        for model in _REQUIRED_MODELS:
            one = clip_service.build_embeddings_for_media_ids(
                db,
                media_ids=[media.id],
                model_name=model,
                batch_size=4,
            )
            stats["models"].append(one)
    return ArtifactPayload(extra=stats)

