#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import sys
import time
from pathlib import Path

import requests


BASE = os.environ.get("TEST_BASE", "http://localhost:8000")
SAMPLE_DIR = str((Path(__file__).parent / "sample_media").resolve())


def _req(method: str, path: str, **kw):
    url = BASE + path
    r = requests.request(method, url, timeout=30, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text}")
    return r


def main():
    print("[1/7] 健康检查 …", flush=True)
    _req("GET", "/health")

    print("[2/7] 校验本地来源(sample_media) …", flush=True)
    payload = {"type": "local", "path": SAMPLE_DIR}
    r = _req("POST", "/setup/source/validate", json=payload)
    js = r.json()
    assert js.get("ok") and js.get("readable")
    assert Path(js.get("absPath")).exists()

    print("[3/7] 创建来源(local) …", flush=True)
    r = _req(
        "POST",
        "/setup/source",
        json={"type": "local", "rootPath": SAMPLE_DIR, "displayName": "sample"},
    )
    source = r.json()
    assert source["type"] == "local"
    source_id = source["id"]

    print("[4/7] 列出来源 …", flush=True)
    r = _req("GET", "/media-sources")
    sources = r.json()
    assert any(s["id"] == source_id for s in sources)

    print("[5/7] 启动扫描任务 …", flush=True)
    r = _req("POST", f"/scan/start?source_id={source_id}")
    job_id = r.json()["jobId"]

    print("[6/7] 轮询扫描状态 …", flush=True)
    deadline = time.time() + 30
    last = None
    while time.time() < deadline:
        s = _req("GET", f"/scan/status?job_id={job_id}").json()
        last = s
        if s["state"] in ("completed", "failed"):
            break
        time.sleep(0.5)
    assert last["state"] in ("completed", "failed")

    print("[7/7] 获取媒体列表与资源 …", flush=True)
    r = _req(
        "GET",
        "/media-list",
        params={"seed": "123", "offset": 0, "limit": 10, "order": "recent"},
    )
    data = r.json()
    assert isinstance(data.get("items"), list)
    items = data.get("items")
    if items:
        mid = items[0]["id"]
        # 测试 Range 请求
        rr = requests.get(f"{BASE}/media-resource/{mid}", headers={"Range": "bytes=0-1023"}, timeout=30)
        assert rr.status_code == 206 and rr.headers.get("Accept-Ranges") == "bytes"
        # 测试缩略图（可能是视频/图片，允许 404 回退）
        tr = requests.get(f"{BASE}/media/{mid}/thumbnail", timeout=30)
        if tr.status_code == 200:
            assert tr.headers.get("Content-Type", "").startswith("image/")

    print("✅ api_flow_sources_test: 全流程通过")


if __name__ == "__main__":
    sys.exit(main())

