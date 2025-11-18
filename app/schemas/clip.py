from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, conint


class ClipSearchRequest(BaseModel):
    query_text: Optional[str] = Field(default=None, description="文本查询，可为空")
    image_id: Optional[int] = Field(default=None, description="使用已有图片向量搜图")
    top_k: conint(ge=1, le=200) = 20
    model: Optional[str] = Field(default=None, description="模型别名，如 siglip/clip")


class ClipSearchItem(BaseModel):
    mediaId: int
    filename: str
    mediaType: str
    createdAt: str
    url: str
    resourceUrl: str
    thumbnailUrl: str
    score: float
    absolutePath: str | None = None
    relativePath: str | None = None


class ClipSearchResponse(BaseModel):
    model: str
    mode: str
    used_index: bool
    count: int
    items: List[ClipSearchItem]


class ClipRebuildRequest(BaseModel):
    base_path: Optional[str] = Field(default=None, description="媒体根目录，仅用于校验")
    model: Optional[str] = Field(default=None, description="模型别名或全名")
    media_ids: Optional[List[int]] = Field(default=None, description="仅重建指定媒体")
    batch_size: conint(ge=1, le=64) = 8
    limit: Optional[int] = Field(default=None, description="仅处理前 N 条媒体")


class ClipRebuildResponse(BaseModel):
    model: str
    processed: int
    skipped: int
    total_embeddings: int
    index_path: str
    dim: int
