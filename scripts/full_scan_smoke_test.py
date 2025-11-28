"""
Full scan smoke test for Media App.

流程：
1. 删除现有 media_app.db；
2. 启动后端（uv run main.py），等待 /health 就绪；
3. 按 Web 前端的初始化流程模拟一次完整冷启动：
   - GET  /init-status
   - GET  /filesystem/common-folders
   - GET  /filesystem/list?path=<媒体上级目录>
   - GET  /filesystem/list?path=<媒体目录>
   - POST /setup/source/validate    （本地来源校验）
   - POST /setup/source             （创建本地媒体来源）
   - GET  /media-sources?include_inactive=false
   - POST /media-root {}            （自动选择第一个活动来源）
   - GET  /settings/auto-scan
   - GET  /tasks/scan-progress
   - GET  /tasks/asset-pipeline
   - 再次 GET /media-sources?include_inactive=false
   - POST /settings/auto-scan       （按当前配置回写一次设置）
   - 再次 GET /tasks/scan-progress 与 /tasks/asset-pipeline
   - 再次 GET /init-status
   - GET  /media-list?seed=<local_seed>&offset=0&limit=20&order=seeded
4. 周期性采样（默认 12 次，每 10 秒）：
   - /tasks/asset-pipeline
   - /tasks/clip-index
   - /tasks/scan-progress
   - SQLite 中 media / clip_embeddings / media_tags / face_embeddings / face_clusters 数量
   - 后端进程 CPU 占用
5. 打印时间序列，用于肉眼判断缩略图/模型扫描是否在推进。

注意：
- 默认媒体路径为 /Users/wang/Desktop/所有图片，可通过环境变量 MEDIA_TEST_ROOT 覆盖。
- 默认关闭初始化阶段的缩略图预热（MEDIAAPP_ENABLE_THUMBNAIL_WARMUP=0），
  以便更清晰地观察 CLIP / 标签 / 人脸三块的行为。
"""

from __future__ import annotations

import json
import os
import random
import signal
import sqlite3
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.error import URLError, HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


API_BASE = os.environ.get("MEDIA_TEST_API_BASE", "http://127.0.0.1:8000")
DEFAULT_MEDIA_ROOT = os.environ.get("MEDIA_TEST_ROOT", "/Users/wang/Desktop/所有图片")
DB_PATH = os.environ.get("MEDIA_TEST_DB_PATH", "media_app.db")


@dataclass
class SampleSnapshot:
    t: float
    cpu: float
    thumb_ready: int
    thumb_total: int
    vector_ready: int
    vector_total: int
    tags_ready: int
    tags_total: int
    faces_ready: int
    faces_total: int
    db_media: int
    db_clip: int
    db_tags: int
    db_faces: int
    db_clusters: int
    face_state: str
    face_processed: int
    face_total: int
    face_eta_ms: Optional[int]


def _http_json(method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Any:
    url = API_BASE.rstrip("/") + path
    data: Optional[bytes] = None
    headers = {"Content-Type": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = Request(url, data=data, headers=headers, method=method)
    with urlopen(req, timeout=10) as resp:
        raw = resp.read()
    if not raw:
        return None
    return json.loads(raw.decode("utf-8"))


def _generate_session_seed() -> str:
    """生成一个与前端/移动端类似的本地 session_seed。"""
    now_ms = int(time.time() * 1000)
    rand = random.randint(0, 999_999)
    return f"{now_ms}{rand:06d}"


def wait_for_health(timeout: float = 60.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            data = _http_json("GET", "/health")
            if isinstance(data, dict) and data.get("status") == "ok":
                return True
        except (URLError, HTTPError, OSError):
            pass
        time.sleep(1.0)
    return False


def start_backend() -> subprocess.Popen:
    env = os.environ.copy()
    # 方便观察模型行为：默认不在初始化阶段预热缩略图流水线。
    env.setdefault("MEDIAAPP_ENABLE_THUMBNAIL_WARMUP", "0")
    cmd = ["uv", "run", "main.py"]
    proc = subprocess.Popen(
        cmd,
        stdout=open("backend.test.log", "w"),
        stderr=subprocess.STDOUT,
        env=env,
    )
    return proc


def stop_backend(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        proc.send_signal(signal.SIGINT)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def remove_db(path: str) -> None:
    try:
        os.remove(path)
        print(f"[test] removed existing DB: {path}")
    except FileNotFoundError:
        pass


def api_init_media_root(media_root: str) -> None:
    """按 Web 初始化流程模拟一次完整冷启动。

    对齐前端抓包序列，尽量保持相同的调用顺序与语义：
    - init-status / filesystem / setup/source(/validate) / media-root
    - settings/auto-scan / tasks/* / media-sources
    """
    # 0) 初始化状态探测
    print("[test] GET /init-status (before init)")
    init_before = _http_json("GET", "/init-status")
    print(f"[test] init-status before: {init_before}")

    # 1) 浏览常用文件夹与目录列表（模拟初始化向导选择路径）
    print("[test] GET /filesystem/common-folders")
    common_folders = _http_json("GET", "/filesystem/common-folders")
    count_common = len(common_folders) if isinstance(common_folders, list) else "n/a"
    print(f"[test] common-folders count={count_common}")

    parent_dir = os.path.dirname(media_root.rstrip(os.sep)) or media_root
    try:
        parent_q = quote(parent_dir)
        print(f"[test] GET /filesystem/list?path={parent_dir!r}")
        _http_json("GET", f"/filesystem/list?path={parent_q}")
    except Exception as exc:
        print(f"[warn] list parent directory failed: {exc}")

    try:
        media_q = quote(media_root)
        print(f"[test] GET /filesystem/list?path={media_root!r}")
        _http_json("GET", f"/filesystem/list?path={media_q}")
    except Exception as exc:
        print(f"[warn] list media root directory failed: {exc}")

    # 2) 本地来源校验 + 创建
    print(f"[test] creating local source for: {media_root}")

    validate_payload = {
        "type": "local",
        "path": media_root,
    }
    print("[test] POST /setup/source/validate")
    validate_resp = _http_json("POST", "/setup/source/validate", validate_payload)
    print(f"[test] validate result: {validate_resp}")

    payload_create = {
        "type": "local",
        "rootPath": media_root,
        "displayName": "测试媒体路径",
        # 初始化向导中传 false，避免额外的旧式“立即扫描”语义干扰。
        "scan": False,
    }
    src = _http_json("POST", "/setup/source", payload_create)
    print(f"[test] created source: id={src.get('id')} rootPath={src.get('rootPath')}")

    print("[test] GET /media-sources?include_inactive=false (after create)")
    sources_after_create = _http_json("GET", "/media-sources?include_inactive=false")
    if isinstance(sources_after_create, list):
        print(f"[test] active media sources count={len(sources_after_create)}")

    # Web 初始化最后一步：不带 path，让后端自动选择第一个活动来源。
    print("[test] setting media-root via POST /media-root {} (auto-pick first active source)")
    res = _http_json("POST", "/media-root", {})
    print(f"[test] media-root set result: {res}")

    # 3) 自动扫描设置 + 任务状态（模拟设置页“文件索引服务”交互）
    print("[test] GET /settings/auto-scan")
    auto_status = _http_json("GET", "/settings/auto-scan")
    print(f"[test] auto-scan status: {auto_status}")

    print("[test] GET /tasks/scan-progress (initial)")
    scan1 = _http_json("GET", "/tasks/scan-progress")
    print(
        "[test] scan-progress #1: "
        f"state={scan1.get('state')} scanned={scan1.get('scanned_count')}/"
        f"{scan1.get('total_discovered')} remaining={scan1.get('remaining_count')}",
    )

    print("[test] GET /tasks/asset-pipeline (initial)")
    asset1 = _http_json("GET", "/tasks/asset-pipeline")
    print(
        "[test] asset-pipeline #1: "
        f"started={asset1.get('started')} worker_count={asset1.get('worker_count')} "
        f"items={len(asset1.get('items', []))}",
    )

    print("[test] GET /media-sources?include_inactive=false (after media-root)")
    sources_after_root = _http_json("GET", "/media-sources?include_inactive=false")
    if isinstance(sources_after_root, list):
        print(
            "[test] active media sources (after media-root) "
            f"count={len(sources_after_root)}"
        )

    # 回写一次自动扫描设置，模拟用户点击“保存”
    enabled = bool(auto_status.get("enabled"))
    payload_auto: Dict[str, Any] = {"enabled": enabled}
    if enabled:
        payload_auto["scan_mode"] = auto_status.get("scan_mode") or "realtime"
        payload_auto["scan_interval"] = auto_status.get("scan_interval") or "hourly"
    else:
        if auto_status.get("scan_mode"):
            payload_auto["scan_mode"] = auto_status["scan_mode"]
        if auto_status.get("scan_interval"):
            payload_auto["scan_interval"] = auto_status["scan_interval"]

    print(f"[test] POST /settings/auto-scan with payload={payload_auto}")
    auto_updated = _http_json("POST", "/settings/auto-scan", payload_auto)
    print(f"[test] auto-scan updated: {auto_updated}")

    print("[test] GET /tasks/scan-progress (after auto-scan)")
    scan2 = _http_json("GET", "/tasks/scan-progress")
    print(
        "[test] scan-progress #2: "
        f"state={scan2.get('state')} scanned={scan2.get('scanned_count')}/"
        f"{scan2.get('total_discovered')} remaining={scan2.get('remaining_count')}",
    )

    print("[test] GET /tasks/asset-pipeline (after auto-scan)")
    asset2 = _http_json("GET", "/tasks/asset-pipeline")
    print(
        "[test] asset-pipeline #2: "
        f"started={asset2.get('started')} worker_count={asset2.get('worker_count')} "
        f"items={len(asset2.get('items', []))}",
    )

    # 4) 初始化状态收尾
    print("[test] GET /init-status (after init)")
    init_after = _http_json("GET", "/init-status")
    print(f"[test] init-status after: {init_after}")


def read_db_counts(path: str) -> Dict[str, int]:
    tables = ["media", "clip_embeddings", "media_tags", "face_embeddings", "face_clusters"]
    counts: Dict[str, int] = {}
    if not os.path.exists(path):
        return {t: 0 for t in tables}
    conn = sqlite3.connect(path)
    try:
        cur = conn.cursor()
        for t in tables:
            try:
                cur.execute(f"SELECT COUNT(*) FROM {t}")
                counts[t] = int(cur.fetchone()[0])
            except Exception:
                counts[t] = -1
    finally:
        conn.close()
    return counts


def get_cpu_percent(pid: int) -> float:
    try:
        out = subprocess.check_output(["ps", "-p", str(pid), "-o", "%cpu="], text=True)
        return float(out.strip() or "0")
    except Exception:
        return 0.0


def sample_status(pid: int) -> SampleSnapshot:
    now = time.time()

    # 扫描进度主要用于确认任务是否就绪，这里调用一次即可，结果不单独打印。
    _ = _http_json("GET", "/tasks/scan-progress")

    asset = _http_json("GET", "/tasks/asset-pipeline")
    clip_index = _http_json("GET", "/tasks/clip-index")
    face_prog = _http_json("GET", "/tasks/face-progress")

    # asset-pipeline items: THUMBNAIL / VECTOR / TAGS / FACES
    thumb_ready = thumb_total = 0
    vector_ready = vector_total = 0
    tags_ready = tags_total = 0
    faces_ready = faces_total = 0
    for item in asset.get("items", []):
        t = item.get("artifact_type")
        total = int(item.get("total_media") or 0)
        ready = int(item.get("ready_count") or 0)
        if t == "thumbnail":
            thumb_ready, thumb_total = ready, total
        elif t == "vector":
            vector_ready, vector_total = ready, total
        elif t == "tags":
            tags_ready, tags_total = ready, total
        elif t == "faces":
            faces_ready, faces_total = ready, total

    db_counts = read_db_counts(DB_PATH)
    cpu = get_cpu_percent(pid)

    face_state = face_prog.get("state") if isinstance(face_prog, dict) else "unknown"
    face_processed = int(face_prog.get("processed_files") or 0) if isinstance(face_prog, dict) else 0
    face_total = int(face_prog.get("total_files") or 0) if isinstance(face_prog, dict) else 0
    face_eta_ms = int(face_prog.get("eta_ms") or 0) if isinstance(face_prog, dict) else None

    return SampleSnapshot(
        t=now,
        cpu=cpu,
        thumb_ready=thumb_ready,
        thumb_total=thumb_total,
        vector_ready=vector_ready,
        vector_total=vector_total,
        tags_ready=tags_ready,
        tags_total=tags_total,
        faces_ready=faces_ready,
        faces_total=faces_total,
        db_media=db_counts.get("media", 0),
        db_clip=db_counts.get("clip_embeddings", 0),
        db_tags=db_counts.get("media_tags", 0),
        db_faces=db_counts.get("face_embeddings", 0),
        db_clusters=db_counts.get("face_clusters", 0),
        face_state=face_state,
        face_processed=face_processed,
        face_total=face_total,
        face_eta_ms=face_eta_ms,
    )


def main() -> int:
    media_root = DEFAULT_MEDIA_ROOT
    print(f"[test] using media root: {media_root}")

    # 1) 删除 DB
    remove_db(DB_PATH)

    # 2) 启动后端
    print("[test] starting backend: uv run main.py")
    proc = start_backend()
    try:
        if not wait_for_health(timeout=60.0):
            print("[test] backend health check failed within 60s", file=sys.stderr)
            return 1
        print("[test] backend is healthy.")

        # 3) 初始化媒体根目录（对齐前端初始化流程）
        api_init_media_root(media_root)

        # 3.1) 模拟首页首屏媒体请求：GET /media-list?seed=...&offset=0&limit=20&order=seeded
        session_seed = _generate_session_seed()
        print(f"[test] GET /media-list (seeded) with seed={session_seed}")
        try:
            page = _http_json(
                "GET",
                f"/media-list?seed={session_seed}&offset=0&limit=20&order=seeded",
            )
            items = page.get("items", []) if isinstance(page, dict) else []
            print(f"[test] first media-list page items={len(items)}")
        except Exception as exc:
            print(f"[warn] /media-list request failed: {exc}")

        # 4) 周期性采样
        print("\n[test] sampling status (every 10s)...\n")
        print(
            "idx  cpu%  thumb  vector  tags  faces  "
            "db_media  db_clip  db_tags  db_faces  db_clusters  "
            "face_prog state proc/total eta(s)"
        )
        samples: list[SampleSnapshot] = []
        for idx in range(12):
            snap = sample_status(proc.pid)
            samples.append(snap)
            print(
                f"{idx:02d}  {snap.cpu:5.1f}  "
                f"{snap.thumb_ready}/{snap.thumb_total}  "
                f"{snap.vector_ready}/{snap.vector_total}  "
                f"{snap.tags_ready}/{snap.tags_total}  "
                f"{snap.faces_ready}/{snap.faces_total}  "
                f"{snap.db_media:8d}  {snap.db_clip:7d}  "
                f"{snap.db_tags:7d}  {snap.db_faces:8d}  {snap.db_clusters:11d}  "
                f"{snap.face_state:8s} {snap.face_processed}/{snap.face_total} "
                f"{(snap.face_eta_ms or 0)/1000:7.1f}"
            )
            time.sleep(10.0)

        print("\n[test] final DB counts:", read_db_counts(DB_PATH))
        print("[test] done. Check above timeline and backend.test.log for model activity.")
        return 0
    finally:
        print("[test] stopping backend...")
        stop_backend(proc)


if __name__ == "__main__":
    raise SystemExit(main())
