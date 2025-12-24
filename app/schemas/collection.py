from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CollectionBase(BaseModel):
    name: str
    description: Optional[str] = None


class CollectionCreate(CollectionBase):
    pass


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class CollectionItemSchema(BaseModel):
    collection_id: int
    media_id: int
    added_at: datetime

    class Config:
        from_attributes = True


class Collection(CollectionBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SmartAddRequest(BaseModel):
    asset_ids: Optional[List[int]] = Field(None, alias="asset_ids")
    scan_paths: Optional[List[str]] = Field(None, alias="scan_paths")
    recursive: bool = True
    from_search_result: bool = Field(False, alias="from_search_result")
    search_query: Optional[str] = Field(None, alias="search_query")
    search_mode: str = Field("or", alias="search_mode")
    tag: Optional[str] = Field(None, alias="tag")
    search_filters: Optional[dict] = Field(None, alias="search_filters")

    class Config:
        populate_by_name = True
