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
      cachedApiBase = "http://localhost:8000"
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
  const base = getApiBase()
  if (!path.startsWith("/")) {
    return base ? `${base}/${path}` : path
  }
  return `${base}${path}`
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = resolveApiUrl(path)
  return fetch(url, init)
}

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

export async function getCommonFolders(): Promise<CommonFolderEntry[]> {
  const resp = await apiFetch("/filesystem/common-folders")
  if (!resp.ok) return []
  return (await resp.json()) as CommonFolderEntry[]
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

export type SourceType = 'local' | 'smb'

export interface MediaSource {
  id: number
  type: SourceType
  displayName: string | null
  rootPath: string
  createdAt: string
  lastScanAt: string | null
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
  return (await ensured.json()) as MediaSource
}


// 删除媒体来源
export async function deleteMediaSource(id: number, hard = false): Promise<void> {
  const response = await apiFetch(`/media-sources/${id}?hard=${hard}`, { method: "DELETE" })
  await ensureOk(response)
}

// 恢复媒体来源
export async function restoreMediaSource(id: number): Promise<MediaSource> {
  const response = await apiFetch(`/media-sources/${id}/restore`, { method: "POST" })
  const ensured = await ensureOk(response)
  return (await ensured.json()) as MediaSource
}

// 获取媒体来源列表（支持包含已停用的来源）
export async function getMediaSources(includeInactive = false): Promise<MediaSource[]> {
  const response = await apiFetch(`/media-sources?include_inactive=${includeInactive}`)
  const ensured = await ensureOk(response)
  return (await ensured.json()) as MediaSource[]
}

// ===== 扫描相关 API =====

export interface ScanStartResponse {
  jobId: string
}

export interface ScanStatusResponse {
  state: 'running' | 'completed' | 'failed'
  scannedCount: number
  message: string | null
  startedAt: string | null
  finishedAt: string | null
}

// 开始扫描媒体源
export async function startScan(sourceId: number): Promise<string> {
  const response = await apiFetch(`/scan/start?source_id=${sourceId}`, { method: "POST" })
  const data = await ensureOk(response)
  const result = await data.json() as ScanStartResponse
  return result.jobId
}

// 获取扫描状态
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
