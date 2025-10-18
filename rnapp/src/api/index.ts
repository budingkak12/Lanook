/* Simple API client for backend endpoints */
// 服务器地址选择逻辑：
// - 若设置了 API_BASE_URL，则优先使用
// - 否则按候选地址顺序探测可用地址（优先公司网，其次家庭网），最后兜底 localhost
import { NativeModules, Platform } from 'react-native';
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
// 浏览器：优先同源，相对路径交给 Vite 代理；设备：优先 127.0.0.1 与 localhost（经 adb reverse）
const browserBases = isBrowser ? [''] : [];
const envBase = (process.env as any)?.API_BASE_URL ? [(process.env as any).API_BASE_URL] : [];

// Web 端支持通过 ?api_base= 覆盖（便于快速诊断网络问题，不影响原生端）
let qsBase: string[] = [];
try {
  if (isBrowser) {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('api_base');
    if (q && /^https?:\/\//i.test(q)) qsBase = [q];
  }
} catch {}

// 尝试从 RN Dev Server (Metro) 的 scriptURL 推断宿主机 IP（仅调试包）
let metroHostBase: string[] = [];
try {
  const scriptURL: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  if (!isBrowser && __DEV__ && scriptURL) {
    const u = new URL(scriptURL);
    const host = u.hostname; // 如 192.168.x.x 或 localhost
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      metroHostBase = [`http://${host}:8000`];
    }
  }
} catch {}

// 设备侧本地候选：优先 10.0.2.2 (Android 模拟器)，再 127.0.0.1/localhost（需 adb reverse）
const deviceLocalBases = isBrowser
  ? []
  : [
      ...(Platform.OS === 'android' ? ['http://10.0.2.2:8000'] : []),
      'http://127.0.0.1:8000',
      'http://localhost:8000',
    ];
export const candidateBaseUrls: string[] = [
  ...browserBases,
  ...qsBase,
  ...envBase,
  // 设备端优先使用 Metro 宿主机 IP 与明确的内网 IP，降低探测失败时间
  ...metroHostBase,
  'http://10.209.30.60:8000',
  'http://192.168.31.58:8000',
  ...deviceLocalBases,
];

let SELECTED_BASE: string | null = null;
let SESSION_SEED: string | null = null;

export async function resolveApiBase(): Promise<string> {
  if (SELECTED_BASE) return SELECTED_BASE;
  // Web 端优先使用同源（由 Vite 代理到后端），可被 ?api_base 覆盖
  if (isBrowser) {
    SELECTED_BASE = qsBase[0] ?? '';
    try { console.log('[api] base (browser) =', SELECTED_BASE || '(same-origin via Vite proxy)'); } catch {}
    return SELECTED_BASE;
  }
  const timeout = (ms: number) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  // 优先 /health 探测；失败再回退 /thumbnail-list?limit=1
  for (const base of candidateBaseUrls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const probeBase = base || '';
      let res = await Promise.race([
        fetch(`${probeBase}/health`, { signal: controller.signal }),
        timeout(1500),
      ]) as Response;
      if (!res || !(res as any).ok) {
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), 2000);
        res = await Promise.race([
          fetch(`${probeBase}/thumbnail-list?limit=1&seed=debug`, { signal: controller2.signal }),
          timeout(2000),
        ]) as Response;
        clearTimeout(timer2);
      }
      clearTimeout(timer);
      if (res && (res.ok || res.status === 400 || res.status === 404)) {
        SELECTED_BASE = base;
        try { console.log('[api] base resolved =', SELECTED_BASE || '(same-origin)'); } catch {}
        return SELECTED_BASE;
      }
    } catch (_) {
      // try next
    }
  }
  // 兜底使用第一个候选（通常为 env 或 localhost）
  SELECTED_BASE = candidateBaseUrls.find(Boolean) || 'http://10.209.30.60:8000';
  try { console.log('[api] base fallback =', SELECTED_BASE || '(same-origin)'); } catch {}
  return SELECTED_BASE;
}

export async function getApiBase(): Promise<string> {
  return resolveApiBase();
}

export async function getSessionSeed(): Promise<string> {
  if (SESSION_SEED) return SESSION_SEED;
  const base = await getApiBase();
  try {
    const res = await fetch(`${base}/session`);
    if (!res.ok) throw new Error(`session HTTP ${res.status}`);
    const data = await res.json();
    const seed = String(data.session_seed ?? data.seed ?? '');
    if (!seed) throw new Error('missing session_seed');
    SESSION_SEED = seed;
  } catch (e) {
    // 兜底随机种子，避免阻塞渲染
    SESSION_SEED = String(Math.floor(Math.random() * 1e9));
  }
  return SESSION_SEED!;
}

export type ThumbItem = {
  id: string | number;
  uri: string;
  resourceUrl?: string;
  type?: string; // 'image' | 'video'
  width?: number;
  height?: number;
  title?: string;
};

function normalizeItem(raw: any): ThumbItem | null {
  if (!raw) return null;
  const id = raw.id ?? raw.media_id ?? raw.uuid ?? raw.slug ?? String(Math.random());
  const uri =
    raw.thumbnailUrl ||
    raw.thumbnail_url ||
    raw.thumbnail ||
    raw.url ||
    raw.thumb ||
    raw.absolute_path ||
    raw.path ||
    null;
  if (!uri) return null;
  return {
    id,
    // 绝对路径：先占位，后在 fetchThumbnails 中统一转换（因 base 需异步解析）
    uri,
    resourceUrl: raw.resourceUrl || raw.url || undefined,
    type: raw.type || undefined,
    width: raw.width,
    height: raw.height,
    title: raw.title || raw.filename || raw.name,
  };
}

export async function fetchThumbnails(offset = 0, limit = 60): Promise<ThumbItem[]> {
  let attempts = 0;
  let lastErr: any = null;
  while (attempts < 2) {
    attempts++;
    const base = await getApiBase();
    const seed = await getSessionSeed();
    const page = Math.floor(offset / limit) + 1;
    const tryUrls = [
      `${base}/thumbnail-list?seed=${encodeURIComponent(seed)}&order=seeded&offset=${offset}&limit=${limit}`,
      `${base}/thumbnail-list?seed=${encodeURIComponent(seed)}&order=seeded&page=${page}&page_size=${limit}`,
      `${base}/thumbnail-list?seed=${encodeURIComponent(seed)}&order=seeded`,
    ];
    for (const url of tryUrls) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data)
          ? data
          : data.items || data.results || data.data || [];
        const mapped = (list as any[])
          .map(normalizeItem)
          .filter(Boolean)
          .map(it => ({
            ...it!,
            uri: (it as ThumbItem).uri.startsWith('http')
              ? (it as ThumbItem).uri
              : `${base}${(it as ThumbItem).uri.startsWith('/') ? '' : '/'}${(it as ThumbItem).uri}`,
            resourceUrl: (it as ThumbItem).resourceUrl
              ? ((it as ThumbItem).resourceUrl!.startsWith('http')
                  ? (it as ThumbItem).resourceUrl!
                  : `${base}${(it as ThumbItem).resourceUrl!.startsWith('/') ? '' : '/'}${(it as ThumbItem).resourceUrl!}`)
              : undefined,
          })) as ThumbItem[];
        return mapped;
      } catch (e: any) {
        try { console.warn('[api] request failed, will retry next url', url, String(e)); } catch {}
        lastErr = e;
      }
    }
    // 第一次失败时，清空已缓存的 BASE 并重探（适配 USB 重插/网络切换）
    SELECTED_BASE = null;
  }
  throw lastErr || new Error('Failed to fetch /thumbnail-list');
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
