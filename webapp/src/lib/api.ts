export type MediaItem = {
  id: number;
  url: string; // compatible with resourceUrl
  resourceUrl: string;
  type: 'image' | 'video';
  filename: string;
  createdAt: string;
  thumbnailUrl?: string;
  // client-only flags for quick UI feedback
  liked?: boolean;
  favorited?: boolean;
};

export type PageResp<T> = {
  items: T[];
  offset: number;
  hasMore: boolean;
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// TODO: 调试期写死的默认后端地址，方便内网联调
const DEFAULT_API_BASE = 'http://10.0.174.32:8000';

function normalizeApiBaseInput(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `http:${trimmed}`;
  if (!trimmed.includes('://')) return `http://${trimmed}`;
  return trimmed;
}

// API Base 解析：优先 localStorage -> window 全局 -> Vite 环境变量 -> 相对路径
export function getApiBase(): string | undefined {
  try {
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('API_BASE_URL') : null;
    const normalized = normalizeApiBaseInput(ls);
    if (normalized) return normalized;
  } catch {}
  try {
    const anyWin = globalThis as any;
    const w = anyWin && anyWin.window ? anyWin.window : anyWin;
    const wBase = w && typeof w.API_BASE_URL === 'string' ? w.API_BASE_URL : undefined;
    const normalized = normalizeApiBaseInput(wBase);
    if (normalized) return normalized;
  } catch {}
  try {
    // Vite 构建时注入
    const envBase = (import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined;
    if (envBase && envBase.trim()) {
      const normalized = normalizeApiBaseInput(envBase);
      return normalized ?? envBase.trim();
    }
  } catch {}
  return DEFAULT_API_BASE;
}

export function setApiBase(v: string | null): string | null {
  const normalized = normalizeApiBaseInput(v);
  try {
    if (normalized) localStorage.setItem('API_BASE_URL', normalized);
    else localStorage.removeItem('API_BASE_URL');
  } catch {}
  return normalized;
}

function resolveUrl(path: string): string {
  const base = getApiBase();
  if (base && /^(https?:)?\/\//i.test(base)) {
    try {
      return new URL(path, base).toString();
    } catch {
      // 回退相对路径
    }
  }
  return path; // 使用 Vite 代理（开发）或同源相对路径（生产网页）
}

function absolutePath(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (!path.startsWith('/')) return path;
  const base = getApiBase();
  if (!base) return path;
  try {
    return new URL(path, base).toString();
  } catch {
    const cleaned = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleaned}${path}`;
  }
}

function hydrateMediaItem(raw: MediaItem): MediaItem {
  const resourceUrl = absolutePath(raw.resourceUrl) ?? raw.resourceUrl;
  const url = absolutePath(raw.url) ?? resourceUrl;
  const thumbnailUrl = absolutePath(raw.thumbnailUrl) ?? raw.thumbnailUrl;
  return { ...raw, resourceUrl, url, thumbnailUrl };
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = resolveUrl(path);
  return fetch(url, init);
}

export async function postSession(seed?: string | number): Promise<{ session_seed: string }> {
  const qs = seed != null ? `?seed=${encodeURIComponent(String(seed))}` : '';
  const resp = await apiFetch(`/session${qs}`);
  if (!resp.ok) throw new Error(`GET /session failed: ${resp.status}`);
  return resp.json();
}

export async function getMediaResourceList(params: {
  seed: string;
  offset?: number;
  limit?: number;
  order?: 'seeded' | 'recent';
}): Promise<PageResp<MediaItem>> {
  const { seed, offset = 0, limit = 20, order = 'seeded' } = params;
  const url = `/media-resource-list?seed=${encodeURIComponent(seed)}&offset=${offset}&limit=${limit}&order=${order}`;
  const resp = await apiFetch(url);
  if (!resp.ok) throw new Error(`GET /media-resource-list failed: ${resp.status}`);
  const page: PageResp<MediaItem> = await resp.json();
  return {
    ...page,
    items: page.items.map(hydrateMediaItem),
  };
}

export async function getMediaResource(id: number): Promise<Response> {
  const resp = await apiFetch(`/media-resource/${id}`);
  if (!resp.ok) throw new Error(`GET /media-resource/${id} failed: ${resp.status}`);
  return resp;
}

export async function getThumbnailList(params: {
  seed?: string;
  tag?: string;
  offset?: number;
  limit?: number;
  order?: 'seeded' | 'recent';
}): Promise<PageResp<MediaItem>> {
  const { seed, tag, offset = 0, limit = 20, order = 'seeded' } = params;
  const qs = new URLSearchParams();
  if (tag) qs.set('tag', tag);
  if (!tag) {
    if (!seed) throw new Error('seed required when tag not provided');
    qs.set('seed', String(seed));
    qs.set('order', order);
  }
  qs.set('offset', String(offset));
  qs.set('limit', String(limit));
  const resp = await apiFetch(`/thumbnail-list?${qs.toString()}`);
  if (!resp.ok) throw new Error(`GET /thumbnail-list failed: ${resp.status}`);
  const page: PageResp<MediaItem> = await resp.json();
  return {
    ...page,
    items: page.items.map(hydrateMediaItem),
  };
}

export async function listTags(): Promise<{ tags: string[] }> {
  const resp = await apiFetch('/tags');
  if (!resp.ok) throw new Error(`GET /tags failed: ${resp.status}`);
  return resp.json();
}

export async function addTag(mediaId: number, tag: 'like' | 'favorite'): Promise<{ success: true }> {
  const resp = await apiFetch('/tag', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ media_id: mediaId, tag }),
  });
  if (!resp.ok) throw new Error(`POST /tag failed: ${resp.status}`);
  return resp.json();
}

export async function removeTag(mediaId: number, tag: 'like' | 'favorite'): Promise<void> {
  const resp = await apiFetch('/tag', {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({ media_id: mediaId, tag }),
  });
  if (!resp.ok && resp.status !== 404) throw new Error(`DELETE /tag failed: ${resp.status}`);
}
