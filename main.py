import os
import uuid
from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, computed_field
from typing import List, Literal
from sqlalchemy.orm import Session
from sqlalchemy import func, exc

# 从 models.py 导入我们定义的模型和数据库会话
import models
from models import SessionLocal, engine

# 在应用启动时创建数据库表（如果不存在）
models.Base.metadata.create_all(bind=engine)

# --- FastAPI 应用实例与数据库会话依赖 ---

app = FastAPI(
    title="媒体流App后端API (数据库版)",
    description="使用SQLite数据库为Flutter应用提供后端接口。",
    version="2.0.0",
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 依赖项：获取数据库会话
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic 数据模型定义 ---

class MediaItemResponse(BaseModel):
    id: int
    type: str
    
    # 核心：动态生成内容URL
    @computed_field
    @property
    def content_url(self) -> str:
        # Pydantic v2 使用 @computed_field 来创建动态字段
        # 这个URL将指向我们下面创建的 /media/{media_id}/content 接口
        return f"/media/{self.id}/content"
    
    class Config:
        from_attributes = True # 允许从ORM模型直接转换

class SessionResponse(BaseModel):
    session_id: str

class FeedResponse(BaseModel):
    items: List[MediaItemResponse]

class TagRequest(BaseModel):
    user_id: str
    media_id: int
    tag: Literal["favorite", "like"]

class TagListResponse(BaseModel):
    items: List[MediaItemResponse]

class SuccessResponse(BaseModel):
    message: str

# --- API 端点实现 ---

@app.post("/session", response_model=SessionResponse, tags=["会话管理"])
def create_session(db: Session = Depends(get_db)):
    """创建或获取一个用户会话，并存入数据库。"""
    session_id = str(uuid.uuid4())
    new_user = models.User(id=session_id)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return SessionResponse(session_id=new_user.id)

@app.get("/feed", response_model=FeedResponse, tags=["内容流"])
def get_feed(
    session_id: str,
    offset: int = 0,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """从数据库中获取随机排序的媒体流。"""
    user = db.query(models.User).filter(models.User.id == session_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="会话ID不存在")

    media_items = db.query(models.Media).order_by(func.random()).offset(offset).limit(limit).all()
    return FeedResponse(items=media_items)
    
@app.get("/media/{media_id}/content", tags=["媒体内容"])
async def get_media_content(media_id: int, db: Session = Depends(get_db)):
    """
    【核心接口】根据媒体ID，从服务器磁盘读取文件并以流的形式返回。
    前端通过这个接口获取媒体的实际内容。
    """
    media_item = db.query(models.Media).filter(models.Media.id == media_id).first()

    if not media_item:
        raise HTTPException(status_code=404, detail="媒体不存在")
    
    file_path = media_item.absolute_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=500, detail="服务器内部错误：媒体文件丢失")

    return FileResponse(file_path)

@app.post("/tag", response_model=SuccessResponse, tags=["用户标签"])
def add_tag(request: TagRequest, db: Session = Depends(get_db)):
    """为媒体添加标签（喜欢/收藏）并存入数据库。"""
    # 检查用户和媒体是否存在
    user = db.query(models.User).filter(models.User.id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户ID不存在")
    media = db.query(models.Media).filter(models.Media.id == request.media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="媒体ID不存在")

    new_tag = models.UserTag(user_id=request.user_id, media_id=request.media_id, tag_name=request.tag)
    db.add(new_tag)
    
    try:
        db.commit()
    except exc.IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="标签已存在") # 409 Conflict

    return SuccessResponse(message=f"已成功为媒体 {request.media_id} 添加 '{request.tag}' 标签。")

@app.delete("/tag", response_model=SuccessResponse, tags=["用户标签"])
def remove_tag(request: TagRequest, db: Session = Depends(get_db)):
    """从数据库中移除媒体的标签。"""
    tag_to_delete = db.query(models.UserTag).filter(
        models.UserTag.user_id == request.user_id,
        models.UserTag.media_id == request.media_id,
        models.UserTag.tag_name == request.tag
    ).first()
    
    if tag_to_delete:
        db.delete(tag_to_delete)
        db.commit()
        return SuccessResponse(message=f"已成功移除媒体 {request.media_id} 的 '{request.tag}' 标签。")
    
    raise HTTPException(status_code=404, detail="要移除的标签不存在")

@app.get("/tag/{tag_name}", response_model=TagListResponse, tags=["用户标签"])
def get_tagged_media(
    tag_name: Literal["favorite", "like"],
    user_id: str,
    offset: int = 0,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """从数据库中获取用户特定标签下的所有媒体列表。"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户ID不存在")
    
    # 使用 ORM 的 join 查询
    tagged_media = (
        db.query(models.Media)
        .join(models.UserTag)
        .filter(
            models.UserTag.user_id == user_id,
            models.UserTag.tag_name == tag_name
        )
        .order_by(models.UserTag.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    return TagListResponse(items=tagged_media)

@app.middleware("http")
async def add_base_url_to_response(request: Request, call_next):
    """
    中间件，动态地为返回的 content_url 添加服务器基础URL。
    这样客户端拿到的就是可以直接访问的完整URL。
    """
    response = await call_next(request)
    if response.status_code == 200 and 'application/json' in response.headers.get('content-type', ''):
        import json
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        
        data = json.loads(body)
        base_url = str(request.base_url)
        
        # 递归地为所有 content_url 字段添加 base_url 前缀
        def prefix_urls(obj):
            if isinstance(obj, dict):
                for key, value in obj.items():
                    if key == 'content_url' and isinstance(value, str) and value.startswith('/'):
                        obj[key] = f"{base_url.rstrip('/')}{value}"
                    else:
                        prefix_urls(value)
            elif isinstance(obj, list):
                for item in obj:
                    prefix_urls(item)
        
        prefix_urls(data)
        
        # 返回修改后的响应体
        return Response(content=json.dumps(data), media_type="application/json", headers=dict(response.headers))
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)