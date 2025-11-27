from __future__ import annotations

from typing import Dict, List

from sqlalchemy.orm import Session

from app.db import Media, SessionLocal
from app.db.models_extra import MediaSource
from app.services.asset_pipeline import (
    ArtifactType,
    AssetArtifactStatus,
    AssetPipeline,
    ensure_pipeline_started,
)


def _warmup_for_source(
    session: Session,
    source: MediaSource,
    *,
    artifact_types: List[ArtifactType],
    batch_size: int = 256,
) -> Dict[str, int]:
    """为指定来源的媒体批量排队资产处理任务。

    - 目前只负责将任务放入 AssetPipeline 队列，不等待处理完成；
    - 通过 source_id 过滤，只影响该媒体路径下的文件；
    - 主要用于“新增媒体路径后自动开始缩略图/元数据处理”的体验。
    """
    pipeline: AssetPipeline = ensure_pipeline_started()

    stats: Dict[str, int] = {t.value: 0 for t in artifact_types}

    for artifact_type in artifact_types:
        last_id = 0
        while True:
            # 逐批拉取该来源下尚未进入当前 artifact 队列的媒体
            # 为了避免复杂的 LEFT JOIN 逻辑，这里只根据 id 游标简单分页，
            # 实际是否已处理由 AssetPipeline 内部的 _get_or_create_record 决定。
            medias = (
                session.query(Media)
                .filter(Media.source_id == source.id)
                .filter(Media.id > last_id)
                .order_by(Media.id.asc())
                .limit(batch_size)
                .all()
            )
            if not medias:
                break
            for media in medias:
                last_id = media.id
                # wait_timeout=0：只排队，不等待完成
                pipeline.ensure_artifact(
                    media=media,
                    artifact_type=artifact_type,
                    session=session,
                    wait_timeout=0,
                )
                stats[artifact_type.value] += 1
            # 避免长事务，这里每批提交一次
            session.commit()

    return stats


def warmup_assets_for_source(source_id: int) -> Dict[str, int]:
    """在后台为指定来源预热资产处理任务（缩略图/元数据等）。

    使用单独的 Session，适合从 FastAPI BackgroundTasks 调用。
    """
    session = SessionLocal()
    try:
        source = session.query(MediaSource).filter(MediaSource.id == source_id).first()
        if not source:
            return {}
        artifact_types = [
            ArtifactType.THUMBNAIL,
            ArtifactType.METADATA,
        ]
        stats = _warmup_for_source(session, source, artifact_types=artifact_types)
        # 简单日志，帮助诊断预热规模
        summary = ", ".join(f"{k}={v}" for k, v in stats.items())
        print(f"[asset-warmup] 为来源 {source.id}({source.display_name or source.root_path}) 预热任务: {summary}")
        return stats
    except Exception as exc:  # pragma: no cover - 运行期兜底
        print(f"[asset-warmup] 预热失败: {exc}")
        return {}
    finally:
        session.close()
