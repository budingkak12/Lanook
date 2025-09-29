import { getMediaResourceList, MediaItem, postSession } from '../lib/api';

export type WorkspaceState = {
  mediaList: MediaItem[];
  currentIndex: number;
  offset: number;
  hasMore: boolean;
  isLoading: boolean;
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
      ws.hasMore = page.items.length > 0;
    } else if (workspaceId.startsWith('tag_')) {
      // tag grid not implemented in this step
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