export type MediaItem = {
  id: number;
  url: string; // compatible with resourceUrl
  resourceUrl: string;
  type: 'image' | 'video';
  filename: string;
  createdAt: string;
  thumbnailUrl?: string;
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