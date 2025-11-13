概述
- 无“用户”概念；`session` 仅表示一次会话的随机种子（`session_seed`）。
- 接口按六大类设计：种子、媒体 JSON、媒体文件、缩略图文件、媒体列表 JSON、标签管理 JSON。
 - 首页使用原资源展示（播放器），数据来自统一的媒体列表接口。
 - 播放器交互：采用上下滑切换（上滑下一条、下滑上一条）；桌面端滚轮下=下一条、滚轮上=上一条；键盘 `ArrowUp`=下一条、`ArrowDown`=上一条。

通用数据结构
- MediaItem
  - `id: number`
  - `url: string`
  - `resourceUrl: string`  // 明确的“源文件 URL”，与 `GET /media-resource/{id}` 对应
  - `type: 'image' | 'video'`
  - `filename: string`
  - `createdAt: string`
  - `thumbnailUrl?: string`  // 仅在标签列表中用于网格缩略图展示 里面返回源文件的url 和 缩略图的url 前端按需获取

分页响应
- `{ items: any[], offset: number, hasMore: boolean }`

 

获取种子（会话）JSON
- `GET /session`
  - 用途：生成会话随机种子（非用户概念）。
  - 查询参数：`seed?: string | number`（可选，不传则后端生成）
  - 响应：`{ session_seed: string }`



缩略图文件（单个媒体）
- `GET /media/{id}/thumbnail`
  - 用途：获取某媒体的缩略图二进制。
  - 行为：后端将为图片等比缩放、为视频抽取关键帧生成真实缩略图（约 480px 最大边），优先返回生成文件；生成失败时回退到原文件。
  - 路径参数：`id: number`
  - 响应：图片二进制（`Content-Type` 随缩略图类型而定，通常为 `image/jpeg`），附带 `Cache-Control`, `ETag`, `Last-Modified`, `Accept-Ranges`
  - 错误：404（媒体不存在或文件缺失）

媒体文件（原媒体资源）
- `GET /media-resource/{id}`
  - 用途：返回指定媒体的原始文件二进制，用于播放器或图片展示。
  - 路径参数：`id: number`
  - 响应：图片或视频二进制流（`Content-Type` 随文件类型而定，如 `image/jpeg`、`video/mp4` 等；后端会自动判定），支持字节范围请求 `Range: bytes=...`，当请求范围有效时返回 `206 Partial Content` 并附带 `Content-Range`、`Content-Length`、`Accept-Ranges`，配合 `ETag` 与 `Last-Modified` 进行缓存验证。
  - 错误：404（媒体不存在或文件缺失）

媒体列表JSON（统一列表端点）
- `GET /media-list`
  - 用途：统一提供媒体分页列表；当指定 `tag` 时返回标签列表，否则按 `seed/order` 返回推荐流列表。
  - 查询参数：
    - `tag?: 'like' | 'favorite'`（存在时走标签模式）
    - `seed?: string`（标签模式可不填；非标签模式必填）
    - `offset?: number`（默认 0）
    - `limit?: number`（默认 20）
    - `order?: 'seeded' | 'recent'`（默认 `'seeded'`，非标签模式有效）
  - 响应：`{ items: MediaItem[], offset, hasMore }`（标签模式下 `items[*].thumbnailUrl` 必填；推荐流模式可为空，前端回退到 `resourceUrl`）

媒体删除
- `DELETE /media/{id}`
  - 用途：删除单个媒体。
  - 查询参数：`delete_file?: boolean`（默认 `true`，是否同时删除原文件）
  - 响应：`204 No Content`
  - 错误：`404 Not Found`（媒体不存在）

- `POST /media/batch-delete`
  - 用途：批量删除媒体。
  - 请求体：`{ ids: number[], delete_file?: boolean }`
  - 响应：`{ deleted: number[], failed: { id: number, reason: string }[] }`
  - 约定：请求中不存在的 `id` 视为已删除（幂等），计入 `deleted`；原文件/缩略图删除失败不影响 DB 删除与响应成功。

 

标签操作
- `POST /tag`
  - 请求体：`{ media_id: number, tag: 'like' | 'favorite' }`
  - 响应：`{ success: true }`
  - 错误：400（无效 tag）、404（媒体不存在）、409（标签已存在）

- `DELETE /tag`
  - 请求体：`{ media_id: number, tag: 'like' | 'favorite' }`
  - 响应：204（无内容）
  - 错误：404（该标签不存在）

- `GET /tags`
  - 响应：`{ tags: string[] }`

错误与状态码
- 200 查询成功；201 创建成功；204 删除成功
- 400 参数错误；404 资源不存在；409 冲突

 说明
 - 详情查看通过进入播放器视图并在当前工作区按索引播放；如需元数据可直接使用列表返回的 `MediaItem`。

 

初始化/媒体来源 v1（新增）
--------------------------------

目标：引导用户在首次进入时添加一个或多个“媒体来源”。当前版本已支持：
- 本机路径（macOS/Windows/Linux 的绝对路径）。
- 局域网 SMB 共享（Windows/macOS/Linux/NAS 等导出的共享）。

只读声明：本程序仅读取媒体文件用于索引与浏览，不会写入或删除“来源目录”中的任何文件；缩略图与数据库仅写入本机项目目录。

支持的来源类型（SourceType）
- `local`：本机或系统已挂载目录（示例：`/Users/you/Pictures`、`C:\\Users\\you\\Pictures`、`/mnt/photos`）。
- `smb`：SMB 共享（示例：`smb://user@192.168.1.10/photo/family`）。
- `webdav`：WebDAV 共享（预留，尚未实现 UI，但模型/接口已支持）。

数据模型
- MediaSource
  - `id: number` 主键
  - `type / sourceType: 'local' | 'smb' | 'webdav'`（`type` 为兼容旧版本，`sourceType` 为新增字段，数值一致）
  - `displayName: string|null` 显示名称
  - `rootPath: string` 根路径；`local` 为绝对路径；`smb` 为 `smb://[domain;]user@host/share[/sub]` URL（不含密码）
  - `createdAt: string` ISO 时间
  - `status: 'active' | 'inactive'`
  - `scanStrategy: 'realtime' | 'scheduled' | 'manual' | 'disabled'`
  - `scanIntervalSeconds?: number` 定时扫描间隔（秒）
  - `lastScanAt?: string` 最后一次扫描完成时间（兼容字段，等于 `lastScanFinishedAt`）
  - `lastScanStartedAt?: string`
  - `lastScanFinishedAt?: string`
  - `lastError?: string` 最近一次扫描错误信息
  - `failureCount: number` 连续失败次数
- ScanJob
  - `jobId: string`（UUID）
  - `sourceId: number`
  - `state: 'running' | 'completed' | 'failed'`
  - `scannedCount: number`
  - `message?: string`
  - `startedAt?: string`
  - `finishedAt?: string`

1) 验证来源（只读检查 + 估算）
- `POST /setup/source/validate`
- Request（local）
```
{ "type":"local", "path":"/Users/you/Pictures" }
```
- Request（smb）
```
// 匿名访问
{ "type":"smb", "host":"192.168.1.10", "share":"photo", "subPath":"family", "anonymous": true }

// 用户名密码（域可选）
{ "type":"smb", "host":"nas.local", "share":"photo", "username":"alice", "password":"***", "domain":"WORKGROUP" }
```
- Response 200
```
{
  "ok": true,
  "readable": true,
  "absPath": "/Users/you/Pictures"            // smb 时为 smb://host/share/sub
  ,"estimatedCount": 1234,
  "samples": [".../IMG_0001.jpg", ".../clip.mov"],
  "note": "只读验证通过，不会写入或删除此目录下文件"
}
```

2) 新增来源（保存配置 + 凭证入系统钥匙串）
- `POST /setup/source`
- Request（local）
```
{ "type":"local", "rootPath":"/Users/you/Pictures", "displayName":"我的相册", "scanStrategy":"realtime" }
```
- Request（smb）
```
{ "type":"smb", "host":"192.168.1.10", "share":"photo", "subPath":"family",
  "username":"alice", "password":"***", "domain":"WORKGROUP", "displayName":"NAS 相册",
  "scanStrategy":"scheduled", "scanIntervalSeconds":3600 }
// 或匿名：{ "type":"smb", "host":"192.168.1.10", "share":"photo", "anonymous": true }
```
- Response 201
```
{
  "id":1,
  "type":"smb",
  "sourceType":"smb",
  "displayName":"NAS 相册",
  "rootPath":"smb://alice@192.168.1.10/photo/family",
  "createdAt":"2025-10-31T06:00:00Z",
  "status":"active",
  "scanStrategy":"scheduled",
  "scanIntervalSeconds":3600,
  "lastScanStartedAt":null,
  "lastScanFinishedAt":null,
  "failureCount":0
}
```
说明：
- 密码不会写入数据库，只保存到系统钥匙串（keyring）。删除来源不会自动删除钥匙串条目；如需彻底撤销请在系统钥匙串中删除或更改 NAS 口令。
- 未显式指定 `scanStrategy` 时默认：`local` → `realtime`，其余来源 → `scheduled`（间隔 3600 秒，可在请求中覆盖）。

3) 列出来源
- `GET /media-sources` → `MediaSource[]`

4) 删除来源（仅删配置，不触远端）
- `DELETE /media-sources/{id}` → 204

5) 启动扫描任务（后台入库，增量去重）
- `POST /scan/start?source_id=1` → 202 `{ "jobId": "8e3c1c5f-..." }`

6) 查询扫描任务状态
- `GET /scan/status?job_id=8e3c1c5f-...` → 200
```
{ "jobId":"8e3c1c5f-...", "sourceId":1, "state":"running", "scannedCount":100, "message":null,
  "startedAt":"2025-10-31T06:00:00Z", "finishedAt":null }
```

行为与约束
- 去重键为“源文件绝对标识”：`local` 存绝对路径；`smb` 存 `smb://host/share/sub/path.ext`，跨设备稳定。
- 流媒体读取：`GET /media-resource/{id}` 支持 SMB 的 Range 分片与大文件流式；缩略图生成会针对 SMB 临时拉取必要数据，仅写本机 `thumbnails/`。
- 只读安全：不会写入或删除远端 SMB 共享文件；任何写入仅发生在本机数据库与缩略图目录。
- NFS：建议在系统层挂载后以 `local` 方式添加（最稳）。
