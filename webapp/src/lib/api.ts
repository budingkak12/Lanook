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

export async function postSession(seed?: string | number): Promise<{ session_seed: string }> {
  const resp = await fetch('/session', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(seed != null ? { seed } : {}),
  });
  if (!resp.ok) throw new Error(`POST /session failed: ${resp.status}`);
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
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`GET /media-resource-list failed: ${resp.status}`);
  return resp.json();
}

export async function getMediaResource(id: number): Promise<Response> {
  const resp = await fetch(`/media-resource/${id}`);
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
  const resp = await fetch(`/thumbnail-list?${qs.toString()}`);
  if (!resp.ok) throw new Error(`GET /thumbnail-list failed: ${resp.status}`);
  return resp.json();
}

export async function listTags(): Promise<{ tags: string[] }> {
  const resp = await fetch('/tags');
  if (!resp.ok) throw new Error(`GET /tags failed: ${resp.status}`);
  return resp.json();
}

export async function addTag(mediaId: number, tag: 'like' | 'favorite'): Promise<{ success: true }> {
  const resp = await fetch('/tag', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ media_id: mediaId, tag }),
  });
  if (!resp.ok) throw new Error(`POST /tag failed: ${resp.status}`);
  return resp.json();
}

export async function removeTag(mediaId: number, tag: 'like' | 'favorite'): Promise<void> {
  const resp = await fetch('/tag', {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({ media_id: mediaId, tag }),
  });
  if (!resp.ok && resp.status !== 404) throw new Error(`DELETE /tag failed: ${resp.status}`);
}