from __future__ import annotations

import os
import subprocess
import shutil
from datetime import timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db import SessionLocal
from app.schemas.sources import (
    SourceCredentialFieldModel,
    MediaSourceModel,
    SourceProviderCapabilityModel,
    ScanStrategy,
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
    activate_source,
    create_source,
    delete_source,
    get_source,
    list_sources,
    pause_source,
    restore_source,
    store_source_credentials,
)
from app.services.fs_providers import get_provider_by_name, list_provider_capabilities
from app.services.auto_scan_service import ensure_auto_scan_service
from app.services.asset_warmup import warmup_assets_for_source
from app.services.clip_warmup import warmup_missing_clip_embeddings
from app.db import create_database_and_tables


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


def _normalize_host_input(host: str | None) -> str:
    """将前端传入的 host 规范化为纯主机/IP 字符串。

    兼容以下异常形式：
    - "('10.0.0.1', None)"（错误传入的元组字符串）→ "10.0.0.1"
    - "('nas.local', 445)" → "nas.local"
    - "10.0.0.1:445" → "10.0.0.1"
    - "[fe80::1]" → "fe80::1"
    - "smb://host/share"、"\\\\host\\share" → "host"
    - 带多余引号/空白 → 去除
    """
    from urllib.parse import urlparse

    if host is None:
        return ""

    s = str(host).strip()
    if not s:
        return ""
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
    lowered = s.lower()
    if '://' in lowered:
        try:
            parsed = urlparse(s)
        except Exception:
            parsed = None
        if parsed and parsed.scheme:
            if parsed.hostname:
                s = parsed.hostname
            elif parsed.netloc:
                s = parsed.netloc
            else:
                s = s.split('://', 1)[-1]
    elif s.startswith('\\\\'):
        s = s[2:]
    elif s.startswith('//'):
        s = s[2:]
    # 去掉路径/共享部分
    for sep in ('/', '\\'):
        if sep in s:
            s = s.split(sep, 1)[0]
    # IPv6 方括号 + 端口
    if s.startswith('['):
        closing = s.find(']')
        if closing != -1:
            inner = s[1:closing]
            remainder = s[closing + 1:]
            if remainder.startswith(':') and remainder[1:].isdigit():
                s = inner
            elif not remainder:
                s = inner
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1]
    # host:port（排除 IPv6）
    if ":" in s and s.count(":") == 1:
        host_part, port_part = s.split(":", 1)
        if port_part.isdigit():
            s = host_part
    return s


def _discover_shares_via_smbclient(host: str, *, username: str | None, password: str | None, anonymous: bool):
    """使用 smbclient 枚举共享，尽量对齐桌面/手机体验。

    返回 (shares: list[str], err: str | None)。err 仅在需中断时返回，其余错误交由上层回退探测。
    """
    if not shutil.which("smbclient"):
        return [], None

    cmd = [
        "smbclient",
        "-L",
        f"//{host}",
        "-m",
        "SMB3",
        "--option",
        "client min protocol=SMB2",
        "--option",
        "client max protocol=SMB3",
        "-g",  # 机器可解析输出
    ]
    if anonymous:
        cmd.append("-N")
    else:
        user_field = username or ""
        pwd_field = password or ""
        cmd.extend(["-U", f"{user_field}%{pwd_field}"])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=6)
    except subprocess.TimeoutExpired:
        return [], "smbclient 列举超时"
    except FileNotFoundError:
        return [], None
    except Exception as exc:  # pragma: no cover - 环境异常
        return [], str(exc)

    stderr = (result.stderr or "").lower()
    if "logon failure" in stderr or "nt_status_logon_failure" in stderr:
        return [], "auth_failed"
    if "bad network name" in stderr:
        # 主机在线但无共享/名称错，继续走回退逻辑
        return [], None
    if "host is down" in stderr or "no route" in stderr or "could not resolve" in stderr:
        return [], "unreachable"

    shares: list[str] = []
    if result.returncode == 0 and result.stdout:
        for line in result.stdout.splitlines():
            parts = line.split("|")
            if len(parts) >= 2 and parts[0] == "Disk":
                name = parts[1].strip()
                if name and name not in shares:
                    shares.append(name)
    return shares, None


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
    source_type_value = (getattr(src, "source_type", None) or getattr(src, "type", None) or "local").lower()
    try:
        source_type_enum = SourceType(source_type_value)
    except ValueError:
        source_type_enum = SourceType.LOCAL
    raw_strategy = getattr(src, "scan_strategy", None)
    fallback_strategy = "realtime" if source_type_enum == SourceType.LOCAL else "scheduled"
    try:
        strategy_enum = ScanStrategy(raw_strategy or fallback_strategy)
    except ValueError:
        strategy_enum = ScanStrategy.REALTIME if source_type_enum == SourceType.LOCAL else ScanStrategy.SCHEDULED
    return MediaSourceModel(
        id=src.id,
        type=source_type_enum,
        sourceType=source_type_enum,
        displayName=src.display_name,
        rootPath=src.root_path,
        createdAt=_iso(src.created_at),
        status=status_enum,
        deletedAt=_iso(src.deleted_at),
        lastScanAt=_iso(src.last_scan_at),
        scanStrategy=strategy_enum,
        scanIntervalSeconds=getattr(src, "scan_interval_seconds", None),
        lastScanStartedAt=_iso(getattr(src, "last_scan_started_at", None)),
        lastScanFinishedAt=_iso(getattr(src, "last_scan_finished_at", None)),
        lastError=getattr(src, "last_error", None),
        failureCount=int(getattr(src, "failure_count", 0) or 0),
    )


def _get_provider_for_type(source_type: SourceType):
    try:
        return get_provider_by_name(source_type.value)
    except LookupError:
        raise HTTPException(status_code=422, detail="未知来源类型")


def _validate_with_provider(req: SourceValidateRequest) -> SourceValidateResponse:
    provider = _get_provider_for_type(req.type)
    validate_fn = getattr(provider, "validate", None)
    if not callable(validate_fn):
        raise HTTPException(status_code=422, detail="该来源类型暂不支持验证")
    return validate_fn(req)


def _capability_to_model(data: dict) -> SourceProviderCapabilityModel:
    fields = []
    for field in data.get("credential_fields", []):
        if not field:
            continue
        fields.append(
            SourceCredentialFieldModel(
                key=field.get("key"),
                label=field.get("label") or field.get("key"),
                required=bool(field.get("required", False)),
                secret=bool(field.get("secret", False)),
                description=field.get("description"),
            )
        )
    return SourceProviderCapabilityModel(
        name=data.get("name"),
        displayName=data.get("display_name") or data.get("name"),
        protocols=[str(p) for p in data.get("protocols", [])],
        requiresCredentials=bool(data.get("requires_credentials", False)),
        supportsAnonymous=bool(data.get("supports_anonymous", False)),
        canValidate=bool(data.get("can_validate", False)),
        credentialFields=fields,
        metadata=data.get("metadata", {}),
    )


def _store_credentials_from_request(payload: SourceCreateRequest, overrides: dict | None = None) -> None:
    data = payload.dict(exclude_unset=True)
    data["type"] = payload.type.value
    if overrides:
        data.update(overrides)
    store_source_credentials(payload.type.value, data)


@router.post("/setup/source/validate", response_model=SourceValidateResponse)
def validate_source(req: SourceValidateRequest):
    return _validate_with_provider(req)


@router.get("/sources/providers", response_model=List[SourceProviderCapabilityModel])
def list_source_providers():
    infos = list_provider_capabilities()
    return [_capability_to_model(info) for info in infos]


@router.post("/sources/providers/probe", response_model=SourceValidateResponse)
def probe_source_provider(req: SourceValidateRequest):
    return _validate_with_provider(req)


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
    if payload.scanIntervalSeconds is not None and payload.scanIntervalSeconds <= 0:
        raise HTTPException(status_code=422, detail="scanIntervalSeconds 必须为正整数")
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
            .filter(
                (_MediaSource.source_type == "local")
                | (_MediaSource.source_type.is_(None) & (_MediaSource.type == "local"))
            )
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
        src = create_source(
            db,
            type_=payload.type.value,
            root_path=str(p),
            display_name=payload.displayName,
            scan_strategy=payload.scanStrategy.value if payload.scanStrategy else None,
            scan_interval_seconds=payload.scanIntervalSeconds,
        )
        if scan_now:
            _bootstrap_source_scan(src.root_path)
            _ensure_background_scan(request, src.root_path)
            try:
                if background is not None:
                    start_scan_job(src.id, src.root_path, background)
                    # 新来源建好并启动扫描后，在后台为该来源预热缩略图/元数据任务。
                    background.add_task(warmup_assets_for_source, src.id)
                    # 同时触发一次 CLIP/SigLIP 向量的增量构建（仅补缺）。
                    background.add_task(warmup_missing_clip_embeddings)
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
        clean_host = _normalize_host_input(payload.host)
        # 组装根 URL：smb://[domain;]user@host/share/sub
        user_part = ""
        if payload.username:
            if payload.domain:
                user_part = f"{payload.domain};{payload.username}@"
            else:
                user_part = f"{payload.username}@"
        sub = (payload.subPath or "").strip("/")
        root_url = f"smb://{user_part}{clean_host}/{payload.share}"
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
            .filter(
                (_MediaSource.source_type == "smb")
                | (_MediaSource.source_type.is_(None) & (_MediaSource.type == "smb"))
            )
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
            _store_credentials_from_request(payload, {"host": clean_host})
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
        _store_credentials_from_request(payload, {"host": clean_host})
        src = create_source(
            db,
            type_=payload.type.value,
            root_path=root_url,
            display_name=payload.displayName,
            scan_strategy=payload.scanStrategy.value if payload.scanStrategy else None,
            scan_interval_seconds=payload.scanIntervalSeconds,
        )
        if scan_now:
            _bootstrap_source_scan(src.root_path)
            _ensure_background_scan(request, src.root_path)
            try:
                if background is not None:
                    start_scan_job(src.id, src.root_path, background)
                    background.add_task(warmup_assets_for_source, src.id)
                    background.add_task(warmup_missing_clip_embeddings)
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


@router.post("/media-sources/{source_id}/activate", response_model=MediaSourceModel)
def activate_media_source(source_id: int, request: Request, db: Session = Depends(get_db)):
    src = activate_source(db, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="not found")
    try:
        service = ensure_auto_scan_service(request.app)
        service.refresh()
    except Exception:
        pass
    return _to_media_source_model(src)


@router.post("/media-sources/{source_id}/pause", response_model=MediaSourceModel)
def pause_media_source(source_id: int, request: Request, db: Session = Depends(get_db)):
    src = pause_source(db, source_id)
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
    source_type_value = getattr(src, "source_type", None) or src.type
    if source_type_value == 'smb' and isinstance(src.root_path, str) and src.root_path.startswith('smb://'):
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
    输入: {host, username?, password?, anonymous: bool, shareHints?: list[str]}
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

    normalized_host = _normalize_host_input(request.get("host"))
    if not normalized_host:
        raise HTTPException(status_code=422, detail="host required")

    username = request.get("username")
    password = request.get("password")
    anonymous = request.get("anonymous", False)

    # 验证认证参数
    if not anonymous and not (username and password):
        raise HTTPException(status_code=422, detail="anonymous 或用户名密码其一必填")

    # 先尝试 smbclient，体验和手机/桌面一致
    shares = []
    cli_shares, cli_err = _discover_shares_via_smbclient(
        normalized_host,
        username=username,
        password=password,
        anonymous=anonymous,
    )
    shares.extend(cli_shares)
    if cli_err == "auth_failed":
        raise HTTPException(status_code=403, detail="认证失败，请检查用户名和密码")
    if cli_err == "unreachable":
        raise HTTPException(status_code=404, detail="无法连接到设备，请检查IP地址")

    try:
        from smbprotocol.connection import Connection
        from smbprotocol.session import Session
        from smbprotocol.tree import TreeConnect
        import uuid

        # 建立连接
        conn = Connection(uuid.uuid4(), normalized_host, 445)
        conn.connect()
        sess = Session(conn, username=username or "", password=password or "")
        sess.connect()

        # 常见共享名称列表（加入动态候选）
        common_shares = [
            'PublicShare', 'Public', 'Users', 'Share', 'Shared', 'Files',
            'Data', 'Media', 'Documents', 'Downloads', 'home', 'shared',
            'scans', 'backup', 'temp', 'www', 'ftp', 'smb', 'smbshare',
            'guest', 'anonymous', 'upload', 'incoming', 'outgoing'
        ]

        share_hints = request.get("shareHints") or []
        if isinstance(share_hints, str):
            share_hints = [share_hints]

        candidate_shares: list[str] = []

        def _add_candidate(name: str | None):
            if not name:
                return
            cleaned = str(name).strip().strip('/\\')
            if not cleaned:
                return
            if cleaned not in candidate_shares:
                candidate_shares.append(cleaned)

        for name in common_shares:
            _add_candidate(name)

        for hint in share_hints:
            _add_candidate(hint)

        if username:
            variants = {username, username.lower(), username.upper(), username.capitalize(), f"{username}$"}
            for v in variants:
                _add_candidate(v)

        for i in range(1, 11):
            _add_candidate(f"share{i}")

        shares = shares or []

        # 尝试连接共享名称来测试可访问性
        for share_name in candidate_shares:
            try:
                if any(existing['name'] == share_name for existing in shares):
                    continue
                test_tree = TreeConnect(sess, f"\\\\{normalized_host}\\{share_name}")
                test_tree.connect()
                test_tree.disconnect()
                shares.append({
                    'name': share_name,
                    'path': f"smb://{normalized_host}/{share_name}",
                    'accessible': True
                })
            except Exception:
                continue

        # 尝试数字编号的共享

        # 关闭连接
        sess.disconnect()
        conn.disconnect(True)

        shares.sort(key=lambda x: x['name'].lower())
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
