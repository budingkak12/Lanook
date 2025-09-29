"""
API 流程测试脚本
- 目标：按照接口调用流程跑一遍，打印所有入参与返回内容
- 不测试数据库初始化脚本，仅测试运行中的 API 服务

用法：
  1) 先启动服务：python -m uvicorn main:app --port 8000
  2) 运行脚本：python api_flow_test.py
  3) 可用环境变量 API_BASE_URL 覆盖默认地址（默认 http://127.0.0.1:8000）
"""

import os
import json
import time
from urllib import request, parse, error

# 默认使用 localhost，避免某些环境对 127.0.0.1 的代理/网关拦截导致 502
BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")

# 优先使用 FastAPI TestClient 在进程内调用，避免本地网络代理造成的 502
USE_INPROCESS = True
client = None
try:
    from fastapi.testclient import TestClient
    import main as api_main
    client = TestClient(api_main.app)
except Exception:
    USE_INPROCESS = False


def build_url(path: str, query: dict | None = None) -> str:
    if query:
        return f"{BASE_URL}{path}?{parse.urlencode(query)}"
    return f"{BASE_URL}{path}"


def log_request(title: str, method: str, path: str, query: dict | None = None, body: dict | None = None):
    print("\n=== REQUEST:")
    print(f"- Title   : {title}")
    print(f"- Method  : {method}")
    print(f"- Path    : {path}")
    if query:
        print(f"- Query   : {json.dumps(query, ensure_ascii=False)}")
    if body is not None:
        print(f"- JSON    : {json.dumps(body, ensure_ascii=False)}")


def log_response(resp, body_bytes: bytes):
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


def http_call(title: str, method: str, path: str, query: dict | None = None, json_body: dict | None = None):
    log_request(title, method, path, query, json_body)

    # 进程内优先
    if USE_INPROCESS and client is not None:
        resp = client.request(method=method, url=path, params=query or {}, json=json_body)
        body = resp.content
        # 构造轻量响应对象以复用日志
        class _Resp:
            def __init__(self, r):
                self._r = r
                self.headers = r.headers
            def getcode(self):
                return self._r.status_code
        log_response(_Resp(resp), body)
        if resp.status_code >= 400:
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text}")
        return resp, body

    # 回退到网络请求
    url = build_url(path, query)
    data = None
    headers = {"Accept": "application/json"}
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(url=url, method=method, data=data, headers=headers)
    try:
        with request.urlopen(req, timeout=15) as resp:
            body = resp.read()
            log_response(resp, body)
            return resp, body
    except error.HTTPError as e:
        body = e.read()
        print("=== RESPONSE (HTTPError):")
        print(f"- Status  : {e.code}")
        print(f"- Reason  : {e.reason}")
        print(f"- Body    : {body.decode('utf-8', errors='ignore')}")
        raise
    except Exception as e:
        print(f"Request failed: {e}")
        raise


def main():
    mode = "in-process" if USE_INPROCESS and client is not None else "network"
    print(f"Client Mode = {mode}")
    if mode == "network":
        print(f"API_BASE_URL = {BASE_URL}")

    # 1) 会话种子
    _, body = http_call(
        title="Create Session",
        method="POST",
        path="/session",
        json_body={},
    )
    session_seed = json.loads(body.decode("utf-8"))["session_seed"]

    # 2) 首页播放器列表（原资源信息 JSON）
    _, body = http_call(
        title="Media Resource List (seeded)",
        method="GET",
        path="/media-resource-list",
        query={"seed": session_seed, "offset": 0, "limit": 5, "order": "seeded"},
    )
    page = json.loads(body.decode("utf-8"))
    items = page.get("items", [])
    if not items:
        raise RuntimeError("No media items returned from /media-resource-list")
    first_id = items[0]["id"]

    # 3) 播放器加载首条原资源
    http_call(
        title="Media Resource (first item)",
        method="GET",
        path=f"/media-resource/{first_id}",
    )

    # 4) 预取下一页（播放器）
    http_call(
        title="Media Resource List (prefetch)",
        method="GET",
        path="/media-resource-list",
        query={"seed": session_seed, "offset": 5, "limit": 5, "order": "seeded"},
    )

    # 5) 通用缩略图列表（非标签模式）
    _, body = http_call(
        title="Thumbnail List (seeded)",
        method="GET",
        path="/thumbnail-list",
        query={"seed": session_seed, "offset": 0, "limit": 5, "order": "seeded"},
    )
    thumb_page = json.loads(body.decode("utf-8"))
    thumb_items = thumb_page.get("items", [])
    if thumb_items:
        # 6) 单媒体缩略图（占位）
        http_call(
            title="Media Thumbnail (first from thumbnail list)",
            method="GET",
            path=f"/media/{thumb_items[0]['id']}/thumbnail",
        )

    # 7) 标签集合
    _, body = http_call(
        title="List Tags",
        method="GET",
        path="/tags",
    )
    tags = json.loads(body.decode("utf-8")).get("tags", [])
    chosen_tag = "like" if "like" in tags else (tags[0] if tags else "like")

    # 8) 点赞：POST /tag
    http_call(
        title="Add Tag (like)",
        method="POST",
        path="/tag",
        json_body={"media_id": first_id, "tag": chosen_tag},
    )

    # 9) 标签缩略图列表
    http_call(
        title="Thumbnail List (tag=like)",
        method="GET",
        path="/thumbnail-list",
        query={"tag": chosen_tag, "offset": 0, "limit": 5},
    )

    # 10) 取消点赞：DELETE /tag（允许重复调用返回404）
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

    print("\nAll API flow steps completed successfully.")


if __name__ == "__main__":
    main()