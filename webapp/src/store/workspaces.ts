import { getMediaResourceList, getThumbnailList, MediaItem, postSession, addTag, removeTag, deleteMedia } from '../lib/api';

export type WorkspaceState = {
  mediaList: MediaItem[];
  currentIndex: number;
  offset: number;
  hasMore: boolean;
  isLoading: boolean;
  scrollTop: number;
};

type View = 'player' | 'tag_grid';

// Global app state per pseudocode
let sessionSeed: string | null = null;
const workspaces: Record<string, WorkspaceState> = {};
let activeWorkspace: string | null = null;
let currentView: View = 'player';

// Simple subscription system for React components to re-render
type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  for (const l of listeners) l();
}
export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return { sessionSeed, workspaces, activeWorkspace, currentView };
}

export function ensureWorkspace(workspaceId: string) {
  if (!workspaces[workspaceId]) {
    workspaces[workspaceId] = {
      mediaList: [],
      currentIndex: 0,
      offset: 0,
      hasMore: true,
      isLoading: false,
      scrollTop: 0,
    };
  }
  return workspaces[workspaceId];
}

export async function switchToWorkspace(workspaceId: string, options: { startIndex?: number } = {}) {
  ensureWorkspace(workspaceId);
  if (options.startIndex != null) {
    workspaces[workspaceId].currentIndex = options.startIndex;
  }
  activeWorkspace = workspaceId;
  if (workspaceId === 'feed') currentView = 'player';
  else if (workspaceId.startsWith('tag_')) currentView = 'tag_grid';
  emit();
  if (workspaces[workspaceId].mediaList.length === 0) {
    await loadMoreMediaFor(workspaceId);
  }
}

// 强制在某工作区进入播放器视图（用于缩略图点击进入详情）
export function switchToPlayerInWorkspace(workspaceId: string, startIndex: number) {
  ensureWorkspace(workspaceId);
  activeWorkspace = workspaceId;
  workspaces[workspaceId].currentIndex = startIndex;
  currentView = 'player';
  emit();
}

export async function loadMoreMediaFor(workspaceId: string) {
  const ws = ensureWorkspace(workspaceId);
  if (ws.isLoading || !ws.hasMore) return;
  ws.isLoading = true;
  emit();
  try {
    let newItems: MediaItem[] = [];
    if (workspaceId === 'feed') {
      if (!sessionSeed) throw new Error('sessionSeed not initialized');
      const page = await getMediaResourceList({ seed: sessionSeed, offset: ws.offset, limit: 20, order: 'seeded' });
      newItems = page.items.map((i) => ({ ...i, url: i.url ?? i.resourceUrl }));
      ws.offset += page.items.length;
      ws.hasMore = page.hasMore;
    } else if (workspaceId.startsWith('tag_')) {
      const tag = workspaceId.split('_')[1];
      const page = await getThumbnailList({ tag, offset: ws.offset, limit: 30 });
      newItems = page.items.map((i) => ({ ...i, url: i.url ?? i.resourceUrl }));
      ws.offset += page.items.length;
      ws.hasMore = page.hasMore;
    }
    // add playbackPosition client-side field
    (newItems as any[]).forEach((it) => (it.playbackPosition = 0));
    ws.mediaList.push(...newItems);
  } finally {
    ws.isLoading = false;
    emit();
  }
}

export async function onAppColdStart(optionalSeed?: string | number) {
  const resp = await postSession(optionalSeed);
  sessionSeed = resp.session_seed;
  await switchToWorkspace('feed');
}

// 导航与页面切换
export function navigateToHomeTab() {
  switchToWorkspace('feed');
}

export async function openTagGrid(tag: 'like' | 'favorite') {
  const workspaceId = `tag_${tag}`;
  // 强制刷新：每次点击标签列表按钮都重置数据并重新从接口获取
  ensureWorkspace(workspaceId);
  workspaces[workspaceId] = {
    mediaList: [],
    currentIndex: 0,
    offset: 0,
    hasMore: true,
    isLoading: false,
    scrollTop: 0,
  };
  activeWorkspace = workspaceId;
  currentView = 'tag_grid';
  emit();
  await loadMoreMediaFor(workspaceId);
}

export function onThumbnailClick(tag: 'like' | 'favorite', index: number) {
  switchToPlayerInWorkspace(`tag_${tag}`, index);
}

export function backToGrid() {
  if (!activeWorkspace) return;
  // 返回列表视图（标签网格）
  currentView = 'tag_grid';
  emit();
}

export async function onSwipeUp() {
  if (!activeWorkspace) return;
  const ws = workspaces[activeWorkspace];
  if (!ws) return;
  const newIndex = ws.currentIndex + 1;
  if (newIndex >= ws.mediaList.length - 3 && ws.hasMore) {
    await loadMoreMediaFor(activeWorkspace);
  }
  if (newIndex < ws.mediaList.length) {
    ws.currentIndex = newIndex;
    emit();
  }
}

export function onSwipeDown() {
  if (!activeWorkspace) return;
  const ws = workspaces[activeWorkspace];
  if (!ws) return;
  const newIndex = ws.currentIndex - 1;
  if (newIndex >= 0) {
    ws.currentIndex = newIndex;
    emit();
  }
}

export function updatePlaybackPosition(currentTime: number) {
  if (!activeWorkspace) return;
  const ws = workspaces[activeWorkspace];
  if (!ws || ws.mediaList.length === 0) return;
  const currentMedia: any = ws.mediaList[ws.currentIndex];
  currentMedia.playbackPosition = currentTime;
}

export function resetPlaybackPosition() {
  if (!activeWorkspace) return;
  const ws = workspaces[activeWorkspace];
  if (!ws || ws.mediaList.length === 0) return;
  const currentMedia: any = ws.mediaList[ws.currentIndex];
  currentMedia.playbackPosition = 0;
}

function removeMediaFromWorkspace(ws: WorkspaceState, mediaId: number) {
  const idx = ws.mediaList.findIndex((item) => item.id === mediaId);
  if (idx === -1) return false;
  ws.mediaList.splice(idx, 1);
  if (ws.offset > 0) {
    ws.offset = Math.max(0, ws.offset - 1);
  }
  if (ws.currentIndex > idx) {
    ws.currentIndex -= 1;
  } else if (ws.currentIndex >= ws.mediaList.length) {
    ws.currentIndex = Math.max(ws.mediaList.length - 1, 0);
  }
  if (ws.mediaList.length === 0) {
    ws.currentIndex = 0;
    ws.scrollTop = 0;
  }
  return true;
}

function removeMediaFromAllWorkspaces(mediaId: number) {
  let changed = false;
  for (const ws of Object.values(workspaces)) {
    if (removeMediaFromWorkspace(ws, mediaId)) {
      changed = true;
    }
  }
  if (changed) {
    emit();
  }
  return changed;
}

export async function deleteCurrentMedia(options: { deleteFile?: boolean } = { deleteFile: true }) {
  if (!activeWorkspace) return false;
  const ws = workspaces[activeWorkspace];
  if (!ws || ws.mediaList.length === 0) return false;
  const target = ws.mediaList[ws.currentIndex];

  const mergedOptions = { deleteFile: true, ...(options || {}) };
  await deleteMedia(target.id, mergedOptions);
  removeMediaFromAllWorkspaces(target.id);

  const refreshed = workspaces[activeWorkspace];
  if (refreshed && refreshed.mediaList.length === 0 && refreshed.hasMore) {
    await loadMoreMediaFor(activeWorkspace);
  }
  return true;
}

// 点赞/收藏操作（当前媒体）
export async function setTagForCurrent(tag: 'like' | 'favorite', value: boolean) {
  if (!activeWorkspace) return;
  const ws = workspaces[activeWorkspace];
  if (!ws || ws.mediaList.length === 0) return;
  const currentMedia: any = ws.mediaList[ws.currentIndex];
  try {
    if (value) await addTag(currentMedia.id, tag);
    else await removeTag(currentMedia.id, tag);
    // optimistic local flag
    if (tag === 'like') currentMedia.liked = value;
    if (tag === 'favorite') currentMedia.favorited = value;
    emit();
  } catch (e) {
    // swallow errors for now; could show toast
    console.error('Tag operation failed', e);
  }
}

// 记录并恢复滚动位置（列表页）
export function setScrollTop(scrollTop: number) {
  if (!activeWorkspace) return;
  const ws = workspaces[activeWorkspace];
  if (!ws) return;
  ws.scrollTop = scrollTop;
}
