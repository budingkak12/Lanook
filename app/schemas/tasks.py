from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ScanTaskStateModel(str, Enum):
    NO_MEDIA_ROOT = "no_media_root"
    READY = "ready"
    ERROR = "error"


class ScanTaskStatusResponse(BaseModel):
    state: ScanTaskStateModel = Field(..., description="任务状态")
    media_root_path: Optional[str] = Field(None, description="当前配置的媒体根目录路径")
    scanned_count: int = Field(..., description="数据库中已索引的媒体数量")
    total_discovered: Optional[int] = Field(
        None,
        description="目录中已发现的受支持媒体文件数量（可能为估算）",
    )
    remaining_count: Optional[int] = Field(
        None,
        description="预计剩余待扫描的媒体数量（total - scanned）",
    )
    preview_batch_size: int = Field(..., description="初始化阶段首批预览扫描的数量限制")
    message: Optional[str] = Field(None, description="状态说明或错误信息")
    generated_at: datetime = Field(..., description="生成此统计的时间（UTC）")


class ArtifactTypeModel(str, Enum):
    THUMBNAIL = "thumbnail"
    METADATA = "metadata"
    PLACEHOLDER = "placeholder"
    TRANSCODE = "transcode"


class ArtifactProgressItem(BaseModel):
    artifact_type: ArtifactTypeModel = Field(..., description="资产类型")
    total_media: int = Field(..., description="媒体总数")
    ready_count: int = Field(..., description="已完成数量")
    queued_count: int = Field(..., description="排队中数量")
    processing_count: int = Field(..., description="处理中数量")
    failed_count: int = Field(..., description="失败数量")


class AssetPipelineStatusResponse(BaseModel):
    started: bool = Field(..., description="资产流水线是否已启动")
    worker_count: int = Field(..., description="当前工作线程数量")
    queue_size: int = Field(..., description="内部任务队列长度（近似值）")
    items: list[ArtifactProgressItem] = Field(..., description="按资产类型统计的进度")
    message: Optional[str] = Field(None, description="状态说明或错误信息")


class ClipModelCoverage(BaseModel):
    model: str = Field(..., description="模型名称或标识")
    media_with_embedding: int = Field(..., description="具有该模型向量的媒体数量")
    last_updated_at: Optional[datetime] = Field(
        None,
        description="该模型下最近一次向量更新时间",
    )


class ClipIndexStatusResponse(BaseModel):
    total_media: int = Field(..., description="媒体总数")
    total_media_with_embeddings: int = Field(..., description="至少具有一种模型向量的媒体数量")
    coverage_ratio: float = Field(..., description="整体向量覆盖率（0-1）")
    models: list[ClipModelCoverage] = Field(..., description="按模型维度的覆盖情况")
