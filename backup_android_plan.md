# 安卓端：本机备份功能开发计划

## 目标
在设置页提供本机备份：路径管理、权限获取、扫描生成任务、分块上传、断点续传，全部可测试。

## 步骤与可验证点
1. **权限入口**
   - 设置页新增“申请文件权限”按钮 + 绿色对勾状态；未授权禁用“添加目录”。
   - 手测：点击 SAF 选任意目录后状态变绿；撤销权限自动回退。
2. **Room 基础表**
   - 实体：`BackupFolder`、`BackupTask`；DAO + DB。
   - 测试：`./gradlew connectedAndroidTest`（或 Robolectric）验证 CRUD/关联查询。
3. **路径管理 UI**
   - 列表显示目录、启用/暂停、未备份数、上次扫描；操作：重新扫描/删除/别名/模式切换。
   - 手测：假数据 ViewModel，操作后 UI 状态正确；冲突对话框（重复/父子目录）。
4. **扫描与任务生成**
   - `BackupRepository.scanFolders()` 使用 DocumentFile 递归过滤隐藏文件，生成 `BackupTask`（size/mtime/hash 去重）。
   - 测试：Instrumented 测试用虚拟目录树校验待上传计数与去重逻辑。
5. **上传接口封装**
   - 独立 `UploadApi`（init/uploadChunk/finish）+ `UploadChunker`。
   - 测试：`MockWebServer` 覆盖正常、5xx 退避、秒传分支。
6. **WorkManager 流程**
   - `BackupWorker`：读取启用路径→扫描→上传→更新状态；`RetryWorker` 处理失败重试。
   - 测试：`TestWorkerBuilder` 验证成功/失败/重试；断点续传恢复已完成块。
7. **前台通知与暂停**
   - 上传进度通知，支持暂停/恢复；全局暂停停止新任务生成与上传。
   - 手测：切换 Wi‑Fi/飞行模式、点击暂停，任务排队/恢复符合预期。
8. **失败列表与重试**
   - UI 展示失败任务，单选重试，重试后状态转 pending 并重新上传。
   - 测试：单元测试校验状态流转；手测服务端故障→恢复→手动重试成功。
9. **联调后端**
   - 真实服务器：上传完成后在图库页出现新缩略图（确认扫描/标签链路生效）。
   - 手测：秒传命中不消耗流量；大文件分块完成且 hash 校验通过。

## 里程碑
- M1 权限按钮 + 路径列表骨架 + Room 表。
- M2 扫描生成任务 + MockWebServer 上传链路。
- M3 WorkManager 端到端 + 通知/暂停 + 失败重试。
- M4 后端联调与回归（断点续传、秒传、条件限制）。 
