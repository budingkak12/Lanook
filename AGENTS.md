# Repository Guidelines
## 正在做的事情
- 正在开发一个局域网相册，支持媒体浏览/管理，
- 前端：androidclient/
## 你必须做的事情
- 你需要完成构建安装 apk 
- 不要写回退兼容性代码
- 避免 代码 “巨无霸”文件：新增或重构功能时需拆分模块
## 项目结构与模块组织
- 后端（FastAPI）：`main.py`（路由/CORS/流式），数据与初始化在 `初始化数据库.py`。
- 数据：`media_app.db`（SQLite）、`sample_media/`、`thumbnails/`（由任务生成，勿提交）。
- 工具脚本：`api_flow_test.py`。

## 构建、测试与本地开发
- 安装后端依赖：`uv pip install -r requirements.txt`。
- 初始化数据库（必要时先改 `MEDIA_DIRECTORY_TO_SCAN`）：`uv run python 初始化数据库.py`。
- 启动后端：`uv run main.py`。
- 构建调试 APK：`cd androidclient && ./gradlew clean assembleDebug -x lint -x test`；随后 `adb install -r androidclient/app/build/outputs/apk/debug/app-debug.apk` 与 `adb shell am start -n com.example.androidclient/.MainActivity`。

## 编码风格与命名规范
- Python：PEP 8、4 空格、尽量类型标注；函数/变量 `snake_case`，类 `PascalCase`；保持既有路由命名（如 `/session`、`/media-list`）。推荐 Black。
- Android（Kotlin + Jetpack Compose）：统一使用 Kotlin + Compose；ViewModel 与 Repository 走 `com.example.androidclient` 既有包结构；`@Composable` 函数命名用 `PascalCase`，普通函数用 `camelCase`；网络层通过 `NetworkModule` 提供的单例接口；保持 ktlint/Android Studio 默认格式化配置。

### Python 模块拆分规则
- `main.py` 仅保留应用创建、全局中间件与路由注册，不直接承载业务逻辑。
- 业务逻辑与数据访问拆分到 `app/services/`、`app/db/` 等子模块；公共工具放入 `app/utils/`。
- 若单个 Python 文件超过约 300 行或职责超过一个模块，必须拆分为多个文件后再提交。
- 评审与 CI 应检查拆分规则（建议在 lint 配置中启用模块行数限制）。

## 测试指南
- 后端流程测试：先杀掉 8000 端口，然后启动 main.py，然后执行`uv run python api_flow_test.py`
- 提交前确保后端可启动且关键接口可用。

## 提交与 Pull Request
- 提交信息建议使用 Conventional Commits，例如：`feat(api): 支持 /media-list 分页`。
- PR 要求：明确变更说明、关联 Issue、必要的截图/录屏（UI 变更）、本地验证步骤与影响范围；避免无关改动。
- 分支命名：`feat/...`、`fix/...`、`chore/...`、`docs/...`。

## 其他建议（安全与代理说明）
- 不要提交 `thumbnails/`、私密密钥或本地路径；如需配置，使用环境变量或 `.env`（私下分发）。
- 自动化代理/机器人请优先使用 `uv run` 与 `uv pip`，勿擅自更改数据库结构或路由名称；多文件修改前后请运行 `api_flow_test.py` 验证。
