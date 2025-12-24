from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import Collection, CollectionItem, Media
from app.db.bootstrap import scan_and_populate_media
from app.schemas.collection import CollectionCreate, CollectionUpdate, SmartAddRequest
from app.services import media_service
from app.services.exceptions import ServiceError
from app.services.query_filters import apply_active_media_filter


class CollectionNotFoundError(ServiceError):
    default_status = 404


def create_collection(db: Session, data: CollectionCreate) -> Collection:
    col = Collection(name=data.name, description=data.description)
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


def get_collection(db: Session, col_id: int) -> Optional[Collection]:
    return db.query(Collection).filter(Collection.id == col_id).first()


def list_collections(db: Session) -> List[Collection]:
    return db.query(Collection).order_by(Collection.updated_at.desc()).all()


def update_collection(db: Session, col_id: int, data: CollectionUpdate) -> Optional[Collection]:
    col = get_collection(db, col_id)
    if not col:
        return None
    if data.name is not None:
        col.name = data.name
    if data.description is not None:
        col.description = data.description
    col.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(col)
    return col


def delete_collection(db: Session, col_id: int) -> bool:
    col = get_collection(db, col_id)
    if not col:
        return False
    # delete items first or let cascade handle it (if configured)
    db.query(CollectionItem).filter(CollectionItem.collection_id == col_id).delete(synchronize_session=False)
    db.delete(col)
    db.commit()
    return True


def add_items_to_collection(db: Session, col_id: int, req: SmartAddRequest) -> int:
    col = get_collection(db, col_id)
    if not col:
        raise CollectionNotFoundError("collection not found")

    media_ids: set[int] = set()

    # Mode 1: asset_ids（明确指定的 ID）
    if req.asset_ids:
        existing_ids = {
            mid for (mid,) in db.query(Media.id).filter(Media.id.in_(list(set(req.asset_ids)))).all()
        }
        media_ids.update(existing_ids)

    # Mode 2: scan_paths（路径导入）
    if req.scan_paths:
        for raw in req.scan_paths:
            if not raw or not str(raw).strip():
                continue
            resolved_dir = Path(raw).expanduser().resolve()
            # 1) 扫描入库
            scan_and_populate_media(db, str(resolved_dir))

            # 2) 收集该路径下媒体 ID
            prefix = str(resolved_dir).rstrip("/\\")
            patterns = [f"{prefix}/%", f"{prefix}\\%"]
            rows = (
                db.query(Media.id, Media.absolute_path)
                .filter(or_(Media.absolute_path.like(patterns[0]), Media.absolute_path.like(patterns[1])))
                .all()
            )
            if req.recursive:
                for mid, _abs_path in rows:
                    media_ids.add(int(mid))
                continue

            # non-recursive：只保留“直接子文件”
            for mid, abs_path in rows:
                try:
                    if Path(abs_path).expanduser().resolve().parent == resolved_dir:
                        media_ids.add(int(mid))
                except Exception:
                    continue

    # Mode 3: 搜索全选（Query Replay）
    if req.from_search_result:
        query = (req.search_query or "").strip()
        if not query:
            raise ServiceError("from_search_result=true 时必须提供 search_query", status_code=422)

        # 复用搜索逻辑（无分页限制）：循环拉取直到 hasMore=false
        offset = 0
        page_limit = 200
        safety_max = 10000
        while True:
            page = media_service.get_media_page(
                db,
                seed="add_to_collection",
                tag=req.tag,
                query_text=query,
                search_mode=req.search_mode,
                offset=offset,
                limit=page_limit,
                order="recent",
            )
            if not page.items:
                break
            for item in page.items:
                media_ids.add(int(item.id))
            offset += len(page.items)
            if not page.hasMore or offset >= safety_max:
                break

    if not media_ids:
        return 0

    # 批量去重：过滤已存在的关联
    existing = {
        mid
        for (mid,) in (
            db.query(CollectionItem.media_id)
            .filter(CollectionItem.collection_id == col_id, CollectionItem.media_id.in_(list(media_ids)))
            .all()
        )
    }
    to_add = [CollectionItem(collection_id=col_id, media_id=mid) for mid in media_ids if mid not in existing]
    if to_add:
        db.add_all(to_add)
        col.updated_at = datetime.utcnow()
    db.commit()
    return len(to_add)


def remove_items_from_collection(db: Session, col_id: int, media_ids: List[int]) -> int:
    col = get_collection(db, col_id)
    if not col:
        raise CollectionNotFoundError("collection not found")
    if not media_ids:
        return 0

    deleted_count = (
        db.query(CollectionItem)
        .filter(CollectionItem.collection_id == col_id, CollectionItem.media_id.in_(list(media_ids)))
        .delete(synchronize_session=False)
    )
    if deleted_count:
        col.updated_at = datetime.utcnow()
    db.commit()
    return deleted_count


def list_collection_items(
    db: Session, col_id: int, offset: int = 0, limit: int = 20
) -> List[Media]:
    # 返回媒体详情
    query = (
        db.query(Media)
        .join(CollectionItem, CollectionItem.media_id == Media.id)
        .filter(CollectionItem.collection_id == col_id)
    )
    # 必须过滤掉已删除/停用来源的媒体（统一口径）
    query = apply_active_media_filter(query, join_source=True)
    return query.order_by(CollectionItem.added_at.desc()).offset(offset).limit(limit).all()
