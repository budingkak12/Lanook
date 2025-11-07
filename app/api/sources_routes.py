from __future__ import annotations

import os
from datetime import timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from 初始化数据库 import SessionLocal
from app.schemas.sources import (
    MediaSourceModel,
    ScanStartResponse,
    ScanStatusResponse,
    ScanState,
    SourceCreateRequest,
    SourceStatus,
    SourceType,
    SourceValidateRequest,
    SourceValidateResponse,
)
from app.services.scan_service import get_scan_status, start_scan_job, scan_source_once
from app.services.sources_service import (
    create_source,
    delete_source,
    get_source,
    list_sources,
    restore_source,
)
from app.services.credentials import store_smb_password
from app.services.auto_scan_service import ensure_auto_scan_service
from 初始化数据库 import create_database_and_tables


router = APIRouter(tags=["sources"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _iso(dt):
    if not dt:
        return None
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _bootstrap_source_scan(root_path: str, *, limit: int = 50) -> None:
    try:
        create_database_and_tables(echo=False)
        with SessionLocal() as session:
            added = scan_source_once(session, root_path, limit=limit)
            session.commit()
            if added:
                print(f"[media-source] 首批导入 {added} 个媒体文件 ({root_path})。")
    except Exception as exc:
        print(f"[media-source] 首批扫描失败 ({root_path}): {exc}")


def _ensure_background_scan(request: Request, root_path: str) -> None:
    service = ensure_auto_scan_service(request.app)
    service.register_path(root_path)
    service.trigger_path(root_path)


def _to_media_source_model(src) -> MediaSourceModel:
    status_value = src.status or "active"
    try:
        status_enum = SourceStatus(status_value)
    except ValueError:
        status_enum = SourceStatus.ACTIVE
    return MediaSourceModel(
        id=src.id,
        type=SourceType(src.type),
        displayName=src.display_name,
        rootPath=src.root_path,
        createdAt=_iso(src.created_at),
        status=status_enum,
        deletedAt=_iso(src.deleted_at),
        lastScanAt=_iso(src.last_scan_at),
    )


@router.post("/setup/source/validate", response_model=SourceValidateResponse)
def validate_source(req: SourceValidateRequest):
    exts = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv"}
    if req.type == SourceType.LOCAL:
        if not req.path:
            raise HTTPException(status_code=422, detail="path required")
        p = Path(req.path).expanduser().resolve()
        if not p.exists():
            raise HTTPException(status_code=404, detail="路径不存在")
        if not p.is_dir():
            raise HTTPException(status_code=422, detail="路径不是文件夹")
        if not os.access(p, os.R_OK):
            raise HTTPException(status_code=403, detail="无读取权限")

        total = 0
        samples: list[str] = []
        for root, _dirs, files in os.walk(p):
            for f in files:
                if Path(f).suffix.lower() in exts:
                    total += 1
                    if len(samples) < 10:
                        samples.append(str(Path(root) / f))
        return SourceValidateResponse(
            ok=True,
            readable=True,
            absPath=str(p),
            estimatedCount=total,
            samples=samples,
            note="只读验证通过，不会写入或删除此目录下文件",
        )
    elif req.type == SourceType.SMB:
        # 基础参数校验
        if not req.host or not req.share:
            raise HTTPException(status_code=422, detail="host/share required")
        import fs
        from urllib.parse import quote

        # 组装连接 URL（仅用于校验；创建时凭证写入 keyring）
        if req.anonymous:
            fs_url = f"smb://{req.host}/{req.share}"
        elif req.username and req.password:
            user = req.username
            pw = req.password
            fs_url = f"smb://{quote(user)}:{quote(pw)}@{req.host}/{req.share}"
        else:
            raise HTTPException(status_code=422, detail="anonymous 或用户名密码其一必填")
        sub = (req.subPath or "").lstrip("/")
        try:
            vfs = fs.open_fs(fs_url)
        except Exception as exc:
            raise HTTPException(status_code=403, detail=f"连接失败：{exc}")
        try:
            # 进入子路径（如果提供）
            if sub:
                if not vfs.isdir(sub):
                    raise HTTPException(status_code=404, detail="子路径不存在或不是目录")
                root_fs = vfs.opendir(sub)
            else:
                root_fs = vfs
            total = 0
            samples: list[str] = []
            for path in root_fs.walk.files():
                ext = os.path.splitext(path)[1].lower()
                if ext in exts:
                    total += 1
                    if len(samples) < 10:
                        samples.append(f"smb://{req.host}/{req.share}/" + (sub + "/" if sub else "") + path)
            return SourceValidateResponse(
                ok=True,
                readable=True,
                absPath=f"smb://{req.host}/{req.share}/" + sub,
                estimatedCount=total,
                samples=samples,
                note="只读验证通过，不会写入或删除此目录下文件",
            )
        finally:
            vfs.close()
    else:
        raise HTTPException(status_code=422, detail="未知来源类型")


@router.post("/setup/source", response_model=MediaSourceModel, status_code=201)
def create_media_source(
    payload: SourceCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if payload.type == SourceType.LOCAL:
        if not payload.rootPath:
            raise HTTPException(status_code=422, detail="rootPath required")
        p = Path(payload.rootPath).expanduser().resolve()
        if not p.exists() or not p.is_dir() or not os.access(p, os.R_OK):
            raise HTTPException(status_code=422, detail="无效目录或无读取权限")
        src = create_source(db, type_=payload.type.value, root_path=str(p), display_name=payload.displayName)
        _bootstrap_source_scan(src.root_path)
        _ensure_background_scan(request, src.root_path)
        return _to_media_source_model(src)
    elif payload.type == SourceType.SMB:
        if not payload.host or not payload.share:
            raise HTTPException(status_code=422, detail="host/share required")
        # 匿名或用户名密码
        anonymous = bool(payload.anonymous)
        if not anonymous and not (payload.username and payload.password):
            raise HTTPException(status_code=422, detail="anonymous 或用户名密码其一必填")
        # 存储密码到系统钥匙串（不入库）
        if payload.username and payload.password:
            store_smb_password(payload.host, payload.share, payload.username, payload.password)
        # 组装根 URL：smb://[domain;]user@host/share/sub
        user_part = ""
        if payload.username:
            if payload.domain:
                user_part = f"{payload.domain};{payload.username}@"
            else:
                user_part = f"{payload.username}@"
        sub = (payload.subPath or "").strip("/")
        root_url = f"smb://{user_part}{payload.host}/{payload.share}"
        if sub:
            root_url += f"/{sub}"
        src = create_source(db, type_=payload.type.value, root_path=root_url, display_name=payload.displayName)
        _bootstrap_source_scan(src.root_path)
        _ensure_background_scan(request, src.root_path)
        return _to_media_source_model(src)
    else:
        raise HTTPException(status_code=422, detail="未知来源类型")


@router.get("/media-sources", response_model=List[MediaSourceModel])
def list_media_sources(
    include_inactive: bool = Query(False, description="是否包含已停用的来源"),
    db: Session = Depends(get_db),
):
    rows = list_sources(db, include_inactive=include_inactive)
    return [_to_media_source_model(r) for r in rows]


@router.delete("/media-sources/{source_id}", status_code=204)
def remove_media_source(
    source_id: int,
    hard: bool = Query(False, description="是否立即彻底删除"),
    db: Session = Depends(get_db),
):
    ok = delete_source(db, source_id, hard=hard)
    if not ok:
        raise HTTPException(status_code=404, detail="not found")
    return None


@router.post("/media-sources/{source_id}/restore", response_model=MediaSourceModel)
def restore_media_source(source_id: int, db: Session = Depends(get_db)):
    src = restore_source(db, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="not found")
    return _to_media_source_model(src)


@router.post("/scan/start", response_model=ScanStartResponse, status_code=202)
def start_scan(source_id: int = Query(..., description="来源ID"), background: BackgroundTasks = None, db: Session = Depends(get_db)):
    src = get_source(db, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="source not found")
    if src.status and src.status != "active":
        raise HTTPException(status_code=409, detail="source inactive")
    job_id = start_scan_job(src.id, src.root_path, background)
    return ScanStartResponse(jobId=job_id)


@router.get("/scan/status", response_model=ScanStatusResponse)
def get_scan(job_id: str = Query(..., description="任务ID")):
    job = get_scan_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    state = ScanState(job.state)
    return ScanStatusResponse(
        jobId=job.job_id,
        sourceId=job.source_id,
        state=state,
        scannedCount=job.scanned_count or 0,
        message=job.message,
        startedAt=_iso(job.started_at),
        finishedAt=_iso(job.finished_at),
    )
