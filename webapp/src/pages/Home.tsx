import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getState,
  onSwipeDown,
  onSwipeUp,
  resetPlaybackPosition,
  subscribe,
  updatePlaybackPosition,
} from '../store/workspaces';
import { setTagForCurrent } from '../store/workspaces';

const SWIPE_THRESHOLD = 30; // pixels

export default function Home() {
  const [, force] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const unsub = subscribe(() => force((x) => x + 1));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') onSwipeUp();
      else if (e.key === 'ArrowDown') onSwipeDown();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) onSwipeUp();
      else if (e.deltaY < 0) onSwipeDown();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      unsub();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  const { activeWorkspace, workspaces } = getState();
  const ws = activeWorkspace ? workspaces[activeWorkspace] : null;
  const current = ws && ws.mediaList[ws.currentIndex];

  useEffect(() => {
    if (!current) return;
    // Auto-play current item when changes
    if (current.type === 'video' && videoRef.current) {
      const saved: any = current as any;
      if (saved.playbackPosition && saved.playbackPosition > 0) {
        videoRef.current.currentTime = saved.playbackPosition;
      }
      // Attempt autoplay; browsers may require user gesture
      videoRef.current.play().catch(() => {});
    }
  }, [current?.id]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.changedTouches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (deltaY < -SWIPE_THRESHOLD) onSwipeUp();
    else if (deltaY > SWIPE_THRESHOLD) onSwipeDown();
  };

  const loading = !ws || ws.isLoading && ws.mediaList.length === 0;

  return (
    <div className="home-container" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {loading && <div className="loading">加载中...</div>}
      {!loading && current && (
        <div className="player">
          <div className="meta">
            <div className="filename">{current.filename}</div>
            <div className="created">{new Date(current.createdAt).toLocaleString()}</div>
            <div className="index">{ws!.currentIndex + 1} / {ws!.mediaList.length}</div>
            <div className="actions">
              <button className="action" onClick={() => setTagForCurrent('like', !(current as any).liked)}>
                {(current as any).liked ? '取消点赞' : '点赞'}
              </button>
              <button className="action" onClick={() => setTagForCurrent('favorite', !(current as any).favorited)}>
                {(current as any).favorited ? '取消收藏' : '收藏'}
              </button>
            </div>
          </div>
          {current.type === 'image' ? (
            <img className="media" src={current.resourceUrl} alt={current.filename} />
          ) : (
            <video
              className="media"
              ref={videoRef}
              src={current.resourceUrl}
              controls
              autoPlay
              onTimeUpdate={(e) => updatePlaybackPosition((e.target as HTMLVideoElement).currentTime)}
              onEnded={() => resetPlaybackPosition()}
            />
          )}
          <div className="hints">上滑下一条，下滑上一条；滚轮/键盘同规则</div>
        </div>
      )}
      {!loading && !current && <div className="empty">暂无内容</div>}
      <style>{styles}</style>
    </div>
  );
}

const styles = `
.home-container { width: 100vw; height: 100vh; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #111; color: #eee; position: relative; }
.player { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
.media { height: 100vh; width: auto; max-width: 100vw; object-fit: contain; }
.meta { position: absolute; top: 16px; left: 16px; font-size: 12px; opacity: 0.9; }
.filename { font-weight: 600; }
.actions { margin-top: 8px; display: flex; gap: 8px; }
.action { font-size: 12px; background: rgba(255,255,255,0.08); color: #eee; border: 1px solid rgba(255,255,255,0.12); padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.action:hover { background: rgba(255,255,255,0.16); }
.loading, .empty { font-size: 16px; opacity: 0.8; }
.hints { position: absolute; bottom: 16px; font-size: 12px; opacity: 0.6; }
`;