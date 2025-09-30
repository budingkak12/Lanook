import React, { useEffect, useState } from 'react';
import Home from './pages/Home';
import TagGrid from './pages/TagGrid';
import { getState, navigateToHomeTab, openTagGrid, subscribe, backToGrid, onAppColdStart } from './store/workspaces';
import { listTags } from './lib/api';

export default function App() {
  const [, force] = useState(0);
  const [tags, setTags] = useState<string[]>(['like', 'favorite']);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribe(() => force((x) => x + 1));
    (async () => {
      try {
        try {
          const t = await listTags();
          if (Array.isArray(t.tags) && t.tags.length) setTags(t.tags);
        } catch {}
        const { sessionSeed } = getState();
        if (!sessionSeed) {
          await onAppColdStart();
        }
        setBootError(null);
      } catch (e: any) {
        console.error('App cold start failed', e);
        setBootError(e?.message || '初始化失败：后端可能未启动');
      }
    })();
    return () => unsub();
  }, []);

  const { currentView, activeWorkspace } = getState();

  return (
    <div className="app-root">
      <div className="nav">
        <button className="nav-btn" onClick={() => navigateToHomeTab()}>首页</button>
        <button className="nav-btn" onClick={async () => { try { await onAppColdStart(); setBootError(null); } catch (e:any) { setBootError(e?.message || '重新加载失败'); } }}>刷新数据</button>
        {tags.map((t) => (
          <button key={t} className="nav-btn" onClick={() => openTagGrid(t as 'like' | 'favorite')}>{t}</button>
        ))}
        {currentView === 'player' && activeWorkspace && activeWorkspace !== 'feed' ? (
          <button className="nav-btn" onClick={() => backToGrid()}>返回列表</button>
        ) : null}
      </div>
      {bootError && <div className="boot-error">{bootError}</div>}
      {currentView === 'player' ? <Home /> : <TagGrid />}
      <style>{styles}</style>
    </div>
  );
}

const styles = `
.app-root { width: 100vw; height: 100vh; }
.nav { position: fixed; top: 8px; right: 8px; z-index: 10; display: flex; gap: 8px; }
.nav-btn { font-size: 12px; background: rgba(255,255,255,0.08); color: #eee; border: 1px solid rgba(255,255,255,0.12); padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.nav-btn:hover { background: rgba(255,255,255,0.16); }
.boot-error { position: fixed; top: 40px; right: 8px; z-index: 10; font-size: 12px; color: #fff; background: #b00020; padding: 6px 8px; border-radius: 6px; }
`;