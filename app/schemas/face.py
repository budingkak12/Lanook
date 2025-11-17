from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class RebuildFacesRequest(BaseModel):
    base_path: str = Field("测试图片", description="包含待处理图片的目录路径")
    similarity_threshold: float = Field(0.55, ge=0.0, le=1.0, description="聚类相似度阈值（余弦相似度）")


class FaceClusterModel(BaseModel):
    id: int
    label: str
    faceCount: int
    representativeMediaId: Optional[int] = None
    representativeFaceId: Optional[int] = None


class RebuildFacesResponse(BaseModel):
    mediaCount: int
    faceCount: int
    clusterCount: int
    threshold: float
    basePath: str


class ClusterMediaItem(BaseModel):
    mediaId: int
    filename: str
    thumbnailUrl: Optional[str] = None


class ClusterMediaResponse(BaseModel):
    cluster: FaceClusterModel
    items: List[ClusterMediaItem]
