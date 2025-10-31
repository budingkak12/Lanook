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
    if (DEV_HOSTS.has(host)) {
      cachedApiBase = "http://localhost:8000"
      return cachedApiBase
    }
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
