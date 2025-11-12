from __future__ import annotations

import os
from datetime import timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_

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


def _normalize_host_input(host: str) -> str:
    """将前端传入的 host 规范化为纯主机/IP 字符串。

    兼容以下异常形式：
    - "('10.0.0.1', None)"（错误传入的元组字符串）→ "10.0.0.1"
    - "('nas.local', 445)" → "nas.local"
    - "10.0.0.1:445" → "10.0.0.1"
    - "[fe80::1]" → "fe80::1"
    - 带多余引号/空白 → 去除
    """
    s = str(host).strip()
    # 去掉包裹引号
    if (s.startswith("'") and s.endswith("'")) or (s.startswith('"') and s.endswith('"')):
        s = s[1:-1].strip()
    # 处理形如 "('10.0.0.1', None)" 的字符串
    if s.startswith("(") and s.endswith(")"):
        import ast
        try:
            tup = ast.literal_eval(s)
            if isinstance(tup, (list, tuple)) and len(tup) >= 1:
                s = str(tup[0]).strip()
        except Exception:
            pass
    # IPv6 方括号
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1]
    # host:port（排除 IPv6）
    if ":" in s and s.count(":") == 1:
        host_part, port_part = s.split(":", 1)
        if port_part.isdigit():
            s = host_part
    return s


def _bootstrap_source_scan(root_path: str, *, limit: int = 50) -> None:
    """新增来源后，立即首批导入最多 limit 条，随后后台继续全量扫描。"""
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
        # 使用 smbprotocol 直连验证，避免 SMB1 方言问题
        if not req.host or not req.share:
            raise HTTPException(status_code=422, detail="host/share required")
        host = _normalize_host_input(req.host)
        username = (req.username or "") if not req.anonymous else ""
        password = (req.password or "") if not req.anonymous else ""
        try:
            from app.services.fs_providers import parse_smb_url
            from smbprotocol.connection import Connection
            from smbprotocol.session import Session
            from smbprotocol.tree import TreeConnect
            from smbprotocol.open import Open, CreateDisposition, CreateOptions, ShareAccess, FilePipePrinterAccessMask, ImpersonationLevel
            from smbprotocol.file_info import FileInformationClass
            import uuid

            # 建链
            conn = Connection(uuid.uuid4(), host, 445)
            conn.connect()
            sess = Session(conn, username=username, password=password)
            sess.connect()
            tree = TreeConnect(sess, f"\\\\{host}\\{req.share}")
            tree.connect()

            # 打开验证目录
            sub = (req.subPath or "").strip("/\\")
            dir_path = sub.replace('/', '\\') if sub else ""
            h = Open(tree, dir_path)
            h.create(
                ImpersonationLevel.Impersonation,
                FilePipePrinterAccessMask.GENERIC_READ,
                0,
                ShareAccess.FILE_SHARE_READ,
                CreateDisposition.FILE_OPEN,
                CreateOptions.FILE_DIRECTORY_FILE,
            )

            # BFS 遍历少量样本，限制深度与数量
            from collections import deque
            q = deque([""])
            total = 0
            samples: list[str] = []
            max_dirs = 50
            max_files = 2000
            visited = 0
            while q and visited < max_dirs and total < max_files and len(samples) < 10:
                rel = q.popleft()
                visited += 1
                cur = Open(tree, (dir_path + ('\\' if dir_path and rel else '') + rel) if rel else dir_path)
                cur.create(
                    ImpersonationLevel.Impersonation,
                    FilePipePrinterAccessMask.GENERIC_READ,
                    0,
                    ShareAccess.FILE_SHARE_READ,
                    CreateDisposition.FILE_OPEN,
                    CreateOptions.FILE_DIRECTORY_FILE,
                )
                try:
                    entries = cur.query_directory('*', FileInformationClass.FILE_DIRECTORY_INFORMATION)
                    for e in entries:
                        raw = e['file_name']
                        # BytesField pretty string like '30 00 31 00 ...'; use .get_value() to get bytes
                        if hasattr(raw, 'get_value'):
                            b = raw.get_value()
                            try:
                                name = b.decode('utf-16-le').rstrip('\x00')
                            except Exception:
                                name = ''.join(chr(x) for x in b if x > 0)
                        else:
                            name = str(raw)
                        if name in ('.', '..'):
                            continue
                        attrs_field = e['file_attributes']
                        attrs_val = int(getattr(attrs_field, 'value', attrs_field))
                        is_dir = bool(attrs_val & 0x10)
                        child_rel = name if not rel else rel + '/' + name
                        if is_dir:
                            if len(q) < max_dirs:
                                q.append(child_rel)
                        else:
                            if Path(name).suffix.lower() in exts:
                                total += 1
                                if len(samples) < 10:
                                    samples.append(f"smb://{host}/{req.share}/" + (sub + '/' if sub else '') + child_rel)
                            else:
                                total += 1  # 统计到非媒体文件也计数，用于规模估计
                            if total >= max_files:
                                break
                finally:
                    cur.close()

            # 关闭连接
            h.close(); tree.disconnect(); sess.disconnect(); conn.disconnect(True)

            return SourceValidateResponse(
                ok=True,
                readable=True,
                absPath=f"smb://{host}/{req.share}/" + sub,
                estimatedCount=total,
                samples=samples,
                note="只读验证通过，不会写入或删除此目录下文件",
            )
        except HTTPException:
            raise
        except Exception as exc:
            msg = str(exc)
            if 'STATUS_LOGON_FAILURE' in msg or 'Authentication' in msg or 'access' in msg.lower():
                raise HTTPException(status_code=403, detail="认证失败，请检查用户名和密码")
            if 'timed out' in msg or 'No route to host' in msg or 'not known' in msg or 'unreachable' in msg:
                raise HTTPException(status_code=404, detail="无法连接到设备，请检查地址")
            raise HTTPException(status_code=500, detail=f"连接失败：{msg}")
    else:
        raise HTTPException(status_code=422, detail="未知来源类型")


@router.post("/setup/source", response_model=MediaSourceModel, status_code=201)
def create_media_source(
    payload: SourceCreateRequest,
    request: Request,
    response: Response,
    background: BackgroundTasks = None,
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
        # --- 路径重叠检测：若已存在父路径或子路径，阻止重复配置 ---
        from app.db.models_extra import MediaSource as _MediaSource
        new_path = str(p)
        rows = (
            db.query(_MediaSource)
            .filter(or_(_MediaSource.status.is_(None), _MediaSource.status == "active"))
            .filter(_MediaSource.type == "local")
            .all()
        )
        def _is_parent(parent: str, child: str) -> bool:
            if parent == child:
                return False
            parent = parent.rstrip("/\\") + os.sep
            return child.startswith(parent)
        # 已有父路径 → 拒绝添加子路径
        for r in rows:
            if _is_parent(r.root_path, new_path):
                raise HTTPException(status_code=409, detail={"code": "overlap_parent", "parent": r.root_path})
        # 新路径是父路径 → 告知已有子路径
        children = [r.root_path for r in rows if _is_parent(new_path, r.root_path)]
        if children:
            raise HTTPException(status_code=409, detail={"code": "overlap_children", "children": children})
        # 幂等：相同 rootPath 已存在时返回 200，并跳过扫描
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
            # HTTP 头需为 latin-1，可使用 ASCII 提示，中文放到返回体里会更安全
            response.headers["X-Message"] = "exists"
            return _to_media_source_model(existing)
        # 新建来源
        src = create_source(db, type_=payload.type.value, root_path=str(p), display_name=payload.displayName)
        if scan_now:
            _bootstrap_source_scan(src.root_path)
            _ensure_background_scan(request, src.root_path)
            try:
                if background is not None:
                    start_scan_job(src.id, src.root_path, background)
            except Exception:
                pass
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
        # --- 路径重叠检测（SMB）：同 host/share 下的父子路径不允许重复配置 ---
        from app.db.models_extra import MediaSource as _MediaSource
        from app.services.fs_providers import parse_smb_url
        def _split(url: str):
            try:
                p = parse_smb_url(url)
                return (p.host.lower(), p.share.lower(), (p.path or '').strip('/'))
            except Exception:
                return ("", "", "")
        new_host, new_share, new_sub = _split(root_url)
        rows = (
            db.query(_MediaSource)
            .filter(or_(_MediaSource.status.is_(None), _MediaSource.status == "active"))
            .filter(_MediaSource.type == "smb")
            .all()
        )
        def _is_parent_sub(parent_sub: str, child_sub: str) -> bool:
            if parent_sub == child_sub:
                return False
            if parent_sub == "":
                return True  # 共享根 是 任意子路径 的父
            parent = parent_sub.rstrip('/') + '/'
            return child_sub.startswith(parent)
        # 已有父路径
        for r in rows:
            h, s, subp = _split(r.root_path)
            if h == new_host and s == new_share and _is_parent_sub(subp, new_sub):
                raise HTTPException(status_code=409, detail={"code": "overlap_parent", "parent": r.root_path})
        # 新路径为父
        children = []
        for r in rows:
            h, s, subp = _split(r.root_path)
            if h == new_host and s == new_share and _is_parent_sub(new_sub, subp):
                children.append(r.root_path)
        if children:
            raise HTTPException(status_code=409, detail={"code": "overlap_children", "children": children})
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
            response.headers["X-Message"] = "exists"
            return _to_media_source_model(existing)
        # 新建来源
        src = create_source(db, type_=payload.type.value, root_path=root_url, display_name=payload.displayName)
        if scan_now:
            _bootstrap_source_scan(src.root_path)
            _ensure_background_scan(request, src.root_path)
            try:
                if background is not None:
                    start_scan_job(src.id, src.root_path, background)
            except Exception:
                pass
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
    request: Request,
    hard: bool = Query(False, description="是否立即彻底删除"),
    db: Session = Depends(get_db),
):
    ok = delete_source(db, source_id, hard=hard)
    if not ok:
        raise HTTPException(status_code=404, detail="not found")
    # 删除后刷新自动扫描服务，立刻停掉对应 worker
    try:
        service = ensure_auto_scan_service(request.app)
        service.refresh()
    except Exception:
        # 刷新失败不影响删除的返回
        pass
    return None


@router.post("/media-sources/{source_id}/restore", response_model=MediaSourceModel)
def restore_media_source(source_id: int, request: Request, db: Session = Depends(get_db)):
    src = restore_source(db, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="not found")
    try:
        service = ensure_auto_scan_service(request.app)
        service.refresh()
    except Exception:
        pass
    return _to_media_source_model(src)


@router.post("/scan/start", response_model=ScanStartResponse, status_code=202)
def start_scan(source_id: int = Query(..., description="来源ID"), background: BackgroundTasks = None, db: Session = Depends(get_db)):
    src = get_source(db, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="source not found")
    if src.status and src.status != "active":
        raise HTTPException(status_code=409, detail="source inactive")
    # 若为 SMB，将 host 规范化写回一次（兼容历史脏数据）
    if src.type == 'smb' and isinstance(src.root_path, str) and src.root_path.startswith('smb://'):
        try:
            from app.services.fs_providers import parse_smb_url
            p = parse_smb_url(src.root_path)
            clean_host = _normalize_host_input(p.host)
            if clean_host != p.host:
                # 重建 root_path
                base = f"smb://{clean_host}/{p.share}"
                sub = (p.path or '').strip('/')
                new_url = base + (f"/{sub}" if sub else '')
                from app.db.models_extra import MediaSource as _MediaSource
                row = db.query(_MediaSource).filter(_MediaSource.id == src.id).first()
                if row and row.root_path != new_url:
                    row.root_path = new_url
                    db.commit()
                    db.refresh(row)
                    src = row
        except Exception:
            pass
    job_id = start_scan_job(src.id, src.root_path, background)
    return ScanStartResponse(jobId=job_id)


@router.post("/network/discover")
def discover_network_shares(request: dict):
    """
    发现网络设备的SMB共享
    输入: {host, username?, password?, anonymous: bool}
    输出: {success: bool, shares: [{name, path, accessible}], error?: string}
    """
    host = _normalize_host_input(request.get("host"))
    if not host:
        raise HTTPException(status_code=422, detail="host required")

    username = request.get("username")
    password = request.get("password")
    anonymous = request.get("anonymous", False)

    # 验证认证参数
    if not anonymous and not (username and password):
        raise HTTPException(status_code=422, detail="anonymous 或用户名密码其一必填")

    try:
        from smbprotocol.connection import Connection
        from smbprotocol.session import Session
        from smbprotocol.tree import TreeConnect
        import uuid

        # 建立连接
        conn = Connection(uuid.uuid4(), host, 445)
        conn.connect()
        sess = Session(conn, username=username or "", password=password or "")
        sess.connect()

        # 常见共享名称列表
        common_shares = [
            'PublicShare', 'Public', 'Users', 'Share', 'Shared', 'Files',
            'Data', 'Media', 'Documents', 'Downloads', 'home', 'shared',
            'scans', 'backup', 'temp', 'www', 'ftp', 'smb', 'smbshare',
            'guest', 'anonymous', 'upload', 'incoming', 'outgoing'
        ]
        shares = []

        # 尝试连接共享名称来测试可访问性
        for share_name in common_shares:
            try:
                test_tree = TreeConnect(sess, f"\\\\{host}\\{share_name}")
                test_tree.connect()
                test_tree.disconnect()
                shares.append({
                    'name': share_name,
                    'path': f"smb://{host}/{share_name}",
                    'accessible': True
                })
            except Exception:
                continue

        # 尝试数字编号的共享
        for i in range(1, 11):
            share_name = f"share{i}"
            try:
                test_tree = TreeConnect(sess, f"\\\\{host}\\{share_name}")
                test_tree.connect()
                test_tree.disconnect()
                shares.append({
                    'name': share_name,
                    'path': f"smb://{host}/{share_name}",
                    'accessible': True
                })
            except Exception:
                continue

        # 关闭连接
        sess.disconnect()
        conn.disconnect(True)

        return { 'success': True, 'shares': shares }

    except Exception as e:
        error_msg = str(e)
        if "Connection refused" in error_msg or "No route to host" in error_msg:
            raise HTTPException(status_code=404, detail="无法连接到设备，请检查IP地址")
        elif "STATUS_LOGON_FAILURE" in error_msg or "Authentication" in error_msg or "access" in error_msg.lower():
            raise HTTPException(status_code=403, detail="认证失败，请检查用户名和密码")
        else:
            raise HTTPException(status_code=500, detail=f"连接失败: {error_msg}")


@router.post("/network/browse")
def browse_network_folder(request: dict):
    """
    浏览 SMB 共享目录内容（不挂载）
    输入: {host, share, path, username?, password?, anonymous: bool}
    输出: {success: bool, folders: [{name, path}], files: [{name, path, size}], error?: string}
    """
    host = _normalize_host_input(request.get("host"))
    share = request.get("share")
    path = (request.get("path") or "").strip("/\\")
    if not host or not share:
        raise HTTPException(status_code=422, detail="host and share required")

    username = (request.get("username") or "") if not request.get("anonymous", False) else ""
    password = (request.get("password") or "") if not request.get("anonymous", False) else ""

    try:
        # smbprotocol 直连，避免 mount_smbfs
        from smbprotocol.connection import Connection
        from smbprotocol.session import Session
        from smbprotocol.tree import TreeConnect
        from smbprotocol.open import Open, CreateDisposition, CreateOptions, ShareAccess, FilePipePrinterAccessMask, ImpersonationLevel
        from smbprotocol.file_info import FileInformationClass
        import uuid

        conn = Connection(uuid.uuid4(), host, 445)
        conn.connect()
        sess = Session(conn, username=username, password=password)
        sess.connect()
        tree = TreeConnect(sess, f"\\\\{host}\\{share}")
        tree.connect()

        # 打开目标目录
        dir_path = path.replace('/', '\\') if path else ""
        h = Open(tree, dir_path)
        h.create(ImpersonationLevel.Impersonation, FilePipePrinterAccessMask.GENERIC_READ, 0, ShareAccess.FILE_SHARE_READ, CreateDisposition.FILE_OPEN, CreateOptions.FILE_DIRECTORY_FILE)

        entries = h.query_directory('*', FileInformationClass.FILE_DIRECTORY_INFORMATION)
        image_exts = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
        video_exts = {".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv"}
        folders, files = [], []
        for e in entries:
            raw = e['file_name']
            b = raw.get_value() if hasattr(raw, 'get_value') else (raw if isinstance(raw, (bytes, bytearray)) else None)
            name = (b.decode('utf-16-le').rstrip('\x00') if isinstance(b, (bytes, bytearray)) else str(raw))
            if name in ('.', '..') or name.startswith('.'):
                continue
            attrs_field = e['file_attributes']
            attrs_val = int(getattr(attrs_field, 'value', attrs_field))
            is_dir = bool(attrs_val & 0x10)
            rel = f"{path}/{name}" if path else name
            if is_dir:
                folders.append({ 'name': name, 'path': rel })
            else:
                ext = ('.' + name.rsplit('.',1)[-1].lower()) if '.' in name else ''
                if ext in image_exts | video_exts:
                    size = int(getattr(e, 'end_of_file', 0) or 0)
                    files.append({ 'name': name, 'path': rel, 'size': size })

        # 关闭连接
        h.close(); tree.disconnect(); sess.disconnect(); conn.disconnect(True)

        folders.sort(key=lambda x: x['name'].lower())
        files.sort(key=lambda x: x['name'].lower())
        return { 'success': True, 'folders': folders, 'files': files }

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
