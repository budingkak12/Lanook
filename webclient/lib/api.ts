const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

let cachedApiBase: string | null = null

function getApiBase(): string {
  if (cachedApiBase !== null) {
    return cachedApiBase
  }

  const envValue = process.env.NEXT_PUBLIC_API_BASE
  if (envValue && envValue.trim().length > 0) {
    cachedApiBase = envValue.trim().replace(/\/+$/, "")
    return cachedApiBase
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname
    const port = window.location.port

    if (DEV_HOSTS.has(host)) {
      // 开发环境按铁律：直连后端 172.29.45.119:8000
      cachedApiBase = "http://172.29.45.119:8000"
      return cachedApiBase
    }

    // 对于局域网访问，使用当前主机的8000端口
    cachedApiBase = `http://${host}:8000`
    return cachedApiBase
  }

  cachedApiBase = ""
  return cachedApiBase
}

export function resolveApiUrl(path: string): string {
  // 已经是绝对 URL 直接返回，避免重复前缀
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const base = getApiBase()
  if (!path.startsWith("/")) {
    return base ? `${base}/${path}` : path
  }
  return `${base}${path}`
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = resolveApiUrl(path)
  console.log(`API请求: ${url}`)
  return fetch(url, init)
}

// ===== 通用 JSON 工具 =====

export type BulkDeleteResult = {
  deleted: number[]
  failed: { id: number; reason?: string | null }[]
}

function buildJsonRequestInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }
}

async function ensureOk(response: Response): Promise<Response> {
  if (response.ok) {
    return response
  }

  let message = `请求失败：${response.status}`
  try {
    const data = await response.json()
    if (data?.detail) {
      message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)
    } else if (data?.message) {
      message = data.message
    }
  } catch {
    try {
      const text = await response.text()
      if (text) {
        message = text
      }
    } catch {
      /* noop */
    }
  }
  throw new Error(message)
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await apiFetch(path, init)
  const ensured = await ensureOk(resp)
  return (await ensured.json()) as T
}

export async function batchDeleteMedia(ids: number[], deleteFile = true): Promise<BulkDeleteResult> {
  if (ids.length === 0) {
    return { deleted: [], failed: [] }
  }
  const response = await apiFetch("/media/batch-delete", buildJsonRequestInit("POST", { ids, delete_file: deleteFile }))
  const ensured = await ensureOk(response)
  const data = (await ensured.json()) as BulkDeleteResult
  return data
}

export async function deleteMedia(mediaId: number, deleteFile = true): Promise<void> {
  const response = await apiFetch(`/media/${mediaId}?delete_file=${deleteFile ? "true" : "false"}`, {
    method: "DELETE",
  })
  await ensureOk(response)
}

async function setTag(mediaId: number, tag: string, enabled: boolean): Promise<void> {
  const payload = { media_id: mediaId, tag }
  if (enabled) {
    const response = await apiFetch("/tag", buildJsonRequestInit("POST", payload))
    await ensureOk(response)
  } else {
    const response = await apiFetch("/tag", buildJsonRequestInit("DELETE", payload))
    await ensureOk(response)
  }
}

export async function setLike(mediaId: number, enabled: boolean): Promise<void> {
  await setTag(mediaId, "like", enabled)
}

export async function setFavorite(mediaId: number, enabled: boolean): Promise<void> {
  await setTag(mediaId, "favorite", enabled)
}

// ===== tag list (cached) =====

let cachedAllTags: TagItem[] | null = null
let fetchingAllTags: Promise<TagItem[]> | null = null

/**
 * 获取全部标签列表并在内存缓存，避免重复请求。
 */
export type TagItem = {
  name: string
  display_name?: string | null
}

export async function getAllTags(): Promise<TagItem[]> {
  if (cachedAllTags) return cachedAllTags
  if (fetchingAllTags) return fetchingAllTags

  fetchingAllTags = (async () => {
    try {
      const resp = await apiFetch("/tags?with_translation=true")
      if (!resp.ok) return []
      const data = (await resp.json()) as { tags?: TagItem[] }
      const sanitized = (data.tags ?? []).filter(
        (tag): tag is TagItem => typeof tag?.name === "string" && tag.name.trim().length > 0,
      )
      cachedAllTags = sanitized
      return cachedAllTags
    } catch {
      return []
    } finally {
      fetchingAllTags = null
    }
  })()

  return fetchingAllTags
}

export type MediaTag = {
  name: string
  displayName?: string | null
  sourceModel?: string | null
  confidence?: number | null
}

export async function getMediaTags(mediaId: number): Promise<MediaTag[]> {
  const response = await apiFetch(`/media/${mediaId}/tags`)
  const ensured = await ensureOk(response)
  const data = (await ensured.json()) as { mediaId: number; tags?: MediaTag[] }
  return data.tags ?? []
}

export function friendlyDeleteError(reasons: (string | undefined | null)[]): string | null {
  const normalized = reasons
    .filter((reason): reason is string => typeof reason === "string" && reason.trim().length > 0)
    .map((reason) => reason.toLowerCase())
  if (normalized.some((reason) => reason.includes("read-only") || reason.includes("readonly"))) {
    return "删除失败：后端数据库只读，请检查服务器目录写权限"
  }
  if (normalized.some((reason) => reason.includes("commit_failed"))) {
    return "删除失败：后端数据库提交失败，可能被占用或无写权限"
  }
  return null
}

// ===== setup/permissions/os-info =====

export type OSInfo = {
  os: "macos" | "windows" | "linux" | string
  lan_ips: string[]
  port: number
}

export type CommonFolderCategory =
  | "desktop"
  | "documents"
  | "downloads"
  | "pictures"
  | "videos"
  | "music"
  | "home"
  | "volume"

export type CommonFolderEntry = {
  path: string
  name: string
  readable: boolean
  writable: boolean
  is_root: boolean
  is_symlink: boolean
  category: CommonFolderCategory
}

export type ProbeStatus = "ok" | "denied" | "not_found" | "error"

export type ProbeResult = {
  path: string
  status: ProbeStatus
  reason?: string | null
}

let cachedOSInfo: OSInfo | null = null
let fetchingOSInfo: Promise<OSInfo | null> | null = null

export async function getOSInfo(): Promise<OSInfo | null> {
  if (cachedOSInfo) return cachedOSInfo
  if (fetchingOSInfo) return fetchingOSInfo
  fetchingOSInfo = (async () => {
    try {
      const resp = await apiFetch("/os-info")
      if (!resp.ok) return null
      const data = (await resp.json()) as OSInfo
      cachedOSInfo = data
      return data
    } catch {
      return null
    } finally {
      fetchingOSInfo = null
    }
  })()
  return fetchingOSInfo
}

// ===== 任务与进度 =====

export type ScanTaskState = "no_media_root" | "ready" | "error"

export type ScanTaskStatus = {
  state: ScanTaskState
  media_root_path: string | null
  scanned_count: number
  total_discovered: number | null
  remaining_count: number | null
  preview_batch_size: number
  message?: string | null
  generated_at: string
}

export async function getScanTaskStatus(forceRefresh = false): Promise<ScanTaskStatus> {
  const query = forceRefresh ? "?force_refresh=true" : ""
  return getJson<ScanTaskStatus>(`/tasks/scan-progress${query}`)
}

export type ArtifactType =
  | "thumbnail"
  | "metadata"
  | "transcode"
  | "vector"
  | "tags"
  | "faces"

export type ArtifactProgressItem = {
  artifact_type: ArtifactType
  total_media: number
  ready_count: number
  queued_count: number
  processing_count: number
  failed_count: number
}

export type AssetPipelineStatus = {
  started: boolean
  worker_count: number
  queue_size: number
  items: ArtifactProgressItem[]
  message?: string | null
}

export async function getAssetPipelineStatus(): Promise<AssetPipelineStatus> {
  return getJson<AssetPipelineStatus>("/tasks/asset-pipeline")
}

export type ClipModelCoverage = {
  model: string
  media_with_embedding: number
  last_updated_at: string | null
}

export type ClipIndexStatus = {
  total_media: number
  total_media_with_embeddings: number
  coverage_ratio: number
  models: ClipModelCoverage[]
}

export async function getClipIndexStatus(): Promise<ClipIndexStatus> {
  return getJson<ClipIndexStatus>("/tasks/clip-index")
}

// 人脸聚类
export type FaceCluster = {
  id: number
  label: string
  faceCount: number
  representativeMediaId?: number | null
  representativeFaceId?: number | null
}

export type FaceClusterListResponse = {
  items: FaceCluster[]
  offset: number
  limit: number
  total: number
  hasMore: boolean
}

export type FaceClusterMediaItem = {
  mediaId: number
  filename: string
  thumbnailUrl?: string | null
}

export type FaceClusterMediaResponse = {
  cluster: FaceCluster
  items: FaceClusterMediaItem[]
  offset: number
  limit: number
  total: number
  hasMore: boolean
}

export async function getFaceClusters(params?: { offset?: number; limit?: number }): Promise<FaceClusterListResponse> {
  const offset = params?.offset ?? 0
  const limit = params?.limit ?? 50
  return getJson<FaceClusterListResponse>(`/face-clusters?offset=${offset}&limit=${limit}`)
}

export async function getFaceClusterItems(
  clusterId: number,
  params?: { offset?: number; limit?: number },
): Promise<FaceClusterMediaResponse> {
  const offset = params?.offset ?? 0
  const limit = params?.limit ?? 100
  return getJson<FaceClusterMediaResponse>(`/face-clusters/${clusterId}?offset=${offset}&limit=${limit}`)
}

// 缓存与去重：避免 React StrictMode 下开发环境重复触发 useEffect 产生的双请求
let cachedCommonFolders: CommonFolderEntry[] | null = null
let fetchingCommonFolders: Promise<CommonFolderEntry[]> | null = null
export async function getCommonFolders(): Promise<CommonFolderEntry[]> {
  if (cachedCommonFolders) return cachedCommonFolders
  if (fetchingCommonFolders) return fetchingCommonFolders
  fetchingCommonFolders = (async () => {
    try {
      const resp = await apiFetch("/filesystem/common-folders")
      if (!resp.ok) return []
      const data = (await resp.json()) as CommonFolderEntry[]
      cachedCommonFolders = data
      return data
    } finally {
      fetchingCommonFolders = null
    }
  })()
  return fetchingCommonFolders
}

export async function probePermissions(paths: string[]): Promise<ProbeResult[]> {
  if (paths.length === 0) return []
  const resp = await apiFetch("/permissions/probe", buildJsonRequestInit("POST", { paths }))
  if (!resp.ok) return []
  return (await resp.json()) as ProbeResult[]
}

export interface FolderItem {
  name: string
  path: string
  type: 'folder' | 'file'
  size?: number
  modified?: string
}

export async function listFolderContents(path: string): Promise<FolderItem[]> {
  const resp = await apiFetch(`/filesystem/list?path=${encodeURIComponent(path)}`)
  if (!resp.ok) return []
  const data = await resp.json()
  // API返回的是 { entries: FolderItem[] } 结构
  if (data && data.entries && Array.isArray(data.entries)) {
    return data.entries.map((entry: any) => ({
      name: entry.name,
      path: entry.path,
      type: 'folder' as const, // API只返回文件夹
      size: entry.size,
      modified: entry.modified
    }))
  }
  return []
}

// ===== 媒体来源管理 API =====

export type SourceType = 'local' | 'smb' | 'webdav'
export type ScanStrategy = 'realtime' | 'scheduled' | 'manual' | 'disabled'

export interface MediaSource {
  id: number
  type: SourceType
  sourceType?: SourceType
  displayName: string | null
  rootPath: string
  createdAt: string
  status?: 'active' | 'inactive'
  lastScanAt: string | null
  scanStrategy?: ScanStrategy
  scanIntervalSeconds?: number | null
  lastScanStartedAt?: string | null
  lastScanFinishedAt?: string | null
  lastError?: string | null
  failureCount?: number
}

export interface SourceValidationRequest {
  type: SourceType
  path?: string // for local
  host?: string // for smb
  share?: string // for smb
  subPath?: string // for smb
  anonymous?: boolean // for smb
  username?: string // for smb
  password?: string // for smb
  domain?: string // for smb
}

export interface SourceValidationResponse {
  ok: boolean
  readable: boolean
  absPath: string
  estimatedCount: number
  samples: string[]
  note: string
}

export interface CreateSourceRequest {
  type: SourceType
  rootPath: string
  displayName?: string
  // 是否在创建时立即扫描（初始化向导中应传 false）
  scan?: boolean
  scanStrategy?: ScanStrategy
  scanIntervalSeconds?: number
  // SMB fields
  host?: string
  share?: string
  subPath?: string
  username?: string
  password?: string
  domain?: string
  anonymous?: boolean
}

// 验证媒体来源
export async function validateMediaSource(request: SourceValidationRequest): Promise<SourceValidationResponse> {
  const response = await apiFetch("/setup/source/validate", buildJsonRequestInit("POST", request))
  const ensured = await ensureOk(response)
  return (await ensured.json()) as SourceValidationResponse
}

// 创建媒体来源
export async function createMediaSource(request: CreateSourceRequest): Promise<MediaSource> {
  const response = await apiFetch("/setup/source", buildJsonRequestInit("POST", request))
  const ensured = await ensureOk(response)
  const data = (await ensured.json()) as MediaSource
  invalidateMediaSourcesCache()
  return data
}

// 带额外元信息的创建：识别"已存在"并透出消息
export async function createMediaSourceWithMeta(request: CreateSourceRequest): Promise<{ source: MediaSource; existed: boolean; message: string | null }>{
  const resp = await apiFetch("/setup/source", buildJsonRequestInit("POST", request))
  if (resp.status === 409) {
    // 冲突：父子路径重叠
    const detail = await resp.json().catch(() => null)
    throw Object.assign(new Error('overlap'), { name: 'OverlapError', detail })
  }
  const ensured = await ensureOk(resp)
  const data = (await ensured.json()) as MediaSource
  const existedHeader = resp.headers.get('X-Resource-Existed') === 'true'
  const existed = (resp.status === 200) || existedHeader
  const message = resp.headers.get('X-Message') || null
  invalidateMediaSourcesCache()
  return { source: data, existed, message }
}

// 处理重叠：返回联合结果，前端可据此决定合并
export async function createMediaSourceOrMerge(request: CreateSourceRequest): Promise<
  | { ok: true; source: MediaSource; existed: boolean; message: string | null }
  | { ok: false; conflict: 'overlap_parent'; parent: string }
  | { ok: false; conflict: 'overlap_children'; children: string[] }
> {
  const resp = await apiFetch("/setup/source", buildJsonRequestInit("POST", request))
  if (resp.status === 409) {
    const j = await resp.json().catch(() => null)
    const code = j?.detail?.code || j?.code || j?.detail
    if (code === 'overlap_parent') {
      const parent = j?.detail?.parent || j?.parent || ''
      return { ok: false as const, conflict: 'overlap_parent', parent }
    }
    if (code === 'overlap_children') {
      const children = j?.detail?.children || j?.children || []
      return { ok: false as const, conflict: 'overlap_children', children }
    }
    // 其他409，按父冲突处理
    return { ok: false as const, conflict: 'overlap_parent', parent: '' }
  }
  const ensured = await ensureOk(resp)
  const data = (await ensured.json()) as MediaSource
  const existedHeader = resp.headers.get('X-Resource-Existed') === 'true'
  const existed = (resp.status === 200) || existedHeader
  const message = resp.headers.get('X-Message') || null
  invalidateMediaSourcesCache()
  return { ok: true as const, source: data, existed, message }
}


// 删除媒体来源
export async function deleteMediaSource(id: number, hard = false): Promise<void> {
  const response = await apiFetch(`/media-sources/${id}?hard=${hard}`, { method: "DELETE" })
  await ensureOk(response)
  invalidateMediaSourcesCache()
}

// 恢复媒体来源
export async function restoreMediaSource(id: number): Promise<MediaSource> {
  const response = await apiFetch(`/media-sources/${id}/restore`, { method: "POST" })
  const ensured = await ensureOk(response)
  const data = (await ensured.json()) as MediaSource
  invalidateMediaSourcesCache()
  return data
}

// 获取媒体来源列表（支持包含已停用的来源）
// 针对不同 includeInactive 维度做独立缓存
const cachedMediaSources: Record<string, MediaSource[] | null> = {}
const fetchingMediaSources: Record<string, Promise<MediaSource[]> | null> = {}

export function invalidateMediaSourcesCache(includeInactive?: boolean) {
  const invalidateKey = (key: string) => {
    cachedMediaSources[key] = null
    fetchingMediaSources[key] = null
  }

  if (typeof includeInactive === 'boolean') {
    invalidateKey(includeInactive ? '1' : '0')
    return
  }

  invalidateKey('0')
  invalidateKey('1')
}
interface GetMediaSourceOptions {
  force?: boolean
}

export async function getMediaSources(includeInactive = false, options?: GetMediaSourceOptions): Promise<MediaSource[]> {
  const key = includeInactive ? "1" : "0"
  const force = options?.force === true

  if (force) {
    cachedMediaSources[key] = null
    fetchingMediaSources[key] = null
  }

  if (cachedMediaSources[key]) return cachedMediaSources[key] as MediaSource[]
  if (fetchingMediaSources[key]) return fetchingMediaSources[key] as Promise<MediaSource[]>
  fetchingMediaSources[key] = (async () => {
    try {
      console.log(`正在请求媒体来源列表: /media-sources?include_inactive=${includeInactive}`)
      const response = await apiFetch(`/media-sources?include_inactive=${includeInactive}`)
      const ensured = await ensureOk(response)
      const data = (await ensured.json()) as MediaSource[]
      console.log('成功获取媒体来源列表:', data)
      cachedMediaSources[key] = data
      return data
    } catch (error) {
      console.error('获取媒体来源列表失败:', error)
      throw error
    } finally {
      fetchingMediaSources[key] = null
    }
  })()
  return fetchingMediaSources[key] as Promise<MediaSource[]>
}

// ===== 扫描任务状态 API（保留仅供内部调试）=====

export interface ScanStatusResponse {
  state: 'running' | 'completed' | 'failed'
  scannedCount: number
  message: string | null
  startedAt: string | null
  finishedAt: string | null
}

// 获取后台导入/索引任务的状态（当前前端未使用，仅调试/脚本可选调用）
export async function getScanStatus(jobId: string): Promise<ScanStatusResponse | null> {
  const response = await apiFetch(`/scan/status?job_id=${jobId}`)
  if (!response.ok) return null
  const data = await ensureOk(response)
  return (await data.json()) as ScanStatusResponse
}

// ===== NAS 相关 API =====

export interface NasDiscoverRequest {
  host: string
  username?: string
  password?: string
  anonymous?: boolean
}

export interface NasShareInfo {
  name: string
  path: string
  accessible: boolean
}

export interface NasDiscoverResponse {
  success: boolean
  shares: NasShareInfo[]
  error?: string
}

export interface NasBrowseRequest {
  host: string
  share: string
  path?: string
  username?: string
  password?: string
  anonymous?: boolean
}

export interface NasFolderItem {
  name: string
  path: string
}

export interface NasFileItem {
  name: string
  path: string
  size?: number
}

export interface NasBrowseResponse {
  success: boolean
  folders: NasFolderItem[]
  files: NasFileItem[]
  error?: string
}

export async function discoverNasShares(request: NasDiscoverRequest): Promise<NasDiscoverResponse> {
  const response = await apiFetch("/network/discover", buildJsonRequestInit("POST", request))
  const ensured = await ensureOk(response)
  return (await ensured.json()) as NasDiscoverResponse
}

// 浏览NAS文件夹
export async function browseNasFolders(request: NasBrowseRequest): Promise<NasBrowseResponse> {
  const response = await apiFetch("/network/browse", buildJsonRequestInit("POST", request))
  const ensured = await ensureOk(response)
  return (await ensured.json()) as NasBrowseResponse
}
