from typing import List, Optional
from datetime import datetime
import hashlib
import random

from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
import os
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mimetypes
import time
from pathlib import Path
import socket

from PIL import Image
import av  # type: ignore

import uvicorn

# 复用数据库与模型（无用户概念）
from 初始化数据库 import (
    SessionLocal,
    Media,
    TagDefinition,
    MediaTag,
    create_database_and_tables,
    seed_initial_data,
)

# 业务拆分：批量删除服务
from app.services.deletion_service import batch_delete as svc_batch_delete
from sqlalchemy.exc import OperationalError


# =============================
# Pydantic 模型
# =============================

class SessionRequest(BaseModel):
    # 允许前端传入数字或字符串的种子；后续统一转为字符串
    seed: Optional[str | int] = None


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
    # Optional tag state for UI correctness (global, no user)
    liked: Optional[bool] = None
    favorited: Optional[bool] = None


class PageResponse(BaseModel):
    items: List[MediaItem]
    offset: int
    hasMore: bool


class TagRequest(BaseModel):
    media_id: int
    tag: str


# 批量删除模型
class DeleteBatchReq(BaseModel):
    ids: List[int]
    delete_file: bool = True


class FailedItemModel(BaseModel):
    id: int
    reason: str


class DeleteBatchResp(BaseModel):
    deleted: List[int]
    failed: List[FailedItemModel] = []


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

# 轻量健康检查，供 Android 客户端自动探测可用服务地址
@app.get("/health")
def health():
    return {"status": "ok"}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 应用启动时可选地初始化数据库（默认跳过；设置环境变量开启）
@app.on_event("startup")
def _ensure_db_initialized():
    flag = str(os.environ.get("MEDIA_APP_INIT_ON_STARTUP", "")).strip().lower()
    enabled = flag in {"1", "true", "yes", "on"}
    if not enabled:
        print("[startup] Skip DB init (set MEDIA_APP_INIT_ON_STARTUP=1 to enable).")
        return
    try:
        create_database_and_tables()
        db = SessionLocal()
        try:
            seed_initial_data(db)
        finally:
            db.close()
        print("[startup] Database initialized and base tags ensured.")
    except Exception as e:
        # 不阻断服务启动，但打印警告以便诊断
        print("[startup] Database init warning:", e)


# =============================
# 工具函数
# =============================

# 缩略图目录（项目根目录下）
THUMBNAILS_DIR = Path(__file__).parent / "thumbnails"
THUMBNAILS_DIR.mkdir(exist_ok=True)
MAX_THUMB_SIZE = (480, 480)

if hasattr(Image, "Resampling"):
    _LANCZOS = Image.Resampling.LANCZOS  # Pillow >= 9.1
else:  # pragma: no cover - 兼容旧版本 Pillow
    _LANCZOS = Image.LANCZOS

def _thumb_path_for(media: Media) -> Path:
    # 统一生成 jpg 缩略图，文件名为 <id>.jpg
    return THUMBNAILS_DIR / f"{media.id}.jpg"

def _should_regenerate(src_path: str, thumb_path: Path) -> bool:
    try:
        src_stat = os.stat(src_path)
        if not thumb_path.exists():
            return True
        th_stat = os.stat(thumb_path)
        # 当源文件更新或缩略图为空/过小则重新生成
        if src_stat.st_mtime > th_stat.st_mtime:
            return True
        if th_stat.st_size < 2000:  # 小于 2KB 视为异常缩略图
            return True
        return False
    except Exception:
        return True


def _save_image_thumbnail(img: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Pillow 会就地缩放，因此复制一份避免影响原图对象
    thumb_img = img.copy()
    thumb_img.thumbnail(MAX_THUMB_SIZE, _LANCZOS)
    # 视频帧往往是 YUV，需要转为 RGB
    if thumb_img.mode not in {"RGB", "L"}:
        thumb_img = thumb_img.convert("RGB")
    thumb_img.save(dest, format="JPEG", quality=85)


def _generate_image_thumbnail(src: str, dest: Path) -> bool:
    try:
        with Image.open(src) as img:
            _save_image_thumbnail(img, dest)
        return True
    except Exception:
        return False


def _generate_video_thumbnail(src: str, dest: Path, target_seconds: float = 1.0) -> bool:
    try:
        with av.open(src) as container:
            video_stream = next((stream for stream in container.streams if stream.type == "video"), None)
            if video_stream is None:
                return False
            video_stream.thread_type = "AUTO"

            seek_pts = None
            if video_stream.time_base:
                # time_base 是每个 pts 单位的秒数
                seek_pts = int(max(target_seconds / float(video_stream.time_base), 0))
            if seek_pts is not None and seek_pts > 0:
                try:
                    container.seek(seek_pts, stream=video_stream, any_frame=False, backward=True)
                except av.AVError:
                    container.seek(0)

            frame = None
            for decoded in container.decode(video_stream):
                frame = decoded
                break
            if frame is None:
                return False
            pil_image = frame.to_image()  # PIL.Image
            _save_image_thumbnail(pil_image, dest)
            return True
    except Exception:
        return False


def get_or_generate_thumbnail(media: Media) -> Path | None:
    """生成并返回缩略图路径；失败时返回 None（由调用方回退到原文件）。

    - 图片：等比缩放到不超过 480x480
    - 视频：使用 python-av 抽帧（默认 1s 处），缩放不超过 480x480
    """
    if not media.absolute_path or not isinstance(media.absolute_path, str):
        return None
    src = media.absolute_path
    thumb = _thumb_path_for(media)
    if not _should_regenerate(src, thumb):
        return thumb

    try:
        if media.media_type == "image":
            success = _generate_image_thumbnail(src, thumb)
        else:
            success = _generate_video_thumbnail(src, thumb)
        if success and thumb.exists() and thumb.stat().st_size > 0:
            return thumb
        return None
    except Exception:
        # 生成失败时清理坏文件
        try:
            if thumb.exists():
                thumb.unlink()
        except Exception:
            pass
        return None

def to_media_item(m: Media, db, include_thumb: bool = False, include_tag_state: bool = True) -> MediaItem:
    liked_val: Optional[bool] = None
    favorited_val: Optional[bool] = None
    if include_tag_state:
        liked_val = db.query(MediaTag).filter(MediaTag.media_id == m.id, MediaTag.tag_name == 'like').first() is not None
        favorited_val = db.query(MediaTag).filter(MediaTag.media_id == m.id, MediaTag.tag_name == 'favorite').first() is not None

    return MediaItem(
        id=m.id,
        url=f"/media-resource/{m.id}",  # 统一通过“原媒体资源”接口提供资源
        resourceUrl=f"/media-resource/{m.id}",
        type=m.media_type,
        filename=m.filename,
        createdAt=(m.created_at.isoformat() if isinstance(m.created_at, datetime) else str(m.created_at)),
        thumbnailUrl=(f"/media/{m.id}/thumbnail" if include_thumb else None),
        liked=liked_val,
        favorited=favorited_val,
    )


def seeded_key(seed: str, media_id: int) -> str:
    return hashlib.sha256(f"{seed}:{media_id}".encode()).hexdigest()


# =============================
# 路由
# =============================

@app.get("/session", response_model=SessionResponse)
def create_session(seed: Optional[str] = Query(None)):
    if seed is None or str(seed).strip() == "":
        # 生成一个稳定字符串种子（可替换为 uuid 或时间戳）
        session_seed = str(random.randint(10**12, 10**13 - 1))
    else:
        # 接受数字/字符串并规范化为字符串
        session_seed = str(seed)
    return SessionResponse(session_seed=session_seed)


@app.delete("/media/{media_id}", status_code=204)
def delete_media_item(
    media_id: int,
    delete_file: bool = Query(True, description="是否同时删除原始文件"),
    db=Depends(get_db),
):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="media not found")

    thumb_path = _thumb_path_for(media)
    # 从数据库删除记录（包含标签）
    db.delete(media)
    db.commit()

    # 删除缩略图文件（若存在）
    try:
        if thumb_path.exists():
            thumb_path.unlink()
    except Exception:
        pass

    # 可选删除原媒体文件
    if delete_file and media.absolute_path and isinstance(media.absolute_path, str):
        try:
            if os.path.exists(media.absolute_path):
                os.remove(media.absolute_path)
        except Exception:
            # 失败不影响 API 主流程
            pass


@app.post("/media/batch-delete", response_model=DeleteBatchResp)
def batch_delete_media(req: DeleteBatchReq, db=Depends(get_db)):
    """批量删除媒体：
    - 不存在的 id 视为已删除（幂等）。
    - 返回已删除与失败清单；原文件/缩略图删除失败不作为失败判定（DB 已删）。
    """
    deleted, failed = svc_batch_delete(db, req.ids, delete_file=req.delete_file)
    # 若疑似数据库处于只读/提交失败：将其提升为 503，便于客户端清晰提示
    if not deleted and failed and len(failed) == len(req.ids):
        reasons = " ".join([f.reason or "" for f in failed]).lower()
        if ("commit_failed" in reasons) or ("readonly" in reasons) or ("read-only" in reasons):
            raise HTTPException(status_code=503, detail="database is read-only; check file permissions or restart backend")
    return DeleteBatchResp(
        deleted=deleted,
        failed=[FailedItemModel(id=f.id, reason=f.reason) for f in failed],
    )




@app.get("/media-list", response_model=PageResponse)
def get_media_list(
    seed: Optional[str] = Query(None, description="会话随机种子（当未指定 tag 时必填）"),
    tag: Optional[str] = Query(None, description="标签名，指定时返回该标签的列表"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    order: str = Query("seeded", regex="^(seeded|recent)$"),
    db=Depends(get_db),
):
    # 统一的媒体列表：当指定 tag 时按标签过滤，否则按 seed/order 返回推荐流
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
        items = [to_media_item(m, db, include_thumb=True, include_tag_state=True) for m in sliced]
        has_more = (offset + len(items)) < len(total_items)
        return PageResponse(items=items, offset=offset, hasMore=has_more)

    # 非标签模式需要 seed
    if seed is None or str(seed).strip() == "":
        raise HTTPException(status_code=400, detail="seed required when tag not provided")

    if order == "recent":
        q = db.query(Media).order_by(Media.created_at.desc())
        total_items = q.all()
        sliced = total_items[offset : offset + limit]
        items = [to_media_item(m, db, include_thumb=True, include_tag_state=True) for m in sliced]
        has_more = (offset + len(items)) < len(total_items)
        return PageResponse(items=items, offset=offset, hasMore=has_more)
    else:
        all_items = db.query(Media).all()
        all_items.sort(key=lambda m: seeded_key(seed, m.id))
        sliced = all_items[offset : offset + limit]
        items = [to_media_item(m, db, include_thumb=True, include_tag_state=True) for m in sliced]
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
    try:
        db.commit()
    except OperationalError as e:
        msg = str(e).lower()
        if "readonly" in msg:
            # 更友好的错误：数据库当前只读（可能因快照恢复/权限），提示用户检查
            raise HTTPException(status_code=503, detail="database is read-only; check file permissions or restart backend")
        raise
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

    try:
        db.delete(mt)
        db.commit()
    except OperationalError as e:
        msg = str(e).lower()
        if "readonly" in msg:
            raise HTTPException(status_code=503, detail="database is read-only; check file permissions or restart backend")
        raise
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
    # 兼容异常数据：absolute_path 为空或非字符串时返回 404，而不是抛出 500
    if not media.absolute_path or not isinstance(media.absolute_path, str) or not os.path.exists(media.absolute_path):
        raise HTTPException(status_code=404, detail="file not found")
    # 仅提供真实缩略图；不再回退原文件（项目现已具备稳定的视频缩略图能力）
    thumb_path = get_or_generate_thumbnail(media)
    if thumb_path is None or not thumb_path.exists():
        raise HTTPException(status_code=404, detail="thumbnail not available")
    serve_path = str(thumb_path)

    guessed, _ = mimetypes.guess_type(serve_path)
    mime = guessed or "image/jpeg"
    stat = os.stat(serve_path)
    headers = {
        "Cache-Control": "public, max-age=86400, immutable",
        "ETag": f"{int(stat.st_mtime)}-{stat.st_size}",
        "Last-Modified": time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(stat.st_mtime)),
        "Accept-Ranges": "bytes",
    }
    # 注意：移除自定义 Content-Disposition 以避免非 ASCII 文件名触发 latin-1 编码错误
    return FileResponse(path=serve_path, media_type=mime, headers=headers)


@app.get("/media-resource/{media_id}")
def get_media_resource(media_id: int, request: Request, db=Depends(get_db)):
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="media not found")
    # 兼容异常数据：absolute_path 为空或非字符串时返回 404，而不是抛出 500
    if not media.absolute_path or not isinstance(media.absolute_path, str) or not os.path.exists(media.absolute_path):
        raise HTTPException(status_code=404, detail="file not found")
    # 内容类型自动判定，回退到基于 media_type 的默认值
    guessed, _ = mimetypes.guess_type(media.absolute_path)
    mime = guessed or ("image/jpeg" if media.media_type == "image" else "video/mp4")

    file_path = media.absolute_path
    stat = os.stat(file_path)
    file_size = stat.st_size
    range_header = request.headers.get("range") or request.headers.get("Range")

    # 通用响应头：支持缓存与范围请求
    common_headers = {
        "ETag": f"{int(stat.st_mtime)}-{stat.st_size}",
        "Last-Modified": time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime(stat.st_mtime)),
        "Accept-Ranges": "bytes",
    }

    # 无 Range：回退到完整文件响应（带缓存头）
    if not range_header:
        headers = {
            **common_headers,
            "Cache-Control": "public, max-age=3600",
        }
        return FileResponse(path=file_path, media_type=mime, headers=headers)

    # 解析 Range: bytes=start-end 或 bytes=start- 或 bytes=-suffix
    try:
        units, ranges = range_header.split("=", 1)
        if units.strip().lower() != "bytes":
            raise ValueError("Only bytes unit is supported")
        # 暂时仅支持单段范围；多段范围通常浏览器不会使用
        first_range = ranges.split(",")[0].strip()
        if "-" not in first_range:
            raise ValueError("Invalid range format")
        start_str, end_str = first_range.split("-", 1)
        if start_str == "" and end_str != "":
            # suffix bytes: 最后 N 字节
            suffix_len = int(end_str)
            if suffix_len <= 0:
                raise ValueError("Invalid suffix length")
            start = max(file_size - suffix_len, 0)
            end = file_size - 1
        else:
            start = int(start_str)
            end = int(end_str) if end_str != "" else file_size - 1
        if start < 0 or end >= file_size or start > end:
            # 范围无效，返回 416
            headers = {**common_headers, "Content-Range": f"bytes */{file_size}"}
            raise HTTPException(status_code=416, detail="Requested Range Not Satisfiable", headers=headers)
    except HTTPException:
        raise
    except Exception:
        headers = {**common_headers, "Content-Range": f"bytes */{file_size}"}
        raise HTTPException(status_code=416, detail="Invalid Range", headers=headers)

    chunk_size = 1024 * 1024  # 1MB per chunk
    length = end - start + 1

    def file_iter(path: str, start_pos: int, total_len: int):
        with open(path, "rb") as f:
            f.seek(start_pos)
            remaining = total_len
            while remaining > 0:
                read_len = min(chunk_size, remaining)
                data = f.read(read_len)
                if not data:
                    break
                yield data
                remaining -= len(data)

    headers = {
        **common_headers,
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(length),
        "Cache-Control": "public, max-age=3600",
    }
    return StreamingResponse(file_iter(file_path, start, length), status_code=206, media_type=mime, headers=headers)


# =============================
# 直接运行支持
# =============================

def _get_local_ip() -> str:
    """尽可能获取局域网 IP（IPv4）。在没有外网时回退到主机名解析或 127.0.0.1。"""
    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # 不会真正发包，仅用于选择出站网卡
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            pass
    return ip


if __name__ == "__main__":
    host = "0.0.0.0"
    port = 8000
    lan_ip = _get_local_ip()
    print(f"[boot] Media App API 即将启动: http://{lan_ip}:{port}  (本机: http://localhost:{port})")
    uvicorn.run(app, host=host, port=port)
