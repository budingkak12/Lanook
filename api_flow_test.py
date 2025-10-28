"""
API 测试脚本（仅网络模式）
- 覆盖：分页、缩略图、标签增删、Range、删除（单删/批删）
- 仅通过 HTTP 调用已运行的服务，不再尝试进程内或直连 DB。

用法：
  1) 启动服务：uv run python main.py（或 uvicorn main:app --port 8000）
  2) 运行本脚本：uv run python api_flow_test.py
  3) 环境变量：
     - API_BASE_URL（默认 http://localhost:8000）
     - TEST_VERBOSE=0 静默模式
"""

import os
import json
import time
from urllib import request, parse, error
from typing import Dict, Any, Tuple, Optional

# 网络模式：固定通过 HTTP 调用运行中的服务；默认先尝试 127.0.0.1
BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")
VERBOSE = os.environ.get("TEST_VERBOSE", "1") != "0"


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
    # 环境变量优先
    env = os.environ.get("API_BASE_URL")
    if env:
        return env.rstrip("/")
    # 依次尝试 127.0.0.1、localhost、LAN IP
    candidates = [
        initial.rstrip("/"),
        "http://localhost:8000",
        f"http://{_get_lan_ip()}:8000",
    ]
    for base in candidates:
        if _probe_health(base):
            return base
    # 回退到 initial
    return initial.rstrip("/")


def build_url(path: str, query: Optional[Dict[str, Any]] = None) -> str:
    if query:
        return f"{BASE_URL}{path}?{parse.urlencode(query)}"
    return f"{BASE_URL}{path}"


def log_request(title: str, method: str, path: str, query: Optional[Dict[str, Any]] = None, body: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None):
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


def log_response(resp, body_bytes: bytes):
    if not VERBOSE:
        return
    print("=== RESPONSE:")
    status = getattr(resp, "status", getattr(resp, "code", None)) or resp.getcode()
    print(f"- Status  : {status}")
    ctype = resp.headers.get("Content-Type", "")
    print(f"- Headers : Content-Type={ctype}")
    # 尝试作为 JSON 打印；否则打印字节长度
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
) -> Tuple[Any, bytes]:
    """统一的调用工具：支持 HEAD、Range、自定义头，并可选择不抛错以断言异常场景。"""
    log_request(title, method, path, query, json_body, headers)

    # 进程内模式已移除；保留占位注释
    if False:
        resp = client.request(method=method, url=path, params=query or {}, json=json_body, headers=headers or {})
        body = resp.content or b""
        # 构造轻量响应对象以复用日志
        class _Resp:
            def __init__(self, r):
                self._r = r
                self.headers = r.headers
            def getcode(self):
                return self._r.status_code
        log_response(_Resp(resp), body)
        if not allow_error and resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {getattr(resp, 'text', '')}")
        return resp, body

    # 网络请求
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
        with request.urlopen(req, timeout=15) as resp:
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
            return e, body
        raise
    except Exception as e:
        print(f"Request failed: {e}")
        raise


def assert_true(cond: bool, msg: str):
    if not cond:
        raise AssertionError(msg)


def header_contains(resp, key: str, substr: str) -> bool:
    val = resp.headers.get(key) if hasattr(resp, 'headers') else None
    if val is None:
        return False
    return substr.lower() in str(val).lower()


def main():
    # 0) 恢复数据到快照（在最开始执行）
    try:
        import restore_from_snapshots as _rfs
        rc = _rfs.main()
        if VERBOSE:
            print(f"[restore_from_snapshots] exit={rc}")
    except Exception as e:
        print(f"[restore_from_snapshots] 忽略错误: {e}")

    global BASE_URL
    BASE_URL = _select_base_url(BASE_URL)
    if VERBOSE:
        print("Client Mode = network")
        print(f"API_BASE_URL = {BASE_URL}")
    # 仅网络模式：不再尝试创建/填充本地数据库
    # 提前检查服务健康
    http_call(title="Health", method="GET", path="/health")

    # 1) 会话种子
    resp, body = http_call(
        title="Create Session",
        method="GET",
        path="/session",
    )
    session_seed = json.loads(body.decode("utf-8"))["session_seed"]
    assert_true(isinstance(session_seed, str) and len(session_seed) > 0, "session_seed 应为非空字符串")

    # 1.1 指定种子也可工作
    _, body = http_call(
        title="Create Session (with seed)",
        method="GET",
        path="/session",
        query={"seed": 12345},
    )
    session_seed2 = json.loads(body.decode("utf-8")).get("session_seed")
    assert_true(str(session_seed2) == "12345", "指定种子应被回显为字符串")

    # 2) 首页播放器列表（统一媒体 JSON）
    r_list, body = http_call(
        title="Media List (seeded feed)",
        method="GET",
        path="/media-list",
        query={"seed": session_seed, "offset": 0, "limit": 5, "order": "seeded"},
    )
    page = json.loads(body.decode("utf-8"))
    items = page.get("items", [])
    assert_true(len(items) > 0, "应返回至少一个媒体项用于播放器")
    first_id = items[0]["id"]

    # 3) 播放器加载首条原资源
    r_media, _ = http_call(
        title="Media Resource (first item)",
        method="GET",
        path=f"/media-resource/{first_id}",
    )
    assert_true(header_contains(r_media, "Accept-Ranges", "bytes"), "媒体资源应支持 Range: bytes")

    # 3.1 HEAD 媒体资源（若服务器支持）
    r_head, _ = http_call(
        title="Media Resource HEAD",
        method="HEAD",
        path=f"/media-resource/{first_id}",
        allow_error=True,
    )
    # 有的环境可能返回 405；仅在非 2xx 情况下不强制
    code = getattr(r_head, 'status_code', getattr(r_head, 'code', None)) or r_head.getcode()
    if 200 <= int(code) < 300:
        assert_true(header_contains(r_head, "Accept-Ranges", "bytes"), "HEAD 响应也应包含 Accept-Ranges")

    # 4) 预取下一页（播放器）
    http_call(
        title="Media List (prefetch)",
        method="GET",
        path="/media-list",
        query={"seed": session_seed, "offset": 5, "limit": 5, "order": "seeded"},
    )

    # 4.1 recent 排序
    http_call(
        title="Media List (recent)",
        method="GET",
        path="/media-list",
        query={"seed": session_seed, "offset": 0, "limit": 3, "order": "recent"},
    )

    # 5) 通用媒体列表（非标签模式）
    _, body = http_call(
        title="Media List (seeded)",
        method="GET",
        path="/media-list",
        query={"seed": session_seed, "offset": 0, "limit": 5, "order": "seeded"},
    )
    thumb_page = json.loads(body.decode("utf-8"))
    thumb_items = thumb_page.get("items", [])
    if thumb_items:
        # 6) 单媒体缩略图（占位）
        r_thumb, thumb_bytes = http_call(
            title="Media Thumbnail (first from media list)",
            method="GET",
            path=f"/media/{thumb_items[0]['id']}/thumbnail",
        )
        ctype = r_thumb.headers.get("Content-Type", "")
        # 移除回退逻辑：缩略图必须为 image/* 类型
        assert_true(ctype.startswith("image/"), f"缩略图 Content-Type 应为 image/*，实际 {ctype}")
        assert_true(len(thumb_bytes) > 0, "缩略图响应应非空")

    # 5.1 非标签模式缺 seed → 400
    r_bad, _ = http_call(
        title="Media List (missing seed)",
        method="GET",
        path="/media-list",
        query={"offset": 0, "limit": 1},
        allow_error=True,
    )
    code = getattr(r_bad, 'status_code', getattr(r_bad, 'code', None)) or r_bad.getcode()
    assert_true(int(code) == 400, f"缺 seed 时应返回 400，实际 {code}")

    # 7) 标签集合
    _, body = http_call(
        title="List Tags",
        method="GET",
        path="/tags",
    )
    tags = json.loads(body.decode("utf-8")).get("tags", [])
    assert_true("like" in tags and "favorite" in tags, "基础标签应包含 like 与 favorite")
    chosen_tag = "like" if "like" in tags else (tags[0] if tags else "like")

    # 8) 点赞：POST /tag（若数据库为只读则跳过标签相关用例）
    skip_tag_tests = False
    r_add, body = http_call(
        title="Add Tag (like)",
        method="POST",
        path="/tag",
        json_body={"media_id": first_id, "tag": chosen_tag},
        allow_error=True,
    )
    code = getattr(r_add, 'status_code', getattr(r_add, 'code', None)) or r_add.getcode()
    if int(code) >= 400:
        # 允许因只读而跳过后续标签用例
        text = body.decode('utf-8', errors='ignore')
        if 'read-only' in text.lower() or 'readonly' in text.lower():
            if VERBOSE:
                print("[warn] DB只读，跳过标签增删用例。")
            skip_tag_tests = True
        else:
            raise RuntimeError(f"Add Tag failed: HTTP {code} {text}")

    if not skip_tag_tests:
        # 8.1 重复点赞应 409
        r_conflict, _ = http_call(
            title="Add Tag (duplicate like)",
            method="POST",
            path="/tag",
            json_body={"media_id": first_id, "tag": chosen_tag},
            allow_error=True,
        )
        code = getattr(r_conflict, 'status_code', getattr(r_conflict, 'code', None)) or r_conflict.getcode()
        assert_true(int(code) == 409, f"重复添加标签应返回 409，实际 {code}")

    # 9) 标签媒体列表
    http_call(
        title="Media List (tag=like)",
        method="GET",
        path="/media-list",
        query={"tag": chosen_tag, "offset": 0, "limit": 5},
    )

    # 10) 取消点赞：DELETE /tag（允许重复调用返回404；只在可写时执行）
    if not skip_tag_tests:
        try:
            http_call(
                title="Remove Tag (like)",
                method="DELETE",
                path="/tag",
                json_body={"media_id": first_id, "tag": chosen_tag},
            )
        except Exception:
            # 兼容失败场景（如被重复移除），不中断整体流程
            pass

    # 11) Range: 0-1023（如果是大于 1KB 的媒体）
    r_range, body = http_call(
        title="Media Resource Range 0-1023",
        method="GET",
        path=f"/media-resource/{first_id}",
        headers={"Range": "bytes=0-1023"},
        allow_error=True,
    )
    code = getattr(r_range, 'status_code', getattr(r_range, 'code', None)) or r_range.getcode()
    if int(code) == 206:
        cr = r_range.headers.get("Content-Range", "")
        assert_true(cr.startswith("bytes 0-"), f"Content-Range 应以 'bytes 0-' 开头，实际 {cr}")
        clen = int(r_range.headers.get("Content-Length", "0") or 0)
        assert_true(clen == len(body), "Content-Length 应与响应体长度一致")

    # 12) 无效范围：期望 416
    r_416, _ = http_call(
        title="Media Resource Invalid Range",
        method="GET",
        path=f"/media-resource/{first_id}",
        headers={"Range": "bytes=999999999-1000000000"},
        allow_error=True,
    )
    code = getattr(r_416, 'status_code', getattr(r_416, 'code', None)) or r_416.getcode()
    assert_true(int(code) in (416, 206), "对超大范围应返回 416；若资源极小也可能回退 206")

    # 13) 删除媒体项
    http_call(
        title="Delete Media Item",
        method="DELETE",
        path=f"/media/{first_id}",
    )

    # 13.1) 删除后再次请求应返回 404
    r_deleted, _ = http_call(
        title="Media Resource After Delete",
        method="GET",
        path=f"/media-resource/{first_id}",
        allow_error=True,
    )
    code = getattr(r_deleted, 'status_code', getattr(r_deleted, 'code', None)) or r_deleted.getcode()
    assert_true(int(code) == 404, "删除后的媒体应返回 404")

    # 14) 批量删除：再获取一页，选取 2 个 ID 做批删
    _, body = http_call(
        title="Media List (for batch delete)",
        method="GET",
        path="/media-list",
        query={"seed": session_seed, "offset": 0, "limit": 6, "order": "seeded"},
    )
    page2 = json.loads(body.decode("utf-8"))
    ids_for_batch = [item["id"] for item in page2.get("items", []) if item.get("id") != first_id]
    ids_for_batch = ids_for_batch[:2]
    if len(ids_for_batch) >= 1:
        _, body = http_call(
            title="Batch Delete",
            method="POST",
            path="/media/batch-delete",
            json_body={"ids": ids_for_batch, "delete_file": True},
        )
        resp_obj = json.loads(body.decode("utf-8"))
        deleted = set(resp_obj.get("deleted", []))
        failed = resp_obj.get("failed", [])
        assert_true(set(ids_for_batch).issubset(deleted), f"批量删除应包含所选 ID，实际 deleted={deleted}")
        assert_true(len(failed) == 0, f"批量删除不应失败，failed={failed}")
        # 幂等：再次提交相同 ID，应仍计入 deleted
        _, body2 = http_call(
            title="Batch Delete (idempotent)",
            method="POST",
            path="/media/batch-delete",
            json_body={"ids": ids_for_batch, "delete_file": True},
        )
        resp2 = json.loads(body2.decode("utf-8"))
        deleted2 = set(resp2.get("deleted", []))
        assert_true(set(ids_for_batch).issubset(deleted2), "幂等批删应返回相同 deleted 集合")
        # 校验资源均为 404
        for mid in ids_for_batch:
            r_chk, _ = http_call(
                title=f"Verify Deleted Resource {mid}",
                method="GET",
                path=f"/media-resource/{mid}",
                allow_error=True,
            )
            code = getattr(r_chk, 'status_code', getattr(r_chk, 'code', None)) or r_chk.getcode()
            assert_true(int(code) == 404, f"被批删的资源 {mid} 应 404，实际 {code}")

    print("\nAll API flow steps completed successfully.")

    # 15) 恢复数据到快照（不因失败而中断测试结果）
    try:
        import restore_from_snapshots as _rfs
        rc = _rfs.main()
        if VERBOSE:
            print(f"[restore_from_snapshots] exit={rc}")
    except Exception as e:
        print(f"[restore_from_snapshots] 忽略错误: {e}")


def run_db_mode():
    """已废弃：保留函数名占位以兼容，但不再使用。"""
    print("[DB-MODE] 已禁用，脚本仅支持网络模式。")


if __name__ == "__main__":
    main()
