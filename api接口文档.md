概述
- 无“用户”概念；`session` 仅表示一次会话的随机种子（`session_seed`）。
- 接口按六大类设计：种子、媒体JSON、媒体文件、缩略图文件、缩略图列表JSON、标签管理JSON。
 - 首页使用原资源展示（播放器），不使用缩略图列表作为首页数据源。
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
- `POST /session`
  - 用途：生成会话随机种子（非用户概念）。
  - 请求体：`{ seed?: string | number }`（可选，不传则后端生成）
  - 响应：`{ session_seed: string }`

媒体JSON（根据种子）
- `GET /media-resource-list`
  - 用途：基于 `seed` 稳定随机或按最新排序，返回“原文件图片/视频信息”列表（不含缩略图），直接包含源文件 URL。
  - 查询参数：
    - `seed: string`（必填）
    - `offset?: number`（默认 0）
    - `limit?: number`（默认 20）
    - `order?: 'seeded' | 'recent'`（默认 `'seeded'`）
  - 响应：`{ items: MediaItem[], offset, hasMore }`
  - 说明：真实图片/视频资源通过 `items[*].resourceUrl`（或 `url` 兼容）请求，指向 `GET /media-resource/{id}`。



缩略图文件（单个媒体）
- `GET /media/{id}/thumbnail`
  - 用途：获取某媒体的缩略图二进制（当前简化为原文件占位）。
  - 路径参数：`id: number`
  - 响应：图片/视频二进制
  - 错误：404（媒体不存在或文件缺失）

媒体文件（原媒体资源）
- `GET /media-resource/{id}`
  - 用途：返回指定媒体的原始文件二进制，用于播放器或图片展示。
  - 路径参数：`id: number`
  - 响应：图片或视频二进制流（`Content-Type` 随文件类型而定，如 `image/jpeg` 或 `video/mp4`）
  - 错误：404（媒体不存在或文件缺失）

缩略图列表JSON（唯一列表端点）
- `GET /thumbnail-list`
  - 用途：统一提供缩略图分页列表；当指定 `tag` 时返回标签缩略图列表，否则按 `seed/order` 返回通用缩略图列表。
  - 查询参数：
    - `tag?: 'like' | 'favorite'`（存在时走标签模式）
    - `seed?: string`（标签模式可不填；非标签模式必填）
    - `offset?: number`（默认 0）
    - `limit?: number`（默认 20）
    - `order?: 'seeded' | 'recent'`（默认 `'seeded'`，非标签模式有效）
  - 响应：`{ items: MediaItem[], offset, hasMore }`（`items[*].thumbnailUrl` 必填，且包含 `resourceUrl` 便于点击后加载原文件）

 

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