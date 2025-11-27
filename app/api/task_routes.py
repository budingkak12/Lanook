from datetime import datetime

from fastapi import APIRouter, Query
from sqlalchemy import func

from app.db import ClipEmbedding, Media, SessionLocal
from app.db.models_extra import AssetArtifact
from app.schemas.tasks import (
    ArtifactProgressItem,
    ArtifactTypeModel,
    AssetPipelineStatusResponse,
    ClipIndexStatusResponse,
    ClipModelCoverage,
    ScanTaskStateModel,
    ScanTaskStatusResponse,
)
from app.services.asset_pipeline import (
    ArtifactType,
    AssetArtifactStatus,
    get_pipeline_runtime_status,
)
from app.services.task_progress import ScanTaskState, compute_scan_task_progress

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/scan-progress", response_model=ScanTaskStatusResponse)
def get_scan_progress(force_refresh: bool = Query(False, description="是否强制刷新目录统计缓存")):
    progress = compute_scan_task_progress(force_refresh_directory=force_refresh)
    return ScanTaskStatusResponse(
        state=ScanTaskStateModel(progress.state.value),
        media_root_path=str(progress.media_root_path) if progress.media_root_path else None,
        scanned_count=progress.scanned_count,
        total_discovered=progress.total_discovered,
        remaining_count=progress.remaining_count,
        preview_batch_size=progress.preview_batch_size,
        message=progress.message,
        generated_at=progress.generated_at,
    )


@router.get("/asset-pipeline", response_model=AssetPipelineStatusResponse)
def get_asset_pipeline_status() -> AssetPipelineStatusResponse:
    """资产处理流水线整体进度与运行状态。"""
    runtime = get_pipeline_runtime_status()

    with SessionLocal() as session:
        total_media = session.query(func.count(Media.id)).scalar() or 0

        # 统计 asset_artifacts 按类型、状态的数量
        rows = (
            session.query(
                AssetArtifact.artifact_type,
                AssetArtifact.status,
                func.count(AssetArtifact.id),
            )
            .group_by(AssetArtifact.artifact_type, AssetArtifact.status)
            .all()
        )

    # 映射为 {artifact_type: {status: count}}
    stats: dict[str, dict[str, int]] = {}
    for artifact_type, status, count in rows:
        bucket = stats.setdefault(str(artifact_type), {})
        bucket[str(status)] = int(count or 0)

    def _build_item(artifact_type: ArtifactType, label: ArtifactTypeModel) -> ArtifactProgressItem:
        bucket = stats.get(artifact_type.value, {})
        return ArtifactProgressItem(
            artifact_type=label,
            total_media=total_media,
            ready_count=bucket.get(AssetArtifactStatus.READY.value, 0),
            queued_count=bucket.get(AssetArtifactStatus.QUEUED.value, 0),
            processing_count=bucket.get(AssetArtifactStatus.PROCESSING.value, 0),
            failed_count=bucket.get(AssetArtifactStatus.FAILED.value, 0),
        )

    items = [
        _build_item(ArtifactType.THUMBNAIL, ArtifactTypeModel.THUMBNAIL),
        _build_item(ArtifactType.METADATA, ArtifactTypeModel.METADATA),
        _build_item(ArtifactType.PLACEHOLDER, ArtifactTypeModel.PLACEHOLDER),
        _build_item(ArtifactType.TRANSCODE, ArtifactTypeModel.TRANSCODE),
    ]

    message = None
    if not runtime.started:
        message = "资产流水线未启动，可能尚未访问任何需要生成缩略图/元数据的接口。"

    return AssetPipelineStatusResponse(
        started=runtime.started,
        worker_count=runtime.worker_count,
        queue_size=runtime.queue_size,
        items=items,
        message=message,
    )


@router.get("/clip-index", response_model=ClipIndexStatusResponse)
def get_clip_index_status() -> ClipIndexStatusResponse:
    """CLIP/SigLIP 等向量索引的覆盖率概览。"""
    with SessionLocal() as session:
        total_media = session.query(func.count(Media.id)).scalar() or 0

        # 至少具有一种模型向量的媒体数量
        total_with_embeddings = (
            session.query(func.count(func.distinct(ClipEmbedding.media_id))).scalar() or 0
        )

        # 按模型统计覆盖与最近更新时间
        model_rows = (
            session.query(
                ClipEmbedding.model,
                func.count(func.distinct(ClipEmbedding.media_id)),
                func.max(ClipEmbedding.updated_at),
            )
            .group_by(ClipEmbedding.model)
            .all()
        )

    coverage_ratio = 0.0
    if total_media > 0:
        coverage_ratio = total_with_embeddings / float(total_media)

    models = [
        ClipModelCoverage(
            model=row[0],
            media_with_embedding=int(row[1] or 0),
            last_updated_at=row[2] if isinstance(row[2], datetime) else None,
        )
        for row in model_rows
    ]

    return ClipIndexStatusResponse(
        total_media=total_media,
        total_media_with_embeddings=total_with_embeddings,
        coverage_ratio=coverage_ratio,
        models=models,
    )
