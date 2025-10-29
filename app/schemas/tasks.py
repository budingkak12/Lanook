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
