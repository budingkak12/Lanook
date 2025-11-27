from datetime import datetime

from fastapi import APIRouter, Query
from sqlalchemy import func

from app.db import ClipEmbedding, Media, SessionLocal
from app.db.models_extra import AssetArtifact, MediaSource
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
        # 媒体来源视角：
        # - 若尚未使用媒体源表（MediaSource 为空），则回退到 legacy 行为：所有 media 视为有效；
        # - 若存在媒体源记录但当前没有任何 active 来源，则视为“没有活动媒体库”，统计视图归零。
        has_any_source = (session.query(func.count(MediaSource.id)).scalar() or 0) > 0
        has_active_source = (
            session.query(func.count(MediaSource.id))
            .filter(
                (MediaSource.status.is_(None) | (MediaSource.status == "active"))
                & (MediaSource.deleted_at.is_(None))
            )
            .scalar()
            or 0
        ) > 0

        if has_any_source and not has_active_source:
            total_media = 0
            rows: list[tuple[str, str, int]] = []
        else:
            # 仅统计“仍属于活动媒体路径”的媒体。
            active_media_query = session.query(Media)
            if has_any_source:
                active_media_query = (
                    active_media_query.outerjoin(MediaSource, Media.source_id == MediaSource.id)
                    .filter(
                        # legacy: 未绑定来源的媒体
                        (Media.source_id.is_(None))
                        |
                        # 新架构：绑定到“存在且为 active 的媒体路径”的媒体
                        (
                            (Media.source_id.isnot(None))
                            & (MediaSource.id.isnot(None))
                            & (MediaSource.deleted_at.is_(None))
                            & (MediaSource.status.is_(None) | (MediaSource.status == "active"))
                        )
                    )
                )

            total_media = active_media_query.with_entities(func.count(Media.id)).scalar() or 0

            # 统计 asset_artifacts 按类型、状态的数量（限定在活动媒体范围内）
            artifact_query = (
                session.query(
                    AssetArtifact.artifact_type,
                    AssetArtifact.status,
                    func.count(AssetArtifact.id),
                )
                .join(Media, AssetArtifact.media_id == Media.id)
            )
            if has_any_source:
                artifact_query = (
                    artifact_query.outerjoin(MediaSource, Media.source_id == MediaSource.id)
                    .filter(
                        (Media.source_id.is_(None))
                        |
                        (
                            (Media.source_id.isnot(None))
                            & (MediaSource.id.isnot(None))
                            & (MediaSource.deleted_at.is_(None))
                            & (MediaSource.status.is_(None) | (MediaSource.status == "active"))
                        )
                    )
                )
            rows = artifact_query.group_by(AssetArtifact.artifact_type, AssetArtifact.status).all()

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

    # 仅展示对用户有实际意义的资产类型进度：缩略图 / 元数据 / 转码
    items = [
        _build_item(ArtifactType.THUMBNAIL, ArtifactTypeModel.THUMBNAIL),
        _build_item(ArtifactType.METADATA, ArtifactTypeModel.METADATA),
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
        # 媒体来源视角：
        # - 若尚未使用媒体源表（MediaSource 为空），则回退到 legacy 行为：所有 media 视为有效；
        # - 若存在媒体源记录但当前没有任何 active 来源，则视为“没有活动媒体库”，不再统计 legacy 媒体。
        has_any_source = (session.query(func.count(MediaSource.id)).scalar() or 0) > 0
        has_active_source = (
            session.query(func.count(MediaSource.id))
            .filter(
                (MediaSource.status.is_(None) | (MediaSource.status == "active"))
                & (MediaSource.deleted_at.is_(None))
            )
            .scalar()
            or 0
        ) > 0

        if has_any_source and not has_active_source:
            # 用户已经使用了媒体路径管理，但目前全部路径已删除/停用；
            # 此时向量覆盖率视图应表现为“空库”。
            total_media = 0
            total_with_embeddings = 0
            model_rows: list[tuple[str, int, datetime]] = []
        else:
            # 仅统计“仍属于活动媒体路径”的媒体：
            # - legacy 场景（没有 MediaSource 记录）：所有 media 都视为活动；
            # - 使用媒体路径管理时，仅统计 active + 未删除的来源。
            active_media_query = session.query(Media)
            if has_any_source:
                active_media_query = (
                    active_media_query.outerjoin(MediaSource, Media.source_id == MediaSource.id)
                    .filter(
                        (Media.source_id.is_(None))
                        |
                        (
                            (Media.source_id.isnot(None))
                            & (MediaSource.id.isnot(None))
                            & (MediaSource.deleted_at.is_(None))
                            & (MediaSource.status.is_(None) | (MediaSource.status == "active"))
                        )
                    )
                )

            total_media = active_media_query.with_entities(func.count(Media.id)).scalar() or 0

            # 至少具有一种模型向量的媒体数量（同样限定在活动来源范围内）
            total_with_embeddings_query = (
                session.query(func.count(func.distinct(ClipEmbedding.media_id)))
                .join(Media, ClipEmbedding.media_id == Media.id)
            )
            model_rows_query = (
                session.query(
                    ClipEmbedding.model,
                    func.count(func.distinct(ClipEmbedding.media_id)),
                    func.max(ClipEmbedding.updated_at),
                )
                .join(Media, ClipEmbedding.media_id == Media.id)
            )
            if has_any_source:
                total_with_embeddings_query = (
                    total_with_embeddings_query.outerjoin(MediaSource, Media.source_id == MediaSource.id)
                    .filter(
                        (Media.source_id.is_(None))
                        |
                        (
                            (Media.source_id.isnot(None))
                            & (MediaSource.id.isnot(None))
                            & (MediaSource.deleted_at.is_(None))
                            & (MediaSource.status.is_(None) | (MediaSource.status == "active"))
                        )
                    )
                )
                model_rows_query = (
                    model_rows_query.outerjoin(MediaSource, Media.source_id == MediaSource.id)
                    .filter(
                        (Media.source_id.is_(None))
                        |
                        (
                            (Media.source_id.isnot(None))
                            & (MediaSource.id.isnot(None))
                            & (MediaSource.deleted_at.is_(None))
                            & (MediaSource.status.is_(None) | (MediaSource.status == "active"))
                        )
                    )
                )

            total_with_embeddings = total_with_embeddings_query.scalar() or 0
            model_rows = model_rows_query.group_by(ClipEmbedding.model).all()

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
