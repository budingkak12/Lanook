from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel

DeleteMode = str  # "trash" | "permanent"


class MediaItem(BaseModel):
    id: int
    url: str
    resourceUrl: str
    type: str
    filename: str
    createdAt: str
    thumbnailUrl: Optional[str] = None
    liked: Optional[bool] = None
    favorited: Optional[bool] = None
    fingerprint: Optional[str] = None


class PageResponse(BaseModel):
    items: List[MediaItem]
    offset: int
    hasMore: bool


class TagRequest(BaseModel):
    media_id: int
    tag: str


class DeleteBatchReq(BaseModel):
    ids: List[int]
    delete_file: bool = True
    delete_mode: DeleteMode = "trash"


class FailedItemModel(BaseModel):
    id: int
    reason: str


class DeleteBatchResp(BaseModel):
    deleted: List[int]
    failed: List[FailedItemModel] = []


class MediaMetadata(BaseModel):
    mediaId: int
    filename: str
    mediaType: str
    sourcePath: str
    size: int
    mtime: Optional[str] = None
    ctime: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    checksum: Optional[str] = None
    fps: Optional[float] = None

    class Config:
        extra = "allow"
