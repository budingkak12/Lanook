import React, { useEffect, useRef, useState } from 'react';
import { getState, loadMoreMediaFor, onThumbnailClick, subscribe, setScrollTop } from '../store/workspaces';
import { addTag, removeTag } from '../lib/api';

export default function TagGrid() {
  const [, force] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = subscribe(() => force((x) => x + 1));
    return () => unsub();
  }, []);

  const { activeWorkspace, workspaces } = getState();
  const ws = activeWorkspace ? workspaces[activeWorkspace] : null;
  const tag = activeWorkspace?.startsWith('tag_') ? activeWorkspace.split('_')[1] : null;
  const items = ws?.mediaList ?? [];
  const loading = !ws || (ws.isLoading && items.length === 0);

  const onScroll = async () => {
    const el = scrollerRef.current;
    if (!el || !ws || ws.isLoading || !ws.hasMore) return;
    setScrollTop(el.scrollTop);
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      await loadMoreMediaFor(activeWorkspace!);
    }
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !ws) return;
    el.scrollTop = ws.scrollTop || 0;
  }, [ws]);

  return (
    <div className="grid-container" ref={scrollerRef} onScroll={onScroll}>
      <div className="topbar">
        <div className="title">标签：{tag}</div>
      </div>
      {loading && <div className="loading">加载中...</div>}
      {!loading && items.length === 0 && <div className="empty">暂无内容</div>}
      <div className="grid">
        {items.map((it, idx) => (
          <div key={it.id} className="cell" onClick={() => onThumbnailClick(tag as 'like' | 'favorite', idx)}>
            <img src={it.thumbnailUrl || it.resourceUrl} alt={it.filename} />
            <div className="cell-actions">
              <button
                className="mini-btn"
                onClick={async (e) => {
                  e.stopPropagation();
                  const newVal = !(it as any).liked;
                  try {
                    if (newVal) await addTag(it.id, 'like'); else await removeTag(it.id, 'like');
                    (it as any).liked = newVal;
                  } catch {}
                }}
                title={(it as any).liked ? '取消点赞' : '点赞'}
              >{(it as any).liked ? '♥' : '♡'}</button>
              <button
                className="mini-btn"
                onClick={async (e) => {
                  e.stopPropagation();
                  const newVal = !(it as any).favorited;
                  try {
                    if (newVal) await addTag(it.id, 'favorite'); else await removeTag(it.id, 'favorite');
                    (it as any).favorited = newVal;
                  } catch {}
                }}
                title={(it as any).favorited ? '取消收藏' : '收藏'}
              >{(it as any).favorited ? '★' : '☆'}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="pager-status">{ws?.hasMore ? '向下滚动加载更多' : '已到底'}</div>
      <style>{styles}</style>
    </div>
  );
}

const styles = `
.grid-container { width: 100vw; height: 100vh; overflow: auto; background: #0f0f0f; color: #eee; }
.topbar { position: sticky; top: 0; background: rgba(20,20,20,0.9); padding: 12px 16px; backdrop-filter: saturate(1.2) blur(4px); z-index: 2; }
.title { font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; padding: 12px; }
.cell { display: block; padding: 0; margin: 0; border: none; background: transparent; cursor: pointer; }
.cell { position: relative; }
.cell img { width: 100%; height: 160px; object-fit: cover; border-radius: 6px; }
.cell-actions { position: absolute; bottom: 6px; right: 6px; display: flex; gap: 6px; }
.mini-btn { font-size: 12px; padding: 4px 6px; background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer; }
.mini-btn:hover { background: rgba(0,0,0,0.6); }
.loading, .empty, .pager-status { text-align: center; padding: 12px; font-size: 12px; opacity: 0.7; }
`;