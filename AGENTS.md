# Repository Guidelines
## 正在做的事情
- 正在开发一个无用户概念的局域网相册，支持媒体浏览/管理，
- 安卓前端：androidclient/
- web前端 ：webclient，项目使用 yarn管理的项目，使用 yarn dev 启动前端
- 程序总体架构：
[ 各类远程存储smb 本机文件夹等等（源） ]
        ↓
[ Python 统一接入模块 ]
        ↓
[ 资产处理模块（元数据、缩略图） ]
        ↓
[ AI 标注/审查模块（标签、NSFW、人脸聚类） ]
        ↓
[ 本地缓存 + 数据库（索引层） ]
        ↓
[ Web 前端 / API 层 ]

### AI 标注/审查模块
- 目标：统一完成“标签搜图、NSFW 细粒度屏蔽、标签权重、场景检索、人脸聚类”能力；所有结果落库后供 Web 搜索与前端筛选使用。
- 处理流程：资产处理模块入队 → `tagging_queue` → `TagExtractionService`（多模型融合）→ `NSFWService` → `FaceEmbeddingService` → `SceneDetector`，最终写入 `media_tags`、`media_nsfw`、`media_faces` 等表并刷新索引。
- 标签策略：使用统一 schema（`tag/category/weight/confidence/source_model/updated_at`），类别包含 `concept`、`scene`、`condition` 等；权重默认为模型置信度，可按类别加权；支持 `tags_any/tags_all/tags_none` 搜索和 `weight_boost` 排序。
- NSFW 策略：记录 `nsfw_level`（0 safe～3 blocked）和细粒度标签（如 `nsfw.exposure:nipple`、`nsfw.act:intercourse`），前端可通过 `nsfw_mode` 选择“展示/模糊/屏蔽”。
- 人脸聚类：使用 CPU 版 InsightFace/BlazeFace 抽 embedding，离线 HDBSCAN/Chinese Whispers 聚类写入 `face_cluster_id`，API 支持按聚类筛图并与标签联动。
- 模型建议（无独显环境优先）：
  1. `wd-v1-4-convnext/swinv2-tagger-v3` 或 `deepghs/wd14_tagger_with_embeddings`——多标签 + 置信度输出，兼容 wd-vit 经验。
  2. `SigLIP2 ViT-B/So400m`——零样本中文场景/天气/动作标签，可按需触发补齐场景检索。
  3. `SafeVision` ONNX——CPU 可用的 NSFW 检测，支持多等级细标签。
  4. `InsightFace-Paddle MobileFaceNet`——轻量人脸特征提取，为聚类与相似检索提供 embedding。

### 视频支持（规划）
- 处理思路：视频入库后先做镜头检测（PySceneDetect/ffmpeg），每段抽取关键帧（时间戳、截帧路径），再复用图像打标/NSFW/人脸管线；段级标签聚合成整片标签与权重。
- 数据存储：新增 `media_video_segments`（media_id, segment_id, start_ms, end_ms, keyframe_path），`media_tags` 与 `media_nsfw` 记录 segment_id；整片汇总标签写回媒体级方便快搜。
- NSFW：段级检测，标记 `nsfw_level` 与精细标签，前端可选择“整片屏蔽”或“按时间戳模糊”。
- 场景/动作：对关键帧调用 SigLIP2 零样本标签，合并时间戳，支持“场景+时间”过滤。
- 人脸：关键帧提取 embedding，同一视频内做轨迹关联（基于 IOU/时间连续），聚类后写入 `face_cluster_id` 并记录时间区间。
- 性能权衡：CPU 环境优先离线批处理，镜头检测与抽帧用 ffmpeg；仅对代表性帧跑较慢的 SigLIP2，余下用 WD/NSFW 轻量模型。

smb 源连接信息
### 1. Samba/SMB 连接
- **协议**: `smb://`
- **地址**: `smb://172.29.45.141` 
- **用户名**: `wang`
- **密码**: `0000`
## web前端
- 使用http://localhost:3000/开发/调试功能，前端直接指向后端 172.29.45.141:8000
## 你必须做的事情
- 你需要完成构建安装 apk 
- 不要写回退兼容性代码
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
