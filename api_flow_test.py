"""
API 流程测试脚本（局域网无用户版）
================================================
- 覆盖媒体根设置、来源校验/扫描、分页、缩略图、标签增删、Range、删除（单删/批删）。
- 直接通过 HTTP 调用已运行的服务，不尝试进程内或直连数据库。
- 默认会重置后端数据库并重新扫描 `sample_media/`，可通过环境变量跳过。

运行方式：
    uv run python api_flow_test.py

主要环境变量：
    - API_BASE_URL         默认 http://127.0.0.1:8000
    - TEST_VERBOSE         设为 "0" 可静默
    - TEST_SKIP_RESET      设为 "1" 时跳过 POST /settings/reset-initialization
    - TEST_SKIP_BOOTSTRAP  设为 "1" 时跳过媒体根/来源扫描，仅做接口验证
    - TEST_SAMPLE_DIR      覆盖示例媒体目录（默认 repo 根的 sample_media/）
    - TEST_SCAN_TIMEOUT    扫描等待秒数（默认 120）
    - TEST_SCAN_POLL       扫描状态轮询间隔（默认 0.5 秒）
"""

from __future__ import annotations

import json
import os
import random
import string
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib import error, parse, request

BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")
VERBOSE = os.environ.get("TEST_VERBOSE", "1") != "0"
SKIP_RESET = os.environ.get("TEST_SKIP_RESET", "0") == "1"
SKIP_BOOTSTRAP = os.environ.get("TEST_SKIP_BOOTSTRAP", "0") == "1"
SCAN_TIMEOUT = int(os.environ.get("TEST_SCAN_TIMEOUT", "120"))
SCAN_POLL_INTERVAL = float(os.environ.get("TEST_SCAN_POLL", "0.5"))
SAMPLE_DIR = Path(
    os.environ.get("TEST_SAMPLE_DIR") or (Path(__file__).resolve().parent / "sample_media")
).expanduser().resolve()


# ---------------------------------------------------------------------------
# 通用 HTTP 工具
# ---------------------------------------------------------------------------

def _get_lan_ip() -> str:
    import socket

    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
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


def _probe_health(base: str, timeout: float = 1.5) -> bool:
    try:
        url = f"{base}/health"
        req = request.Request(url=url, method="GET", headers={"Accept": "application/json"})
        with request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.getcode() < 300
    except Exception:
        return False


def _select_base_url(initial: str) -> str:
    env = os.environ.get("API_BASE_URL")
    if env:
        return env.rstrip("/")
    candidates = [
        initial.rstrip("/"),
        "http://localhost:8000",
        f"http://{_get_lan_ip()}:8000",
    ]
    for base in candidates:
        if _probe_health(base):
            return base
    return initial.rstrip("/")


def build_url(path: str, query: Optional[Dict[str, Any]] = None) -> str:
    if query:
        return f"{BASE_URL}{path}?{parse.urlencode(query)}"
    return f"{BASE_URL}{path}"


def log_request(title: str, method: str, path: str, query: Optional[Dict[str, Any]] = None, body: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> None:
    if not VERBOSE:
        return
    print("\n=== REQUEST:")
    print(f"- Title   : {title}")
    print(f"- Method  : {method}")
    print(f"- Path    : {path}")
    if query:
        print(f"- Query   : {json.dumps(query, ensure_ascii=False)}")
    if body is not None:
        print(f"- JSON    : {json.dumps(body, ensure_ascii=False)}")
    if headers:
        print(f"- Headers : {headers}")


def log_response(resp, body_bytes: bytes) -> None:
    if not VERBOSE:
        return
    print("=== RESPONSE:")
    status = getattr(resp, "status", getattr(resp, "code", None)) or resp.getcode()
    print(f"- Status  : {status}")
    ctype = resp.headers.get("Content-Type", "") if hasattr(resp, "headers") else ""
    print(f"- Headers : Content-Type={ctype}")
    try:
        text = body_bytes.decode("utf-8")
        obj = json.loads(text)
        print("- JSON    :")
        print(json.dumps(obj, ensure_ascii=False, indent=2))
    except Exception:
        print(f"- Bytes   : length={len(body_bytes)}")


def http_call(
    title: str,
    method: str,
    path: str,
    query: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    allow_error: bool = False,
):
    log_request(title, method, path, query, json_body, headers)
    url = build_url(path, query)
    data = None
    hdrs = {"Accept": "application/json"}
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    if headers:
        hdrs.update(headers)
    req = request.Request(url=url, method=method, data=data, headers=hdrs)
    try:
        with request.urlopen(req, timeout=30) as resp:
            body = resp.read() if method.upper() != "HEAD" else b""
            log_response(resp, body)
            return resp, body
    except error.HTTPError as e:
        body = e.read()
        if VERBOSE:
            print("=== RESPONSE (HTTPError):")
            print(f"- Status  : {e.code}")
            print(f"- Reason  : {e.reason}")
            print(f"- Body    : {body.decode('utf-8', errors='ignore')}")
        if allow_error:
            e.headers = getattr(e, "headers", {})
            return e, body
        raise


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def header_contains(resp, key: str, substr: str) -> bool:
    val = resp.headers.get(key) if hasattr(resp, "headers") else None
    if val is None:
        return False
    return substr.lower() in str(val).lower()


def _status_code(resp) -> int:
    return int(getattr(resp, "status", getattr(resp, "code", None)) or resp.getcode())


def _decode_json(body: bytes) -> Any:
    return json.loads(body.decode("utf-8"))


def _random_seed(length: int = 16) -> str:
    alphabet = string.ascii_lowercase + string.digits
    rand = "".join(random.choice(alphabet) for _ in range(length))
    return f"seed-{int(time.time())}-{rand}"


def _normalize_local_path(candidate: str) -> str:
    try:
        return str(Path(candidate).expanduser().resolve())
    except Exception:
        return candidate


def fetch_init_status(skip_auto_restore: bool = False) -> Dict[str, Any]:
    query = {"skip_auto_restore": "true"} if skip_auto_restore else None
    _, body = http_call(
        title="Initialization Status",
        method="GET",
        path="/init-status",
        query=query,
    )
    return _decode_json(body)


def ensure_init_state(
    expected_state: str,
    *,
    skip_auto_restore: bool = False,
    media_root: Optional[Path] = None,
) -> Dict[str, Any]:
    status = fetch_init_status(skip_auto_restore=skip_auto_restore)
    actual_state = str(status.get("state", "")).lower()
    assert_true(actual_state == expected_state, f"init-status 应为 {expected_state}，实际 {actual_state}")
    if media_root is not None:
        reported = status.get("media_root_path")
        assert_true(reported is not None, "init-status 未返回媒体根路径")
        expected_path = _normalize_local_path(str(media_root))
        assert_true(_normalize_local_path(str(reported)) == expected_path, "媒体根路径与期望不符")
    return status


# ---------------------------------------------------------------------------
# 引导/准备
# ---------------------------------------------------------------------------

def _restore_snapshots_if_available() -> None:
    try:
        import restore_from_snapshots as _rfs

        rc = _rfs.main()
        if VERBOSE:
            print(f"[restore_from_snapshots] exit={rc}")
    except Exception as exc:
        print(f"[restore_from_snapshots] 忽略错误: {exc}")


def reset_backend_state() -> None:
    if SKIP_RESET:
        if VERBOSE:
            print("[reset] 跳过后端重置 (TEST_SKIP_RESET=1)")
        return
    resp, _ = http_call(
        title="Reset Initialization",
        method="POST",
        path="/settings/reset-initialization",
        allow_error=True,
    )
    code = _status_code(resp)
    if code == 404:
        print("[reset] 服务未实现 /settings/reset-initialization，继续后续流程。")
    elif code >= 400:
        raise RuntimeError(f"重置失败: HTTP {code}")
    else:
        if VERBOSE:
            print("[reset] 数据库已清空，可重新初始化。")
        ensure_init_state("idle", skip_auto_restore=True)


def validate_local_source(sample_dir: Path) -> None:
    payload = {"type": "local", "path": str(sample_dir)}
    _, body = http_call(
        title="Validate Local Source",
        method="POST",
        path="/setup/source/validate",
        json_body=payload,
    )
    data = _decode_json(body)
    assert_true(data.get("ok") and data.get("readable"), "本地来源校验失败")
    assert_true(Path(data.get("absPath")).resolve() == sample_dir, "absPath 不匹配示例目录")


def set_media_root(sample_dir: Path) -> None:
    payload = {"path": str(sample_dir)}
    paths = ["/media-root", "/setup/media-root"]
    last_error: Optional[str] = None
    for route in paths:
        resp, body = http_call(
            title="Set Media Root",
            method="POST",
            path=route,
            json_body=payload,
            allow_error=True,
        )
        code = _status_code(resp)
        if 200 <= code < 300:
            data = _decode_json(body)
            assert_true(data.get("success") is True, f"设置媒体根路径失败: {data}")
            return
        last_error = f"HTTP {code}"
        if code in (404, 405):
            continue
    raise RuntimeError(f"设置媒体根路径失败: {last_error}")


def list_media_sources(include_inactive: bool = False) -> list[Dict[str, Any]]:
    query = {"include_inactive": "true" if include_inactive else "false"}
    _, body = http_call(
        title="List Media Sources",
        method="GET",
        path="/media-sources",
        query=query,
    )
    data = _decode_json(body)
    assert_true(isinstance(data, list), "媒体来源返回值不是列表")
    return data


def ensure_media_source(sample_dir: Path) -> Dict[str, Any]:
    normalized = _normalize_local_path(str(sample_dir))
    sources = list_media_sources()
    for src in sources:
        root = _normalize_local_path(src.get("rootPath", ""))
        if root == normalized:
            return src
    payload = {
        "type": "local",
        "rootPath": normalized,
        "displayName": "sample_media",
        "scan": True,
    }
    _, body = http_call(
        title="Create Local Source",
        method="POST",
        path="/setup/source",
        json_body=payload,
    )
    data = _decode_json(body)
    assert_true(data.get("id") is not None, "创建媒体来源失败")
    return data


def check_filesystem_endpoints(sample_dir: Path) -> None:
    _, roots_body = http_call(title="Filesystem Roots", method="GET", path="/filesystem/roots")
    roots = _decode_json(roots_body)
    assert_true(isinstance(roots, list) and len(roots) > 0, "filesystem/roots 应返回非空列表")

    _, list_body = http_call(
        title="Filesystem List",
        method="GET",
        path="/filesystem/list",
        query={"path": str(sample_dir)},
    )
    listing = _decode_json(list_body)
    current_path = _normalize_local_path(listing.get("current_path", ""))
    assert_true(current_path == _normalize_local_path(str(sample_dir)), "filesystem/list 路径不匹配")
    assert_true(isinstance(listing.get("entries"), list), "filesystem/list entries 应为列表")

    _, common_body = http_call(title="Common Folders", method="GET", path="/filesystem/common-folders")
    commons = _decode_json(common_body)
    assert_true(isinstance(commons, list), "filesystem/common-folders 应返回列表")


def check_os_info_and_permissions(sample_dir: Path) -> None:
    _, os_body = http_call(
        title="OS Info",
        method="GET",
        path="/os-info",
        query={"refresh": "true"},
    )
    info = _decode_json(os_body)
    assert_true(isinstance(info.get("os"), str) and info["os"], "os-info 未返回操作系统")
    assert_true(isinstance(info.get("lan_ips"), list), "os-info lan_ips 应为列表")
    assert_true(isinstance(info.get("port"), int), "os-info port 应为整数")

    probe_payload = {
        "paths": [
            str(sample_dir),
            str(sample_dir / "__missing_test_path__"),
        ]
    }
    _, probe_body = http_call(
        title="Permissions Probe",
        method="POST",
        path="/permissions/probe",
        json_body=probe_payload,
    )
    results = _decode_json(probe_body)
    assert_true(len(results) >= 2, "权限探测应返回所有路径结果")
    first_status = str(results[0].get("status", ""))
    assert_true(first_status in {"ok", "denied"}, "权限探测返回异常状态")


def check_scan_progress(sample_dir: Path) -> None:
    _, body = http_call(title="Scan Progress", method="GET", path="/tasks/scan-progress")
    stats = _decode_json(body)
    state = str(stats.get("state", ""))
    assert_true(state in {"no_media_root", "ready", "error"}, f"未知任务状态: {state}")
    if SKIP_BOOTSTRAP:
        return
    assert_true(state == "ready", f"扫描任务应为 ready，当前 {state}")
    reported_path = stats.get("media_root_path")
    assert_true(reported_path, "ready 状态必须返回媒体根路径")
    assert_true(
        _normalize_local_path(str(reported_path)) == _normalize_local_path(str(sample_dir)),
        "scan-progress 媒体根不匹配",
    )


def check_auto_scan_settings() -> None:
    _, status_body = http_call(title="Auto Scan Status", method="GET", path="/settings/auto-scan")
    status = _decode_json(status_body)
    enabled = bool(status.get("enabled"))
    payload: Dict[str, Any] = {"enabled": enabled}
    if enabled:
        payload["scan_mode"] = status.get("scan_mode") or "realtime"
        payload["scan_interval"] = status.get("scan_interval") or "hourly"
    else:
        if status.get("scan_mode"):
            payload["scan_mode"] = status["scan_mode"]
        if status.get("scan_interval"):
            payload["scan_interval"] = status["scan_interval"]
    _, update_body = http_call(
        title="Auto Scan Update",
        method="POST",
        path="/settings/auto-scan",
        json_body=payload,
    )
    updated = _decode_json(update_body)
    assert_true(updated.get("enabled") == enabled, "自动扫描更新后状态不一致")


def exercise_network_endpoints() -> None:
    resp_missing_host, _ = http_call(
        title="Network Discover Missing Host",
        method="POST",
        path="/network/discover",
        json_body={"host": "", "anonymous": True},
        allow_error=True,
    )
    assert_true(_status_code(resp_missing_host) == 422, "缺少 host 应返回 422")

    resp_missing_share, _ = http_call(
        title="Network Browse Missing Share",
        method="POST",
        path="/network/browse",
        json_body={"host": "198.51.100.10", "share": ""},
        allow_error=True,
    )
    assert_true(_status_code(resp_missing_share) == 422, "缺少 share 应返回 422")


def exercise_media_source_lifecycle(source_id: Optional[int]) -> None:
    if source_id is None:
        if VERBOSE:
            print("[source] 未提供 source_id，跳过来源生命周期测试。")
        return
    http_call(
        title="Delete Media Source",
        method="DELETE",
        path=f"/media-sources/{source_id}",
        query={"hard": "false"},
    )
    inactive_sources = list_media_sources(include_inactive=True)
    deleted = next((s for s in inactive_sources if s.get("id") == source_id), None)
    assert_true(deleted is not None, "删除来源后应能在列表中找到")
    assert_true(deleted.get("status") != "active", "删除来源应变为 inactive")

    _, restored_body = http_call(
        title="Restore Media Source",
        method="POST",
        path=f"/media-sources/{source_id}/restore",
    )
    restored = _decode_json(restored_body)
    assert_true(restored.get("status") == "active", "恢复来源应重新激活")


def start_scan_job(source_id: int) -> str:
    _, body = http_call(
        title="Start Scan",
        method="POST",
        path="/scan/start",
        query={"source_id": source_id},
    )
    data = _decode_json(body)
    job_id = data.get("jobId")
    assert_true(job_id is not None, "scan/start 未返回 jobId")
    return str(job_id)


def wait_for_scan(job_id: str) -> Dict[str, Any]:
    deadline = time.time() + SCAN_TIMEOUT
    last_state = None
    while time.time() < deadline:
        _, body = http_call(
            title="Scan Status",
            method="GET",
            path="/scan/status",
            query={"job_id": job_id},
        )
        data = _decode_json(body)
        state = data.get("state", "unknown")
        if VERBOSE and state != last_state:
            print(f"[scan] job={job_id} state={state} scanned={data.get('scannedCount')}")
            last_state = state
        if state in {"completed", "failed"}:
            return data
        time.sleep(SCAN_POLL_INTERVAL)
    raise TimeoutError(f"扫描任务 {job_id} 超时未完成")


def bootstrap_media_library(sample_dir: Path) -> Dict[str, Any]:
    if SKIP_BOOTSTRAP:
        print("[bootstrap] 跳过媒体初始化 (TEST_SKIP_BOOTSTRAP=1)")
        return {}
    assert_true(sample_dir.exists(), f"示例目录不存在: {sample_dir}")
    reset_backend_state()
    validate_local_source(sample_dir)
    set_media_root(sample_dir)
    source = ensure_media_source(sample_dir)
    job_id = start_scan_job(int(source["id"]))
    result = wait_for_scan(job_id)
    assert_true(result.get("state") == "completed", f"扫描任务失败: {result}")
    return source


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def run_media_flow() -> None:
    sample_dir = SAMPLE_DIR
    check_filesystem_endpoints(sample_dir)
    check_os_info_and_permissions(sample_dir)
    exercise_network_endpoints()

    source_info = bootstrap_media_library(sample_dir)
    if SKIP_BOOTSTRAP:
        fetch_init_status()
    else:
        ensure_init_state("completed", media_root=sample_dir)

    check_scan_progress(sample_dir)
    check_auto_scan_settings()

    normalized_sample = _normalize_local_path(str(sample_dir))
    lifecycle_source_id: Optional[int] = None
    if isinstance(source_info, dict) and source_info.get("id") is not None:
        lifecycle_source_id = int(source_info["id"])
    if lifecycle_source_id is None:
        existing_sources = list_media_sources(include_inactive=True)
        for src in existing_sources:
            root = src.get("rootPath") or src.get("root_path")
            src_id = src.get("id")
            if root and src_id is not None and _normalize_local_path(str(root)) == normalized_sample:
                lifecycle_source_id = int(src_id)
                break
        if lifecycle_source_id is None and existing_sources:
            fallback_id = existing_sources[0].get("id")
            if fallback_id is not None:
                lifecycle_source_id = int(fallback_id)

    # 生成本地种子，兼容无需 /session 的架构
    session_seed = _random_seed()
    if VERBOSE:
        print(f"[seed] 使用本地生成的 session_seed={session_seed}")

    # 1) 基础健康检查
    http_call(title="Health", method="GET", path="/health")

    # 2) 推荐流分页
    _, body = http_call(
        title="Media List (seeded)",
        method="GET",
        path="/media-list",
        query={"seed": session_seed, "offset": 0, "limit": 5, "order": "seeded"},
    )
    page = _decode_json(body)
    items = page.get("items", [])
    assert_true(len(items) > 0, "应至少返回一个媒体项")
    first_id = items[0]["id"]

    # 3) 拉取原资源
    r_media, _ = http_call(
        title="Media Resource",
        method="GET",
        path=f"/media-resource/{first_id}",
    )
    assert_true(header_contains(r_media, "Accept-Ranges", "bytes"), "媒体资源应支持 Range")

    # 3.1) HEAD
    r_head, _ = http_call(
        title="Media Resource HEAD",
        method="HEAD",
        path=f"/media-resource/{first_id}",
        allow_error=True,
    )
    code = _status_code(r_head)
    if 200 <= code < 300:
        assert_true(header_contains(r_head, "Accept-Ranges", "bytes"), "HEAD 响应应包含 Range 头")

    # 4) 预取与 recent 排序
    http_call(
        title="Media List Prefetch",
        method="GET",
        path="/media-list",
        query={"seed": session_seed, "offset": 5, "limit": 5, "order": "seeded"},
    )
    http_call(
        title="Media List Recent",
        method="GET",
        path="/media-list",
        query={"seed": session_seed, "offset": 0, "limit": 3, "order": "recent"},
    )

    # 5) 缩略图
    r_thumb, thumb_bytes = http_call(
        title="Media Thumbnail",
        method="GET",
        path=f"/media/{first_id}/thumbnail",
    )
    ctype = r_thumb.headers.get("Content-Type", "")
    assert_true(ctype.startswith("image/"), f"缩略图 Content-Type 异常: {ctype}")
    assert_true(len(thumb_bytes) > 0, "缩略图响应为空")

    # 6) 缺 seed 触发 400
    r_bad, _ = http_call(
        title="Media List Missing Seed",
        method="GET",
        path="/media-list",
        query={"offset": 0, "limit": 1},
        allow_error=True,
    )
    assert_true(_status_code(r_bad) == 400, "缺少 seed 应返回 400")

    # 7) 标签列表 + 点赞
    _, body = http_call(title="List Tags", method="GET", path="/tags")
    tags_payload = _decode_json(body)
    tags = tags_payload.get("tags", [])
    assert_true("like" in tags and "favorite" in tags, "基础标签缺失 like/favorite")
    chosen_tag = "like"

    skip_tag_tests = False
    r_add, body = http_call(
        title="Add Tag",
        method="POST",
        path="/tag",
        json_body={"media_id": first_id, "tag": chosen_tag},
        allow_error=True,
    )
    code = _status_code(r_add)
    if code >= 400:
        text = body.decode("utf-8", errors="ignore")
        if "read-only" in text.lower():
            skip_tag_tests = True
            if VERBOSE:
                print("[tag] 后端为只读，跳过标签测试。")
        else:
            raise RuntimeError(f"Add Tag failed: HTTP {code} {text}")

    if not skip_tag_tests:
        r_dup, _ = http_call(
            title="Add Tag Duplicate",
            method="POST",
            path="/tag",
            json_body={"media_id": first_id, "tag": chosen_tag},
            allow_error=True,
        )
        assert_true(_status_code(r_dup) == 409, "重复点赞应返回 409")

    http_call(
        title="Media List By Tag",
        method="GET",
        path="/media-list",
        query={"tag": chosen_tag, "offset": 0, "limit": 5},
    )

    if not skip_tag_tests:
        http_call(
            title="Remove Tag",
            method="DELETE",
            path="/tag",
            json_body={"media_id": first_id, "tag": chosen_tag},
        )

    # 8) Range 请求
    r_range, body = http_call(
        title="Media Range 0-1023",
        method="GET",
        path=f"/media-resource/{first_id}",
        headers={"Range": "bytes=0-1023"},
        allow_error=True,
    )
    code = _status_code(r_range)
    if code == 206:
        cr = r_range.headers.get("Content-Range", "")
        assert_true(cr.startswith("bytes 0-"), f"Content-Range 异常: {cr}")
        clen = int(r_range.headers.get("Content-Length", "0") or 0)
        assert_true(clen == len(body), "Content-Length 与响应体长度不一致")

    r_416, _ = http_call(
        title="Media Range Invalid",
        method="GET",
        path=f"/media-resource/{first_id}",
        headers={"Range": "bytes=999999999-1000000000"},
        allow_error=True,
    )
    assert_true(_status_code(r_416) in (206, 416), "超大 Range 应返回 416 或 206")

    # 9) 删除媒体
    http_call(
        title="Delete Media",
        method="DELETE",
        path=f"/media/{first_id}",
        query={"delete_file": "true"},
    )
    r_deleted, _ = http_call(
        title="Media After Delete",
        method="GET",
        path=f"/media-resource/{first_id}",
        allow_error=True,
    )
    assert_true(_status_code(r_deleted) == 404, "删除后的媒体应返回 404")

    # 10) 批量删除
    _, body = http_call(
        title="Media List For Batch",
        method="GET",
        path="/media-list",
        query={"seed": session_seed, "offset": 0, "limit": 6, "order": "seeded"},
    )
    page2 = _decode_json(body)
    ids = [item["id"] for item in page2.get("items", []) if item.get("id") != first_id]
    ids = ids[:2]
    if ids:
        _, body = http_call(
            title="Batch Delete",
            method="POST",
            path="/media/batch-delete",
            json_body={"ids": ids, "delete_file": True},
        )
        resp_obj = _decode_json(body)
        deleted = set(resp_obj.get("deleted", []))
        failed = resp_obj.get("failed", [])
        assert_true(set(ids).issubset(deleted), f"批删返回异常: {resp_obj}")
        assert_true(len(failed) == 0, f"批删失败列表应为空: {failed}")

        _, body2 = http_call(
            title="Batch Delete Idempotent",
            method="POST",
            path="/media/batch-delete",
            json_body={"ids": ids, "delete_file": True},
        )
        resp2 = _decode_json(body2)
        deleted2 = set(resp2.get("deleted", []))
        assert_true(set(ids).issubset(deleted2), "幂等批删应包含相同 ID")

        for mid in ids:
            r_chk, _ = http_call(
                title=f"Verify Deleted {mid}",
                method="GET",
                path=f"/media-resource/{mid}",
                allow_error=True,
            )
            assert_true(_status_code(r_chk) == 404, f"被批删的 {mid} 应返回 404")

    exercise_media_source_lifecycle(lifecycle_source_id)

    print("\nAll API flow steps completed successfully.")

    # 结束后恢复快照，保持仓库状态稳定
    _restore_snapshots_if_available()


def main() -> None:
    global BASE_URL
    _restore_snapshots_if_available()
    BASE_URL = _select_base_url(BASE_URL)
    if VERBOSE:
        print("Client Mode = network")
        print(f"API_BASE_URL = {BASE_URL}")
    run_media_flow()


if __name__ == "__main__":
    main()
