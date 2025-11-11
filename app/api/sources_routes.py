from __future__ import annotations

import os
from datetime import timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
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

        # 优先在 macOS 使用 mount_smbfs 验证（本地开发更稳定），失败再回退到 fs.open_fs
        try:
            import platform, shutil, subprocess, tempfile
            from pathlib import Path as _P
            if platform.system().lower() == 'darwin' and shutil.which('mount_smbfs') and shutil.which('umount'):
                mount_point = tempfile.mkdtemp(prefix='nas_validate_')
                try:
                    auth = '' if req.anonymous else f"{req.username}:{req.password}@"
                    url = f"//{auth}{req.host}/{req.share}"
                    subprocess.check_call(['mount_smbfs', url, mount_point], timeout=8)
                    target = _P(mount_point) / (req.subPath.lstrip('/') if req.subPath else '')
                    if not target.exists() or not target.is_dir():
                        raise HTTPException(status_code=404, detail="子路径不存在或不是目录")
                    total = 0
                    samples: list[str] = []
                    for root, _dirs, files in os.walk(target):
                        for f in files:
                            if _P(f).suffix.lower() in exts:
                                total += 1
                                if len(samples) < 10:
                                    rel_root = _P(root).relative_to(target)
                                    rel = '' if str(rel_root) == '.' else str(rel_root) + '/'
                                    prefix = (req.subPath.strip('/') + '/') if req.subPath else ''
                                    samples.append(f"smb://{req.host}/{req.share}/" + prefix + rel + f)
                    return SourceValidateResponse(
                        ok=True,
                        readable=True,
                        absPath=f"smb://{req.host}/{req.share}/" + ((req.subPath or '').strip('/')),
                        estimatedCount=total,
                        samples=samples,
                        note="只读验证通过，不会写入或删除此目录下文件",
                    )
                finally:
                    try:
                        subprocess.run(['umount', mount_point], timeout=5)
                    except Exception:
                        pass
                    try:
                        os.rmdir(mount_point)
                    except Exception:
                        pass
        except HTTPException:
            raise
        except Exception:
            pass

        # 回退方案：fs.open_fs（在部分平台可能不支持 SMB2）
        try:
            import fs
            from urllib.parse import quote
            if req.anonymous:
                base = f"smb://{req.host}"
            elif req.username and req.password:
                base = f"smb://{quote(req.username)}:{quote(req.password)}@{req.host}"
            else:
                raise HTTPException(status_code=422, detail="anonymous 或用户名密码其一必填")
            vfs = fs.open_fs(base)
            root_fs = vfs.opendir(req.share)
            sub = (req.subPath or "").lstrip("/")
            if sub:
                if not root_fs.isdir(sub):
                    raise HTTPException(status_code=404, detail="子路径不存在或不是目录")
                root_fs = root_fs.opendir(sub)
            total = 0
            samples: list[str] = []
            for path in root_fs.walk.files():
                if Path(path).suffix.lower() in exts:
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
        except Exception as exc:
            raise HTTPException(status_code=403, detail=f"连接失败：{exc}")
    else:
        raise HTTPException(status_code=422, detail="未知来源类型")


@router.post("/setup/source", response_model=MediaSourceModel, status_code=201)
def create_media_source(
    payload: SourceCreateRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    # 控制是否立即扫描（默认 True 以兼容旧调用）
    scan_now = True if payload.scan is None else bool(payload.scan)
    if payload.type == SourceType.LOCAL:
        if not payload.rootPath:
            raise HTTPException(status_code=422, detail="rootPath required")
        p = Path(payload.rootPath).expanduser().resolve()
        if not p.exists() or not p.is_dir() or not os.access(p, os.R_OK):
            raise HTTPException(status_code=422, detail="无效目录或无读取权限")
        # 幂等：相同 rootPath 已存在时返回 200，并跳过扫描
        from app.db.models_extra import MediaSource as _MediaSource
        existing = db.query(_MediaSource).filter(_MediaSource.root_path == str(p)).first()
        if existing is not None:
            changed = False
            if existing.status != "active":
                existing.status = "active"
                existing.deleted_at = None
                changed = True
            if payload.displayName and existing.display_name != payload.displayName:
                existing.display_name = payload.displayName
                changed = True
            if changed:
                db.commit()
                db.refresh(existing)
            response.status_code = 200
            response.headers["X-Resource-Existed"] = "true"
            response.headers["X-Message"] = "路径已存在"
            return _to_media_source_model(existing)
        # 新建来源
        src = create_source(db, type_=payload.type.value, root_path=str(p), display_name=payload.displayName)
        if scan_now:
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
        # 幂等：相同 root_url 已存在时返回 200，并跳过扫描
        from app.db.models_extra import MediaSource as _MediaSource
        existing = db.query(_MediaSource).filter(_MediaSource.root_path == root_url.rstrip("/")).first()
        if existing is not None:
            changed = False
            if existing.status != "active":
                existing.status = "active"
                existing.deleted_at = None
                changed = True
            if payload.displayName and existing.display_name != payload.displayName:
                existing.display_name = payload.displayName
                changed = True
            if changed:
                db.commit()
                db.refresh(existing)
            response.status_code = 200
            response.headers["X-Resource-Existed"] = "true"
            response.headers["X-Message"] = "路径已存在"
            return _to_media_source_model(existing)
        # 新建来源
        src = create_source(db, type_=payload.type.value, root_path=root_url, display_name=payload.displayName)
        if scan_now:
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
        # 优先使用 macOS 自带 smbutil（在本地开发更稳定，避免 pysmb 方言协商问题）
        import platform, shutil, subprocess, re
        shares: list[dict] = []
        if platform.system().lower() == 'darwin' and shutil.which('smbutil'):
            if anonymous:
                cmd = ['smbutil', 'view', '-g', '-N', f'//{host}']
            else:
                cmd = ['smbutil', 'view', f'//{username}:{password}@{host}']
            try:
                out = subprocess.check_output(cmd, text=True, timeout=8)
            except subprocess.CalledProcessError as exc:
                raise HTTPException(status_code=500, detail=f"smbutil 失败: {exc}")
            except subprocess.TimeoutExpired:
                raise HTTPException(status_code=504, detail="smbutil 超时")

            for line in out.splitlines():
                # 形如：PublicShare                                     Disk
                m = re.match(r"^([A-Za-z0-9_.$-]+)\s+Disk", line.strip())
                if not m:
                    continue
                name = m.group(1)
                if name.lower() in {'ipc$', 'admin$', 'print$'}:
                    continue
                shares.append({
                    'name': name,
                    'path': f"smb://{host}/{name}",
                    'accessible': True,
                })
            return { 'success': True, 'shares': shares }

        # 回退到 fs.open_fs（Linux/Windows 或无 smbutil 时）
        import fs
        from urllib.parse import quote
        fs_url = f"smb://{quote(username)}:{quote(password)}@{host}" if not anonymous else f"smb://{host}"
        try:
            smb_fs = fs.open_fs(fs_url)
        except Exception as e2:
            raise HTTPException(status_code=404, detail=f"无法连接到SMB服务: {str(e2)}")
        try:
            shares = []
            for share_name in smb_fs.listdir('/'):
                try:
                    if share_name.startswith('.') or share_name.lower() in ['ipc$', 'admin$', 'print$']:
                        continue
                    if smb_fs.isdir(share_name):
                        shares.append({'name': share_name, 'path': f"smb://{host}/{share_name}", 'accessible': True})
                except Exception:
                    continue
            return { 'success': True, 'shares': shares }
        finally:
            try:
                smb_fs.close()
            except Exception:
                pass

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
        import platform, shutil, subprocess, os, tempfile, json
        from pathlib import Path
        # macOS 优先用 mount_smbfs 挂载后遍历
        if platform.system().lower() == 'darwin' and shutil.which('mount_smbfs') and shutil.which('umount'):
            mount_point = tempfile.mkdtemp(prefix='nas_mount_')
            try:
                # 构建凭证 URL：//user:pass@host/share
                auth = '' if anonymous else f"{username}:{password}@"
                url = f"//{auth}{host}/{share}"
                subprocess.check_call(['mount_smbfs', url, mount_point], timeout=8)
                base = Path(mount_point)
                target = base / (path or '')
                if not target.exists() or not target.is_dir():
                    raise HTTPException(status_code=404, detail="路径不存在或不是目录")
                folders = []
                files = []
                for entry in sorted(target.iterdir()):
                    name = entry.name
                    if name.startswith('.'):
                        continue
                    rel = str(Path(path)/name) if path else name
                    if entry.is_dir():
                        folders.append({ 'name': name, 'path': rel })
                    else:
                        ext = name.rsplit('.',1)[-1].lower() if '.' in name else ''
                        if ext in ['jpg','jpeg','png','gif','bmp','webp','mp4','mov','avi','mkv','wmv','flv']:
                            try:
                                size = entry.stat().st_size
                            except Exception:
                                size = 0
                            files.append({ 'name': name, 'path': rel, 'size': size })
                return { 'success': True, 'folders': folders, 'files': files }
            except subprocess.TimeoutExpired:
                raise HTTPException(status_code=504, detail="挂载超时")
            except subprocess.CalledProcessError as exc:
                raise HTTPException(status_code=500, detail=f"挂载失败: {exc}")
            finally:
                try:
                    subprocess.run(['umount', mount_point], timeout=5)
                except Exception:
                    pass
                try:
                    os.rmdir(mount_point)
                except Exception:
                    pass

        # 其他平台回退到 fs.open_fs（可能不支持 SMB2，尽力而为）
        import fs
        from urllib.parse import quote
        fs_url = f"smb://{quote(username)}:{quote(password)}@{host}" if not anonymous else f"smb://{host}"
        try:
            smb_fs = fs.open_fs(fs_url)
        except Exception as e2:
            raise HTTPException(status_code=404, detail=f"无法连接到SMB服务: {str(e2)}")
        try:
            share_fs = smb_fs.opendir(share)
            if path:
                share_fs = share_fs.opendir(path)
            folders = []
            files = []
            for entry in share_fs.scandir('.'):
                name = entry.name
                if name.startswith('.'): continue
                rel = f"{path}/{name}" if path else name
                if entry.is_dir:
                    folders.append({'name': name, 'path': rel})
                else:
                    ext = name.rsplit('.',1)[-1].lower() if '.' in name else ''
                    if ext in ['jpg','jpeg','png','gif','bmp','webp','mp4','mov','avi','mkv','wmv','flv']:
                        try:
                            size = entry.size
                        except Exception:
                            size = 0
                        files.append({'name': name, 'path': rel, 'size': size})
            return { 'success': True, 'folders': sorted(folders, key=lambda x: x['name'].lower()), 'files': sorted(files, key=lambda x: x['name'].lower()) }
        finally:
            try:
                share_fs.close()
            except Exception:
                pass
            try:
                smb_fs.close()
            except Exception:
                pass

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
