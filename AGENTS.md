# Repository Guidelines
## 正在做的事情
- 正在开发一个无用户概念的局域网相册，支持媒体浏览/管理，
- 安卓前端：androidclient/
- iOS原生端：Apple-app/Lanook
- web前端 ：webclient，项目使用 yarn管理的项目，使用 yarn dev 启动前端
- 程序总体架构：
[ 各类远程存储smb 本机文件夹等等（源） ]
        ↓
[ Python 统一接入模块 ]
        ↓
[ 资产处理模块（元数据、缩略图） ]
        ↓
[ AI 标注/审查模块（标签、向量、人脸等） ]
        ↓
[ 本地缓存 + 数据库（索引层） ]
        ↓
[ Web 前端 / API 层 ]

## 扫描/资产处理/AI/视频（文档入口）
- “扫描”的真实语义、资产处理与 AI（标签/向量/人脸等）如何触发与落库、以及**视频如何通过抽帧复用图像模型**：统一以 `资产处理与扫描设计记录.md` 为准。
- 本文件仅保留项目总览与协作约束，避免重复维护两份设计说明。

## 媒体来源删除后的展示口径（必须遵守）
我们对“删除媒体路径”的实现是 **soft-delete**（`media_sources.deleted_at` 置为非空，同时 `status` 变为 `inactive`），因此：

- 数据库里历史 `media` 记录可能仍存在，但 **任何前端/客户端可见的数据**（列表、搜索、详情、缩略图、人脸分组、任务进度、标签聚合等）都必须过滤掉已删除/停用来源的媒体。
- 唯一口径（active media）：
  - legacy 兼容：`media.source_id IS NULL` 视为活动媒体；
  - 否则：`media_sources.deleted_at IS NULL` 且 `media_sources.status IN (NULL,'active')` 才允许展示。
- 代码要求：
  - 后端所有涉及 `Media` 或 `FaceEmbedding.media_id` 的查询必须复用统一过滤器，禁止散落 copy/paste 条件；
  - 统一过滤器位置：`app/services/query_filters.py`（`apply_active_media_filter` 等）。

smb 源连接信息
### 1. Samba/SMB 连接
- **协议**: `smb://`
- **地址**: `smb://10.103.30.77` 
- **用户名**: `wang`
- **密码**: `0000`
## web前端
- 使用http://localhost:3000/开发/调试功能，前端直接指向后端 10.103.30.77:8000
## 你必须做的事情
- 不要写回退逻辑，例如新功能如果有问题 回退到就代码这种。除非用户指定要求
- 避免 代码 “巨无霸”文件：新增或重构功能时需拆分模块
## 项目结构与模块组织
- 后端（FastAPI）：`main.py`（路由/CORS/流式），数据库/索引逻辑在 `app/db/` 模块，脚本入口在 `scripts/init_db.py`。
- 数据：`media_app.db`（SQLite）、`sample_media/`、`thumbnails/`（由任务生成，勿提交）。

## 构建、测试与本地开发
- 安装后端依赖：`uv pip install -r requirements.txt`。
- 初始化数据库（必要时先改 `MEDIA_DIRECTORY_TO_SCAN`）：`uv run python -m scripts.init_db --media-path <绝对路径>`。
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
- 后端流程测试：总共三步，1执行prepare_test_media.py，2 启动后端。3 执行`api_flow_test.py`。
- 提交前确保后端可启动且关键接口可用。

## 提交与 Pull Request
- 提交信息建议使用 Conventional Commits，例如：`feat(api): 支持 /media-list 分页`。
- PR 要求：明确变更说明、关联 Issue、必要的截图/录屏（UI 变更）、本地验证步骤与影响范围；避免无关改动。
- 分支命名：`feat/...`、`fix/...`、`chore/...`、`docs/...`。

## 其他建议（安全与代理说明）
- 不要提交 `thumbnails/`、私密密钥或本地路径；如需配置，使用环境变量或 `.env`（私下分发）。
- 自动化代理/机器人请优先使用 `uv run` 与 `uv pip`，勿擅自更改数据库结构或路由名称
