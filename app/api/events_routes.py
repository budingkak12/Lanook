from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import AsyncIterator, Optional

import anyio
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.api.task_routes import get_asset_pipeline_status, get_scan_progress
from app.db import SessionLocal
from app.db.models import TagDefinition
from app.services import media_service

router = APIRouter(prefix="/events", tags=["events"])


def _sse(event: str, data: object) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _parse_iso_datetime(value: str) -> Optional[datetime]:
    raw = (value or "").strip()
    if not raw:
        return None
    # 兼容 2025-01-01T00:00:00Z
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(raw)
    except Exception:
        return None


@router.get("/tasks")
async def stream_tasks(interval_ms: int = Query(1000, ge=200, le=10_000)) -> StreamingResponse:
    """任务进度 SSE：1s 内刷新。"""

    async def gen() -> AsyncIterator[str]:
        last: str | None = None
        while True:
            scan = await anyio.to_thread.run_sync(lambda: get_scan_progress(False).model_dump(mode="json"))
            asset = await anyio.to_thread.run_sync(lambda: get_asset_pipeline_status().model_dump(mode="json"))
            data = {"scan": scan, "asset": asset}
            frame = _sse("snapshot", data)
            if frame != last:
                yield frame
                last = frame
            await asyncio.sleep(interval_ms / 1000.0)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Nginx/反向代理下避免缓冲
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tags")
async def stream_tags(
    interval_ms: int = Query(300, ge=100, le=10_000),
    since: str | None = Query(None, description="ISO8601 时间戳；不传则先发全量快照"),
) -> StreamingResponse:
    """标签变更 SSE：新增标签尽量立刻推送给前端做联想缓存。"""

    async def gen() -> AsyncIterator[str]:
        cursor = _parse_iso_datetime(since) if since else None

        # 首帧：全量快照（与 /tags?with_translation=true 口径一致）
        if cursor is None:
            with SessionLocal() as db:
                tags = media_service.list_tags_with_translation(db)
                max_created = db.query(TagDefinition.created_at).order_by(TagDefinition.created_at.desc()).first()
                cursor = max_created[0] if max_created else None
            yield _sse("snapshot", {"tags": tags})

        while True:
            with SessionLocal() as db:
                q = db.query(TagDefinition).order_by(TagDefinition.created_at.asc(), TagDefinition.name.asc())
                if cursor is not None:
                    q = q.filter(TagDefinition.created_at.isnot(None) & (TagDefinition.created_at > cursor))
                rows = q.limit(200).all()
                if rows:
                    translations = media_service._load_tag_translations()  # noqa: SLF001
                    for row in rows:
                        name = str(row.name)
                        display = translations.get(name) or translations.get(media_service._normalize_tag_key(name))  # noqa: SLF001
                        yield _sse(
                            "tag_added",
                            {
                                "name": name,
                                "display_name": display,
                                "created_at": row.created_at.isoformat() if row.created_at else None,
                            },
                        )
                    # 更新 cursor
                    last_created = rows[-1].created_at
                    if last_created:
                        cursor = last_created

            await asyncio.sleep(interval_ms / 1000.0)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

