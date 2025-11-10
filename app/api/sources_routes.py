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


@router.post("/network/discover")
def discover_network_shares(request: dict):
    """
    发现网络设备的SMB共享
    输入: {host, username?, password?, anonymous: bool}
    输出: {success: bool, shares: [{name, path, accessible}], error?: string}
    """
    host = request.get("host")
    if not host:
        raise HTTPException(status_code=422, detail="host required")

    username = request.get("username")
    password = request.get("password")
    anonymous = request.get("anonymous", False)

    # 验证认证参数
    if not anonymous and not (username and password):
        raise HTTPException(status_code=422, detail="anonymous 或用户名密码其一必填")

    try:
        import fs
        from urllib.parse import quote

        # 构建SMB连接URL
        # SMBFS需要指定端口，通常使用445
        if anonymous:
            fs_url = f"smb://{host}:445"
        else:
            fs_url = f"smb://{quote(username)}:{quote(password)}@{host}:445"

        # 尝试连接
        try:
            smb_fs = fs.open_fs(fs_url)
        except Exception as e:
            # 如果445端口失败，尝试不指定端口
            try:
                if anonymous:
                    fs_url = f"smb://{host}"
                else:
                    fs_url = f"smb://{quote(username)}:{quote(password)}@{host}"
                smb_fs = fs.open_fs(fs_url)
            except Exception as e2:
                raise HTTPException(status_code=404, detail=f"无法连接到SMB服务: {str(e2)}")

        try:
            # 获取共享列表
            shares = []
            for share_name in smb_fs.listdir("/"):
                try:
                    # 过滤隐藏文件夹（以.开头的文件夹）和系统文件夹
                    if share_name.startswith('.') or share_name.lower() in ['ipc$', 'admin$', 'print$']:
                        continue

                    # 检查是否是目录（共享）
                    if smb_fs.isdir(share_name):
                        share_path = f"smb://{host}/{share_name}"
                        # 不检查权限，直接添加为可访问
                        shares.append({
                            "name": share_name,
                            "path": share_path,
                            "accessible": True
                        })
                except Exception:
                    # 跳过无法访问的共享
                    continue

            smb_fs.close()

            return {
                "success": True,
                "shares": shares
            }

        except Exception as e:
            smb_fs.close()
            raise HTTPException(status_code=500, detail=f"获取共享列表失败: {str(e)}")

    except Exception as e:
        error_msg = str(e)
        if "Connection refused" in error_msg or "No route to host" in error_msg:
            raise HTTPException(status_code=404, detail="无法连接到设备，请检查IP地址")
        elif "Authentication failed" in error_msg or "Access denied" in error_msg:
            raise HTTPException(status_code=403, detail="认证失败，请检查用户名和密码")
        else:
            raise HTTPException(status_code=500, detail=f"连接失败: {error_msg}")


@router.post("/network/browse")
def browse_network_folder(request: dict):
    """
    浏览网络文件夹内容
    输入: {host, share, path, username?, password?, anonymous: bool}
    输出: {success: bool, folders: [{name, path}], files: [{name, path, size}], error?: string}
    """
    host = request.get("host")
    share = request.get("share")
    path = request.get("path", "")

    if not host or not share:
        raise HTTPException(status_code=422, detail="host and share required")

    username = request.get("username")
    password = request.get("password")
    anonymous = request.get("anonymous", False)

    try:
        import fs
        from urllib.parse import quote

        # 构建SMB连接URL
        if anonymous:
            fs_url = f"smb://{host}:445"
        else:
            fs_url = f"smb://{quote(username)}:{quote(password)}@{host}:445"

        # 尝试连接
        try:
            smb_fs = fs.open_fs(fs_url)
        except Exception as e:
            # 如果445端口失败，尝试不指定端口
            try:
                if anonymous:
                    fs_url = f"smb://{host}"
                else:
                    fs_url = f"smb://{quote(username)}:{quote(password)}@{host}"
                smb_fs = fs.open_fs(fs_url)
            except Exception as e2:
                raise HTTPException(status_code=404, detail=f"无法连接到SMB服务: {str(e2)}")

        try:
            # 打开共享
            share_fs = smb_fs.opendir(share)

            # 如果有子路径，进一步打开
            if path:
                share_fs = share_fs.opendir(path)

            folders = []
            files = []

            # 获取当前路径下的所有条目
            for entry in share_fs.scandir("."):
                entry_name = entry.name
                entry_path = f"{path}/{entry_name}" if path else entry_name

                # 过滤隐藏文件/文件夹
                if entry_name.startswith('.'):
                    continue

                if entry.is_dir:
                    folders.append({
                        "name": entry_name,
                        "path": entry_path
                    })
                else:
                    # 检查是否是媒体文件
                    ext = entry_name.split('.')[-1].lower() if '.' in entry_name else ''
                    if ext in ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv']:
                        try:
                            size = entry.size
                        except:
                            size = 0
                        files.append({
                            "name": entry_name,
                            "path": entry_path,
                            "size": size
                        })

            share_fs.close()
            smb_fs.close()

            return {
                "success": True,
                "folders": sorted(folders, key=lambda x: x['name'].lower()),
                "files": sorted(files, key=lambda x: x['name'].lower())
            }

        except Exception as e:
            share_fs.close()
            smb_fs.close()
            raise HTTPException(status_code=500, detail=f"浏览文件夹失败: {str(e)}")

    except Exception as e:
        error_msg = str(e)
        if "Connection refused" in error_msg or "No route to host" in error_msg:
            raise HTTPException(status_code=404, detail="无法连接到设备，请检查IP地址")
        elif "Authentication failed" in error_msg or "Access denied" in error_msg:
            raise HTTPException(status_code=403, detail="认证失败，请检查用户名和密码")
        else:
            raise HTTPException(status_code=500, detail=f"连接失败: {error_msg}")


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
