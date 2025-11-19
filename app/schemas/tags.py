from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, conint


class TagsRebuildRequest(BaseModel):
    base_path: Optional[str] = Field(default=None, description="仅用于路径校验，可留空")
    media_ids: Optional[List[int]] = Field(default=None, description="仅处理指定媒体 ID")
    batch_size: conint(ge=1, le=64) = 8
    limit: Optional[int] = Field(default=None, description="限制处理数量，加速调试")
    model: Optional[str] = Field(default=None, description="模型别名或仓库 ID，默认 wd-v3")
    whitelist_path: Optional[str] = Field(default=None, description="白名单文件路径，默认 app/data/wdtag-whitelist.txt")
    min_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="过滤下限，默认0.35")
    max_tags_per_media: Optional[int] = Field(default=None, ge=1, le=128, description="每张最多保留标签数，默认24")


class TagsRebuildResponse(BaseModel):
    model: str
    processed_media: int
    tagged_media: int
    skipped_media: int
    total_tag_rows: int
    unique_tags: int
    whitelist_size: int
    deleted_old_rows: int
    eligible_media: int
    base_path: Optional[str] = None
    whitelist_path: Optional[str] = None
    min_confidence: float
    max_tags_per_media: int
    duration_seconds: float


class MediaTagItem(BaseModel):
    name: str
    displayName: Optional[str] = None
    sourceModel: Optional[str] = None
    confidence: Optional[float] = None
    weight: Optional[float] = None


class MediaTagsResponse(BaseModel):
    mediaId: int
    tags: List[MediaTagItem]
