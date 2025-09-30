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

const DEFAULT_TUNER = {
  swipeThreshold: 30,
  animDuration: 320,
  animTranslate: 18,
  animOpacity: 0.18,
  animEasing: 'ease-out' as 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out',
  animMode: 'slide' as AnimationMode,
  scaleFrom: 0.9,
};

type AnimationMode = 'slide' | 'fade' | 'scale';

export default function Home() {
  const [, force] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [tunerConfig, setTunerConfig] = useState(DEFAULT_TUNER);

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
  const [playError, setPlayError] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'up' | 'down' | null>(null);
  const lastIndexRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const ext = useMemo(() => {
    const fn = current?.filename || '';
    const i = fn.lastIndexOf('.');
    return i >= 0 ? fn.slice(i + 1).toLowerCase() : '';
  }, [current?.filename]);
  const videoTypeAttr = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext === 'ogg' ? 'video/ogg' : '';
  const unsupported = current?.type === 'video' && !['mp4', 'webm', 'ogg'].includes(ext);

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
    if (deltaY < -tunerConfig.swipeThreshold) onSwipeUp();
    else if (deltaY > tunerConfig.swipeThreshold) onSwipeDown();
  };

  const loading = !ws || ws.isLoading && ws.mediaList.length === 0;

  useEffect(() => {
    if (!ws || !current) {
      lastIndexRef.current = null;
      setTransitionDirection(null);
      return;
    }
    const idx = ws.currentIndex;
    const prev = lastIndexRef.current;
    if (prev === null) {
      lastIndexRef.current = idx;
      return;
    }
    if (idx === prev) {
      return;
    }
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const direction: 'up' | 'down' = idx > prev ? 'up' : 'down';
    setTransitionDirection(null);
    rafRef.current = window.requestAnimationFrame(() => {
      setTransitionDirection(direction);
      transitionTimerRef.current = window.setTimeout(() => {
        setTransitionDirection(null);
        transitionTimerRef.current = null;
      }, tunerConfig.animDuration + 80);
    });
    lastIndexRef.current = idx;
  }, [ws?.currentIndex, current?.id, ws, current, tunerConfig.animDuration]);

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }
  }, []);

  return (
    <div className="home-container" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {loading && <div className="loading">加载中...</div>}
      {!loading && current && (
        <div className={`player ${transitionDirection ? `slide-${transitionDirection}` : ''}`}>
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
            <img className="media" src={current.resourceUrl} alt={current.filename} loading="lazy" />
          ) : (unsupported || playError) ? (
            <div className="fallback">
              <div>该视频格式（.{ext}）浏览器可能不支持，请下载或转码为 MP4(H.264/AAC)。</div>
              <a href={current.resourceUrl} target="_blank" rel="noreferrer">下载原视频</a>
            </div>
          ) : (
            <video
              className="media"
              ref={videoRef}
              key={current.id}
              src={current.resourceUrl}
              controls
              preload="metadata"
              poster={current.thumbnailUrl || undefined}
              crossOrigin="anonymous"
              muted
              playsInline
              autoPlay
              onTimeUpdate={(e) => updatePlaybackPosition((e.target as HTMLVideoElement).currentTime)}
              onError={(e) => {
                console.error('Video playback error', e);
                setPlayError(true);
              }}
              onEnded={() => resetPlaybackPosition()}
            >
              {videoTypeAttr && <source src={current.resourceUrl} type={videoTypeAttr} />}
            </video>
          )}
          <div className="hints">上滑下一条，下滑上一条；滚轮/键盘同规则</div>
        </div>
      )}
      {!loading && !current && <div className="empty">暂无内容</div>}
      <button className="tuner-toggle" onClick={() => setTunerOpen((v) => !v)}>{tunerOpen ? '收起参数' : '调参'}</button>
      {tunerOpen && (
        <div className="tuner-panel">
          <div className="tuner-row">
            <label>滑动阈值 (px)</label>
            <input
              type="range"
              min={10}
              max={120}
              value={tunerConfig.swipeThreshold}
              onChange={(e) => setTunerConfig((cfg) => ({ ...cfg, swipeThreshold: Number(e.target.value) }))}
            />
            <span>{tunerConfig.swipeThreshold}</span>
          </div>
          <div className="tuner-row">
            <label>动画时长 (ms)</label>
            <input
              type="range"
              min={2}
              max={800}
              value={tunerConfig.animDuration}
              onChange={(e) => setTunerConfig((cfg) => ({ ...cfg, animDuration: Number(e.target.value) }))}
            />
            <span>{tunerConfig.animDuration}</span>
          </div>
          <div className="tuner-row">
            <label>动效类型</label>
            <select
              value={tunerConfig.animMode}
              onChange={(e) => setTunerConfig((cfg) => ({ ...cfg, animMode: e.target.value as AnimationMode }))}
            >
              <option value="slide">slide（上下滑动）</option>
              <option value="fade">fade（淡入淡出）</option>
              <option value="scale">scale（缩放切换）</option>
            </select>
          </div>
          <div className="tuner-row">
            <label>上下位移 (vh)</label>
            <input
              type="range"
              min={0}
              max={40}
              value={tunerConfig.animTranslate}
              onChange={(e) => setTunerConfig((cfg) => ({ ...cfg, animTranslate: Number(e.target.value) }))}
              disabled={tunerConfig.animMode !== 'slide'}
            />
            <span>{tunerConfig.animMode === 'slide' ? tunerConfig.animTranslate : '—'}</span>
          </div>
          {tunerConfig.animMode === 'scale' && (
            <div className="tuner-row">
              <label>起始缩放</label>
              <input
                type="range"
                min={70}
                max={100}
                value={Math.round(tunerConfig.scaleFrom * 100)}
                onChange={(e) => setTunerConfig((cfg) => ({ ...cfg, scaleFrom: Number(e.target.value) / 100 }))}
              />
              <span>{tunerConfig.scaleFrom.toFixed(2)}</span>
            </div>
          )}
          <div className="tuner-row">
            <label>初始透明度</label>
            <input
              type="range"
              min={0}
              max={80}
              value={Math.round(tunerConfig.animOpacity * 100)}
              onChange={(e) => setTunerConfig((cfg) => ({ ...cfg, animOpacity: Number(e.target.value) / 100 }))}
            />
            <span>{tunerConfig.animOpacity.toFixed(2)}</span>
          </div>
          <div className="tuner-row">
            <label>动效曲线</label>
            <select
              value={tunerConfig.animEasing}
              onChange={(e) => setTunerConfig((cfg) => ({ ...cfg, animEasing: e.target.value as typeof cfg.animEasing }))}
            >
              <option value="linear">linear</option>
              <option value="ease">ease</option>
              <option value="ease-in">ease-in</option>
              <option value="ease-out">ease-out</option>
              <option value="ease-in-out">ease-in-out</option>
            </select>
          </div>
          <div className="tuner-actions">
            <button
              onClick={() => {
                setTunerConfig(DEFAULT_TUNER);
              }}
            >
              恢复默认
            </button>
          </div>
        </div>
      )}
      <DynamicStyles config={tunerConfig} />
    </div>
  );
}

type TunerConfig = typeof DEFAULT_TUNER;

function DynamicStyles({ config }: { config: TunerConfig }) {
  const { animDuration, animTranslate, animOpacity, animEasing, animMode, scaleFrom } = config;
  const easingId = animEasing.replace(/[^a-z]/gi, '') || 'easing';
  const idSuffix = `${animMode}_${animDuration}_${animTranslate}_${Math.round(animOpacity * 100)}_${Math.round(scaleFrom * 100)}_${easingId}`;
  const slideUpName = `slideUp_${idSuffix}`;
  const slideDownName = `slideDown_${idSuffix}`;
  const fadeUpName = `fadeUp_${idSuffix}`;
  const fadeDownName = `fadeDown_${idSuffix}`;
  const scaleUpName = `scaleUp_${idSuffix}`;
  const scaleDownName = `scaleDown_${idSuffix}`;

  let playerUpAnim = '';
  let playerDownAnim = '';
  let mediaModifiersUp = '';
  let mediaModifiersDown = '';
  let keyframes = '';

  if (animMode === 'slide') {
    playerUpAnim = `animation: ${slideUpName} ${animDuration}ms ${animEasing} both;`;
    playerDownAnim = `animation: ${slideDownName} ${animDuration}ms ${animEasing} both;`;
    mediaModifiersUp = `transform: translateY(-${animTranslate}vh); opacity: ${1 - (1 - animOpacity) * 0.3};`;
    mediaModifiersDown = `transform: translateY(${animTranslate}vh); opacity: ${1 - (1 - animOpacity) * 0.3};`;
    keyframes = `
@keyframes ${slideUpName} {
  from { transform: translateY(${animTranslate}vh); opacity: ${animOpacity}; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes ${slideDownName} {
  from { transform: translateY(-${animTranslate}vh); opacity: ${animOpacity}; }
  to { transform: translateY(0); opacity: 1; }
}
`;
  } else if (animMode === 'fade') {
    playerUpAnim = `animation: ${fadeUpName} ${animDuration}ms ${animEasing} both;`;
    playerDownAnim = `animation: ${fadeDownName} ${animDuration}ms ${animEasing} both;`;
    mediaModifiersUp = `opacity: ${1 - (1 - animOpacity) * 0.35};`;
    mediaModifiersDown = `opacity: ${1 - (1 - animOpacity) * 0.35};`;
    keyframes = `
@keyframes ${fadeUpName} {
  from { transform: translateY(0); opacity: ${animOpacity}; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes ${fadeDownName} {
  from { transform: translateY(0); opacity: ${animOpacity}; }
  to { transform: translateY(0); opacity: 1; }
}
`;
  } else {
    playerUpAnim = `animation: ${scaleUpName} ${animDuration}ms ${animEasing} both;`;
    playerDownAnim = `animation: ${scaleDownName} ${animDuration}ms ${animEasing} both;`;
    mediaModifiersUp = `transform: scale(${scaleFrom}); opacity: ${animOpacity};`;
    mediaModifiersDown = `transform: scale(${scaleFrom}); opacity: ${animOpacity};`;
    keyframes = `
@keyframes ${scaleUpName} {
  from { transform: scale(${scaleFrom}); opacity: ${animOpacity}; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes ${scaleDownName} {
  from { transform: scale(${scaleFrom}); opacity: ${animOpacity}; }
  to { transform: scale(1); opacity: 1; }
}
`;
  }

  const styleContent = `
.home-container { width: 100vw; height: 100vh; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #111; color: #eee; position: relative; }
.player { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; will-change: transform, opacity; }
.player.slide-up { ${playerUpAnim} }
.player.slide-down { ${playerDownAnim} }
.media { height: 100vh; width: auto; max-width: 100vw; object-fit: contain; position: relative; z-index: 1; transition: transform ${animDuration}ms ${animEasing}, opacity ${animDuration}ms ${animEasing}; }
.player.slide-up .media { ${mediaModifiersUp} }
.player.slide-down .media { ${mediaModifiersDown} }
.meta { position: absolute; top: 16px; left: 16px; font-size: 12px; opacity: 0.9; z-index: 3; pointer-events: auto; }
.filename { font-weight: 600; }
.actions { margin-top: 8px; display: flex; gap: 8px; }
.action { font-size: 12px; background: rgba(255,255,255,0.08); color: #eee; border: 1px solid rgba(255,255,255,0.12); padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.action:hover { background: rgba(255,255,255,0.16); }
.loading, .empty { font-size: 16px; opacity: 0.8; }
.hints { position: absolute; bottom: 16px; font-size: 12px; opacity: 0.6; z-index: 2; }
.fallback { display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; color: #ccc; }
.tuner-toggle { position: fixed; bottom: 16px; right: 16px; z-index: 15; background: rgba(0,0,0,0.55); color: #eee; border: 1px solid rgba(255,255,255,0.2); padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; }
.tuner-panel { position: fixed; bottom: 56px; right: 16px; z-index: 15; background: rgba(0,0,0,0.75); color: #eee; padding: 12px; border-radius: 10px; width: min(280px, 90vw); backdrop-filter: blur(4px); display: flex; flex-direction: column; gap: 10px; font-size: 12px; }
.tuner-row { display: grid; grid-template-columns: 90px 1fr 40px; align-items: center; gap: 8px; }
.tuner-row label { color: #bbb; }
.tuner-row input[type="range"] { width: 100%; }
.tuner-row span { text-align: right; color: #fff; }
.tuner-row select { width: 100%; background: rgba(255,255,255,0.08); color: #eee; border: 1px solid rgba(255,255,255,0.2); padding: 4px; border-radius: 6px; }
.tuner-row select { width: 100%; background: rgba(255,255,255,0.08); color: #eee; border: 1px solid rgba(255,255,255,0.2); padding: 4px; border-radius: 6px; }
.tuner-actions { display: flex; justify-content: flex-end; }
.tuner-actions button { font-size: 12px; padding: 4px 10px; background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; cursor: pointer; }
.tuner-actions button:hover { background: rgba(255,255,255,0.2); }
${keyframes}
`;
  return <style>{styleContent}</style>;
}
