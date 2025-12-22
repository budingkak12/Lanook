# 后端：本机备份上传与扫描联动开发计划

## 目标
实现分块上传落地到服务器本地硬盘（incoming/mobile/...），并在 finish 后触发现有扫描/资产处理/AI 链路；每一步可独立测试。

## 步骤与可验证点
1. **配置与目录**
   - 新增配置 `INCOMING_DIR`（默认 `incoming/mobile`），启动时确保可写。
   - 测试：`uv run python - <<'PY'\nimport os;print(os.access('incoming/mobile', os.W_OK))\nPY`
2. **Schema 定义**
   - `app/schemas/upload.py`：`InitUploadRequest/Response`、`ChunkRequest`、`FinishRequest`、错误码。
   - 测试：`uv run pytest tests/schemas/test_upload_schema.py`
3. **上传服务与路由**
   - 文件：`app/services/upload_service.py`、`app/api/upload_routes.py`；支持 init/已传块查询/上传块/finish、秒传分支。
   - 测试：`uv run pytest tests/api/test_upload_flow.py`（单文件两块，校验 hash/幂等）。
4. **落盘与原子移动**
   - 临时块目录 → 合并校验 hash → 原子移动到 `INCOMING_DIR/{device}/{date}/...`。
   - 测试：错误 hash 返回 400，临时文件被清理。
5. **扫描触发**
   - finish 后调用 `scan_source_once` 或后台任务；确保新 media 入库并生成缩略图/标签任务。
   - 测试：`uv run pytest tests/api/test_upload_triggers_scan.py`（断言 media/asset_artifacts 有记录）。
6. **并发与锁**
   - 对同一 `upload_id` 防重复 finish；并发写锁或 DB 状态控制。
   - 测试：多线程 finish 返回幂等结果。
7. **清理机制**
   - 过期临时块 TTL 清理脚本。
   - 测试：构造过期块，运行清理命令后目录为空。
8. **文档与示例**
   - `md文档/api接口文档.md` 增补上传流程与 curl 示例。
   - 验证：手工 curl 上传小文件，数据库出现媒体记录。

## 里程碑
- M1 配置+Schema+路由最小可用（完成单文件上传并写入硬盘）。
- M2 扫描联动与并发保护。
- M3 清理、文档、回归测试全通过。
