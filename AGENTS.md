# 仓库指南
项目内有python虚拟环境
约定：优先使用 `uv run python ...` 运行 Python 脚本；沟通使用中文。

## 项目结构
- 后端（FastAPI）：`main.py`（路由/CORS/流式传输），数据库模型与初始化在 `初始化数据库.py`。
- 数据：`media_app.db`（SQLite）、`sample_media/`（本地媒体）、`thumbnails/`（生成缩略图，已忽略提交）。
- 工具：`generate_test_videos.py`（生成示例 MP4）、`api_flow_test.py`（后端流程测试）。
- 前端（Vite + React + TS）：`webapp/`，代码位于 `src/pages/`、`src/store/`、`src/lib/api.ts`。Vite 代理到 `http://localhost:8000`。E2E 测试位于 `webapp/tests/`，配置 `playwright.config.ts`。
- 安卓客户端指定ip地址 192.168.1.152，请写死在代码里
- 每次安卓客户端代码修改完成后必须编译成功，然后构建到我链接上的安卓设备。才允许交付

## 构建与运行命令
- 后端（项目根目录执行）
  - 创建环境并安装依赖：` uv pip install fastapi "uvicorn[standard]" sqlalchemy pydantic`。
  - 初始化数据库（必要时先改 `MEDIA_DIRECTORY_TO_SCAN`）：`uv run python 初始化数据库.py`。
  - 启动后端：`uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000`。
  - 生成示例媒体（需 ffmpeg）：`uv run python generate_test_videos.py`。
- 前端（进入 `webapp/`）
  - 安装依赖：`npm install`（或 `npm ci`）。
  - 开发服务：`npm run dev`。
  - 构建/预览：`npm run build`，`npm run preview`。
  - E2E：先 `npm run playwright:install`，再 `npm run test:e2e`；后端在线用 `npm run test:e2e:online`，离线冒烟用 `npm run test:e2e:offline`。
- 快速后端检查：`uv run python api_flow_test.py`（也可设置 `API_BASE_URL`）。

## 代码风格与命名
- Python：PEP 8，4 空格缩进，尽量加类型标注；函数/变量用 snake_case，类使用 PascalCase。保持现有路由命名（如 `/session`、`/thumbnail-list`）。
- TypeScript/React：严格 TS；变量/函数 camelCase，组件 PascalCase。HTTP 统一放在 `src/lib/api.ts`，避免在组件里直接 fetch。
- 格式化：Python 推荐 Black；TS/JS 使用 Prettier/编辑器默认。

## 测试指南
- 后端：`api_flow_test.py` 覆盖冷启动、分页、缩略图、标签与 Range 请求；优先使用进程内 TestClient，必要时走 HTTP。
- 可选单测：新增 `tests/` 下 `test_*.py` 并用 `pytest -q` 运行。

## 提交与合并请求
- 提交信息简洁、祈使句；建议使用 Conventional Commits（如 `feat: add /thumbnail-list filter`、`fix: handle missing absolute_path`）。
- PR 需包含变更说明、复现步骤，前端变更附截图/GIF；若改动接口，记得同步 `webapp/vite.config.ts` 与 `src/lib/api.ts`。

## 安全与配置
- 配置 `MEDIA_DIRECTORY_TO_SCAN`（建议绝对路径），请勿提交个人媒体。
- 需安装 ffmpeg 以生成缩略图与示例视频。
- 默认启动不做 DB 初始化；若需在启动时自动建表与基础标签，设置环境变量：`MEDIA_APP_INIT_ON_STARTUP=1`。
 安卓打包
 cd webapp
npm run cap:sync
cd android
./gradlew assembleDebug
