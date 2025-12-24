from __future__ import annotations

import json
from typing import Optional

from app.db import Media, MediaTag, SessionLocal
from app.db.models_extra import AssetArtifact
from app.services.asset_models import ArtifactPayload
from app.services import wd_tag_service


def _has_ai_tags(media_id: int) -> bool:
    # “安检门”的标签：以 WD tagger 为主（source_model 非 manual/system）
    with SessionLocal() as db:
        row = (
            db.query(MediaTag.id)
            .filter(MediaTag.media_id == media_id)
            .filter(~MediaTag.source_model.in_(["manual", "system"]))
            .first()
        )
        return row is not None


def tags_cache_lookup(media: Media) -> Optional[ArtifactPayload]:
    if _has_ai_tags(media.id):
        return ArtifactPayload(extra={"ready": True})

    # 如果之前跑过 pipeline 并写入了 asset_artifacts 的 extra_json，可复用该结果作为缓存。
    with SessionLocal() as db:
        record = (
            db.query(AssetArtifact)
            .filter(AssetArtifact.media_id == media.id, AssetArtifact.artifact_type == "tags")
            .first()
        )
        if not record or not record.extra_json:
            return None
        try:
            extra = json.loads(record.extra_json)
        except Exception:
            extra = {"ready": True}
        return ArtifactPayload(extra=extra)


def tags_generator(media: Media) -> Optional[ArtifactPayload]:
    with SessionLocal() as db:
        stats = wd_tag_service.rebuild_tags(db, media_ids=[media.id], batch_size=1, limit=1)
    return ArtifactPayload(extra=stats or {"processed_media": 0})

