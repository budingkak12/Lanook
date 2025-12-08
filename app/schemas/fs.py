from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class SortField(str, Enum):
    name = "name"
    mtime = "mtime"
    size = "size"


class SortOrder(str, Enum):
    asc = "asc"
    desc = "desc"


class RootInfo(BaseModel):
    id: str
    display_name: str
    abs_path: str
    writable: bool
    available: bool
    removable: bool
    total_bytes: Optional[int] = None
    free_bytes: Optional[int] = None
    platform: str


class FsItem(BaseModel):
    name: str
    is_dir: bool
    size: int
    mtime: float
    ext: str = Field("", description="不含点的小写扩展名")
    writable: bool
    thumbnail_url: Optional[str] = None
    media_meta: Optional[dict] = None


class ListResponse(BaseModel):
    items: List[FsItem]
    total: int
    offset: int
    limit: int


class MkdirRequest(BaseModel):
    root_id: str
    path: str


class RenameRequest(BaseModel):
    root_id: str
    src_path: str
    dst_path: str


class DeleteRequest(BaseModel):
    root_id: str
    paths: List[str]


class MoveCopyRequest(BaseModel):
    root_id: str
    src_paths: List[str]
    dst_dir: str
