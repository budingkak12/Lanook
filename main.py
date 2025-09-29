from typing import List, Optional
from datetime import datetime
import hashlib
import random

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import FileResponse
import os
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# 复用数据库与模型（无用户概念）
from 初始化数据库 import SessionLocal, Media, TagDefinition, MediaTag


# =============================
# Pydantic 模型
# =============================

class SessionRequest(BaseModel):
    seed: Optional[str] = None


class SessionResponse(BaseModel):
    session_seed: str


class MediaItem(BaseModel):
    id: int
    url: str
    resourceUrl: str
    type: str
    filename: str
    createdAt: str
    thumbnailUrl: Optional[str] = None


class PageResponse(BaseModel):
    items: List[MediaItem]
    offset: int
    hasMore: bool


class TagRequest(BaseModel):
    media_id: int
    tag: str


# =============================
# 应用与依赖
# =============================

app = FastAPI(title="Media App API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================
# 工具函数
# =============================

def to_media_item(m: Media, include_thumb: bool = False) -> MediaItem:
    return MediaItem(
        id=m.id,
        url=f"/media-resource/{m.id}",  # 统一通过“原媒体资源”接口提供资源
        resourceUrl=f"/media-resource/{m.id}",
        type=m.media_type,
        filename=m.filename,
        createdAt=(m.created_at.isoformat() if isinstance(m.created_at, datetime) else str(m.created_at)),
        thumbnailUrl=(f"/media/{m.id}/thumbnail" if include_thumb else None),
    )


def seeded_key(seed: str, media_id: int) -> str:
    return hashlib.sha256(f"{seed}:{media_id}".encode()).hexdigest()


# =============================
# 路由
# =============================

@app.post("/session", response_model=SessionResponse)
def create_session(req: SessionRequest):
    if req.seed is None or str(req.seed).strip() == "":
        # 生成一个稳定字符串种子（可替换为 uuid 或时间戳）
        session_seed = str(random.randint(10**12, 10**13 - 1))
    else:
        session_seed = str(req.seed)
    return SessionResponse(session_seed=session_seed)




@app.get("/media-resource-list", response_model=PageResponse)
def get_media_resource_list(
    seed: str = Query(..., description="会话随机种子"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    order: str = Query("seeded", regex="^(seeded|recent)$"),
    db=Depends(get_db),
):
    # 根据种子获取“原文件信息”媒体 JSON（不含缩略图），用于播放器数据源
    if order == "recent":
        q = db.query(Media).order_by(Media.created_at.desc())
        total_items = q.all()
        sliced = total_items[offset : offset + limit]
    else:
        all_items = db.query(Media).all()
        all_items.sort(key=lambda m: seeded_key(seed, m.id))
        sliced = all_items[offset : offset + limit]

    items = [to_media_item(m, include_thumb=False) for m in sliced]
    has_more = (offset + len(items)) < (len(all_items) if order == "seeded" else len(total_items))
    return PageResponse(items=items, offset=offset, hasMore=has_more)


@app.get("/thumbnail-list", response_model=PageResponse)
def get_thumbnail_list(
    seed: Optional[str] = Query(None, description="会话随机种子（当未指定 tag 时必填）"),
    tag: Optional[str] = Query(None, description="标签名，指定时返回该标签的缩略图列表"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    order: str = Query("seeded", regex="^(seeded|recent)$"),
    db=Depends(get_db),
):
    # 统一的缩略图列表：当指定 tag 时按标签过滤，否则按 seed/order 返回通用缩略图列表
    if tag:
        # 校验标签是否存在
        if not db.query(TagDefinition).filter(TagDefinition.name == tag).first():
            raise HTTPException(status_code=400, detail="invalid tag")
        q = (
            db.query(Media)
            .join(MediaTag, MediaTag.media_id == Media.id)
            .filter(MediaTag.tag_name == tag)
            .order_by(MediaTag.created_at.desc())
        )
        total_items = q.all()
        sliced = total_items[offset : offset + limit]
        items = [to_media_item(m, include_thumb=True) for m in sliced]
        has_more = (offset + len(items)) < len(total_items)
        return PageResponse(items=items, offset=offset, hasMore=has_more)

    # 非标签模式需要 seed
    if seed is None or str(seed).strip() == "":
        raise HTTPException(status_code=400, detail="seed required when tag not provided")

    if order == "recent":
        q = db.query(Media).order_by(Media.created_at.desc())
        total_items = q.all()
        sliced = total_items[offset : offset + limit]
        items = [to_media_item(m, include_thumb=True) for m in sliced]
        has_more = (offset + len(items)) < len(total_items)
        return PageResponse(items=items, offset=offset, hasMore=has_more)
    else:
        all_items = db.query(Media).all()
        all_items.sort(key=lambda m: seeded_key(seed, m.id))
        sliced = all_items[offset : offset + limit]
        items = [to_media_item(m, include_thumb=True) for m in sliced]
        has_more = (offset + len(items)) < len(all_items)
        return PageResponse(items=items, offset=offset, hasMore=has_more)






@app.post("/tag")
def add_tag(req: TagRequest, db=Depends(get_db)):
    # 校验标签
    tag_def = db.query(TagDefinition).filter(TagDefinition.name == req.tag).first()
    if not tag_def:
        raise HTTPException(status_code=400, detail="invalid tag")

    # 校验媒体
    media = db.query(Media).filter(Media.id == req.media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="media not found")

    # 唯一约束：同一媒体同一标签仅一次
    existing = (
        db.query(MediaTag)
        .filter(MediaTag.media_id == req.media_id, MediaTag.tag_name == req.tag)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="tag already exists for media")

    db.add(MediaTag(media_id=req.media_id, tag_name=req.tag))
    db.commit()
    return {"success": True}


@app.delete("/tag", status_code=204)
def remove_tag(req: TagRequest, db=Depends(get_db)):
    # 校验媒体与标签是否存在
    mt = (
        db.query(MediaTag)
        .filter(MediaTag.media_id == req.media_id, MediaTag.tag_name == req.tag)
        .first()
    )
    if not mt:
        raise HTTPException(status_code=404, detail="tag not set for media")

    db.delete(mt)
    db.commit()
    return None


@app.get("/tags")
def list_tags(db=Depends(get_db)):
    tags = [t.name for t in db.query(TagDefinition).all()]
    return {"tags": tags}




@app.get("/media/{media_id}/thumbnail")
def get_media_thumbnail(media_id: int, db=Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="media not found")
    if not os.path.exists(media.absolute_path):
        raise HTTPException(status_code=404, detail="file not found")
    # 简化：直接返回原文件作为缩略图，占位用途；后续可替换为真实缩略图。
    mime = "image/jpeg" if media.media_type == "image" else "video/mp4"
    return FileResponse(path=media.absolute_path, media_type=mime, filename=media.filename)


@app.get("/media-resource/{media_id}")
def get_media_resource(media_id: int, db=Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="media not found")
    if not os.path.exists(media.absolute_path):
        raise HTTPException(status_code=404, detail="file not found")
    mime = "image/jpeg" if media.media_type == "image" else "video/mp4"
    return FileResponse(path=media.absolute_path, media_type=mime, filename=media.filename)