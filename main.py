from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import socket
import subprocess

import uvicorn

from 初始化数据库 import (
    SessionLocal,
    create_database_and_tables,
    seed_initial_data,
)
from app.api.setup_routes import router as setup_router
from app.api.settings_routes import router as settings_router
from app.api.sources_routes import router as sources_router
from app.api.task_routes import router as task_router
from app.api.media_routes import router as media_router
from app.services.init_state import InitializationCoordinator, InitializationState
from app.services.media_initializer import get_configured_media_root, has_indexed_media
from app.services.auto_scan_service import ensure_auto_scan_service, get_auto_scan_enabled


app = FastAPI(title="Media App API", version="1.0.0")
app.state.frontend_available = False
app.state.frontend_dist: Path | None = None

app.add_middleware(
    CORSMiddleware,
    # 直连开发/内网环境：放宽到任意来源；如需更严可改为白名单
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Resource-Existed", "X-Message"],
    # 预检结果缓存，减少重复 OPTIONS
    max_age=86400,
)

app.include_router(setup_router)
app.include_router(settings_router)
app.include_router(sources_router)
app.include_router(task_router)
app.include_router(media_router)

# 轻量健康检查，供 Android 客户端自动探测可用服务地址
@app.get("/health")
def health():
    return {"status": "ok"}


    
def _resolve_frontend_dist() -> Path:
    custom = os.environ.get("MEDIA_APP_FRONTEND_DIST")
    if custom:
        return Path(custom).expanduser().resolve()
    return (Path(__file__).parent / "webclient" / "out").resolve()


@app.on_event("startup")
def _mount_static_frontend():
    target_dir = _resolve_frontend_dist()
    app.state.frontend_dist = target_dir
    index_file = target_dir / "index.html"

    if not target_dir.exists():
        print(f"[startup] 前端静态目录不存在，跳过自动托管: {target_dir}")
        app.state.frontend_available = False
        return
    if not index_file.exists():
        print(f"[startup] 未找到前端入口文件 index.html，跳过托管: {index_file}")
        app.state.frontend_available = False
        return

    # 避免重复挂载（热重载等场景）
    already_mounted = any(
        getattr(route, "path", None) == "/" and isinstance(getattr(route, "app", None), StaticFiles)
        for route in app.routes
    )
    if not already_mounted:
        app.mount("/", StaticFiles(directory=target_dir, html=True), name="frontend-static")
        print(f"[startup] 前端静态资源已托管: {target_dir}")

    app.state.frontend_available = True
    app.state.frontend_index = index_file

# 应用启动时可选地初始化数据库（默认跳过；设置环境变量开启）
@app.on_event("startup")
def _ensure_db_initialized():
    flag = str(os.environ.get("MEDIA_APP_INIT_ON_STARTUP", "")).strip().lower()
    enabled = flag in {"1", "true", "yes", "on"}
    if not enabled:
        print("[startup] Skip DB init (set MEDIA_APP_INIT_ON_STARTUP=1 to enable).")
        return
    try:
        create_database_and_tables()
        db = SessionLocal()
        try:
            seed_initial_data(db)
        finally:
            db.close()
        print("[startup] Database initialized and base tags ensured.")
    except Exception as e:
        # 不阻断服务启动，但打印警告以便诊断
        print("[startup] Database init warning:", e)


@app.on_event("startup")
def _prepare_initialization_state():
    # 确保新表结构可用（如 app_settings）
    try:
        create_database_and_tables(echo=False)
    except Exception as exc:
        print("[startup] Failed to ensure tables for initialization:", exc)

    # 只有在协调器不存在时才创建新的
    if not hasattr(app.state, "init_coordinator") or app.state.init_coordinator is None:
        coordinator = InitializationCoordinator()
        media_root = get_configured_media_root()
        if media_root and has_indexed_media():
            coordinator.reset(
                state=InitializationState.COMPLETED,
                media_root_path=str(media_root),
                message="媒体库已初始化。",
            )
        else:
            coordinator.reset(
                state=InitializationState.IDLE,
                media_root_path=str(media_root) if media_root else None,
                message=None,
            )
        app.state.init_coordinator = coordinator


@app.on_event("startup")
def _init_auto_scan_service():
    try:
        service = ensure_auto_scan_service(app)
        if get_auto_scan_enabled():
            started, message = service.start()
            if not started and message:
                print(f"[auto-scan] 启动失败：{message}")
    except Exception as exc:
        print("[startup] 自动扫描初始化失败:", exc)


@app.on_event("shutdown")
def _shutdown_auto_scan():
    try:
        service = ensure_auto_scan_service(app)
        service.stop()
    except Exception as exc:
        print("[shutdown] 自动扫描停止失败:", exc)


@app.on_event("startup")
def _display_connection_advert():
    """启动提示与自动打开前端。

    优先打开后端托管的前端（http://<本机IP>:<后端端口>/），
    若未构建静态前端，则回落到开发服务器 http://localhost:3000/。
    """
    try:
        preferred_port = int(os.environ.get("MEDIA_APP_PORT", "8000"))
    except Exception:
        preferred_port = 8000

    lan_ip = _get_local_ip()
    print(f"[boot] Media App API 即将启动: http://{lan_ip}:{preferred_port}  (本机: http://localhost:{preferred_port})")

    # 将探测到的 LAN IP 打印即可；实际接口使用带 TTL 的快速探测与缓存

    # 自动打开前端开关（硬编码控制）
    AUTO_OPEN_BROWSER = False  # 修改这里来控制是否自动打开前端页面

    # 显示启动提示信息
    print(f"[startup] 前端自动打开: {'已启用' if AUTO_OPEN_BROWSER else '已禁用'} (修改 main.py 中的 AUTO_OPEN_BROWSER 变量)")
    if not AUTO_OPEN_BROWSER:
        print(f"[startup] 提示: 将 AUTO_OPEN_BROWSER 改为 True 可启用自动打开前端")

    if AUTO_OPEN_BROWSER:
        # 避免热重载子进程重复打开浏览器
        if os.environ.get("RUN_MAIN") == "true" or os.environ.get("UVICORN_RUN_MAIN") == "true" or not (
            os.environ.get("RUN_MAIN") or os.environ.get("UVICORN_RUN_MAIN")
        ):
            # 如果已托管静态前端，则打开后端端口；否则回退到本地开发端口 3000
            if getattr(app.state, "frontend_available", False):
                frontend_url = f"http://{lan_ip}:{preferred_port}/"
                note = "static"
            else:
                # 注意：开发模式必须用 localhost（而非局域网 IP），以便前端的 API Base 解析为 http://localhost:8000
                frontend_url = "http://localhost:3000/"
                note = "dev"

            print(f"[startup] 自动打开前端页面({note}): {frontend_url}")

            import webbrowser
            import time
            import threading

            def open_browser():
                # 若是 dev 模式，留 1.5s 等待 yarn dev；静态托管可较快
                time.sleep(1.5 if note == "dev" else 0.5)
                try:
                    webbrowser.open(frontend_url)
                except Exception as exc:
                    print("[startup] 打开浏览器失败:", exc)

            threading.Thread(target=open_browser, daemon=True).start()


# =============================
# 直接运行支持
# =============================

def _get_local_ip() -> str:
    """尽可能获取局域网 IP（IPv4）。在没有外网时回退到主机名解析或 127.0.0.1。"""
    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # 不会真正发包，仅用于选择出站网卡
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


if __name__ == "__main__":
    host = os.environ.get("MEDIA_APP_HOST", "0.0.0.0")
    try:
        port = int(os.environ.get("MEDIA_APP_PORT", "8000"))
    except Exception:
        port = 8000
    os.environ.setdefault("MEDIA_APP_PORT", str(port))

    # 尝试执行端口清理脚本（如果存在）
    try:
        result = subprocess.run(['uv', 'run', 'kill_port_8000.py'],
                              capture_output=True, text=True, check=False)
        if result.stdout:
            print(result.stdout.strip())
    except FileNotFoundError:
        # 脚本不存在，跳过端口清理
        pass
    except Exception as e:
        # 其他错误，打印但不阻断启动
        print(f"[startup] 端口清理脚本执行失败: {e}")

    lan_ip = _get_local_ip()
    print(f"[boot] Media App API 即将启动: http://{lan_ip}:{port}  (本机: http://localhost:{port})")
    uvicorn.run(app, host=host, port=port)
