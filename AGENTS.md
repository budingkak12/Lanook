# Repository Guidelines
## 正在做的事情
- 正在开发一个局域网相册，支持媒体浏览/管理，
- 前端 React19，rn0.8， 仅需考虑支持安卓 原生 和 pc-web 即可，需要最好的性能，暂不开发 ios。后端 python fastapi
- androidclient/为前端项目参考代码和初步实现逻辑
## 项目结构与模块组织
- 后端（FastAPI）：`main.py`（路由/CORS/流式），数据与初始化在 `初始化数据库.py`。
- 数据：`media_app.db`（SQLite）、`sample_media/`、`thumbnails/`（由任务生成，勿提交）。
- 工具脚本：`generate_test_videos.py`、`api_flow_test.py`。
- 前端 Web：`webapp/`（Vite + React + TS），源码在 `webapp/src/pages/`、`webapp/src/store/`、`webapp/src/lib/api.ts`。
- React Native：`rnapp/`（开启 Fabric）。

## 构建、测试与本地开发
- 安装后端依赖：`uv pip install fastapi "uvicorn[standard]" sqlalchemy pydantic`。
- 初始化数据库（必要时先改 `MEDIA_DIRECTORY_TO_SCAN`）：`uv run python 初始化数据库.py`。
- 启动后端：`uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000`。
- 生成示例媒体（需 ffmpeg）：`uv run python generate_test_videos.py`。
- RN 开发：
  - Metro：`cd rnapp && npm start`
  - 设备端口：`adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8000 tcp:8000`
  - Web 预览：`cd rnapp && npm run web`（Vite，默认 5174）
- 构建调试 APK：`cd rnapp/android && ./gradlew clean assembleDebug -x lint -x test`；随后 `adb install -r app/build/outputs/apk/debug/app-debug.apk` 与 `adb shell am start -n com.example.androidclient/.MainActivity`。

## 编码风格与命名规范
- Python：PEP 8、4 空格、尽量类型标注；函数/变量 `snake_case`，类 `PascalCase`；保持既有路由命名（如 `/session`、`/thumbnail-list`）。推荐 Black。
- TypeScript/React：严格 TS；变量/函数 `camelCase`，组件 `PascalCase`；HTTP 统一经 `src/lib/api.ts`；使用 Prettier/编辑器默认格式化。

## 测试指南
- 后端流程测试：`uv run python api_flow_test.py`（覆盖冷启动、分页、缩略图、标签、Range）。
- 可选单测：在 `tests/` 下新增 `test_*.py`，运行 `pytest -q`。
- 提交前确保后端可启动且关键接口可用。

## 提交与 Pull Request
- 提交信息建议使用 Conventional Commits，例如：`feat(api): 支持 /thumbnail-list 分页`。
- PR 要求：明确变更说明、关联 Issue、必要的截图/录屏（UI 变更）、本地验证步骤与影响范围；避免无关改动。
- 分支命名：`feat/...`、`fix/...`、`chore/...`、`docs/...`。

## 其他建议（安全与代理说明）
- 不要提交 `thumbnails/`、私密密钥或本地路径；如需配置，使用环境变量或 `.env`（私下分发）。
- 自动化代理/机器人请优先使用 `uv run` 与 `uv pip`，勿擅自更改数据库结构或路由名称；多文件修改前后请运行 `api_flow_test.py` 验证。

