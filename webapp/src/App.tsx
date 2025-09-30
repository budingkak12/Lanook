import React, { useCallback, useEffect, useState } from 'react';
import Home from './pages/Home';
import TagGrid from './pages/TagGrid';
import { getState, navigateToHomeTab, openTagGrid, subscribe, backToGrid, onAppColdStart } from './store/workspaces';
import { listTags, getApiBase, setApiBase, postSession } from './lib/api';

export default function App() {
  const [, force] = useState(0);
  const [tags, setTags] = useState<string[]>(['like', 'favorite']);
  const [bootError, setBootError] = useState<string | null>(null);
  const [diag, setDiag] = useState<string>('');
  const [apiBaseDisplay, setApiBaseDisplay] = useState<string | undefined>(() => getApiBase());

  const runBoot = useCallback(async () => {
    try {
      try {
        const t = await listTags();
        if (Array.isArray(t.tags) && t.tags.length) setTags(t.tags);
      } catch {}
      await onAppColdStart();
      setBootError(null);
      setApiBaseDisplay(getApiBase());
    } catch (e: any) {
      console.error('App cold start failed', e);
      const message = e?.message || '初始化失败：后端可能未启动';
      const currentBase = getApiBase();
      setBootError(currentBase ? `${message}（当前 API：${currentBase}）` : message);
      setApiBaseDisplay(currentBase);
    }
  }, [setTags, setBootError]);

  useEffect(() => {
    const unsub = subscribe(() => force((x) => x + 1));
    void runBoot();
    return () => unsub();
  }, [runBoot]);

  const { currentView, activeWorkspace } = getState();

  return (
    <div className="app-root">
      <div className="nav">
        <button className="nav-btn" onClick={() => navigateToHomeTab()}>首页</button>
        <button className="nav-btn" onClick={() => { void runBoot(); }}>刷新数据</button>
        <button
          className="nav-btn"
          onClick={() => {
            const cur = getApiBase() || '';
            const v = window.prompt('设置 API 基址（如 http://192.168.1.100:8000），留空恢复默认', cur);
            if (v !== null) {
              const val = v.trim();
              const saved = setApiBase(val || null);
              if (saved) {
                window.alert(`已保存 API 基址：${saved}`);
              } else {
                window.alert('已恢复默认 API 基址。');
              }
              setApiBaseDisplay(getApiBase());
              void runBoot();
            }
          }}
        >设置</button>
        <button
          className="nav-btn"
          onClick={async () => {
            const currentBase = getApiBase();
            setApiBaseDisplay(currentBase);
            setDiag(`测试中... 当前 API：${currentBase || '默认（相对路径）'}`);
            try {
              const resp = await postSession('diagnostic-probe');
              setDiag(`成功：session_seed=${resp.session_seed}（API：${currentBase || '默认'}）`);
            } catch (e: any) {
              console.error('Diagnostic session failed', e);
              const msg = e?.message || String(e);
              setDiag(`失败：${msg}（API：${currentBase || '默认'}）`);
            }
          }}
        >测试连接</button>
        {tags.map((t) => (
          <button key={t} className="nav-btn" onClick={() => openTagGrid(t as 'like' | 'favorite')}>{t}</button>
        ))}
        {currentView === 'player' && activeWorkspace && activeWorkspace !== 'feed' ? (
          <button className="nav-btn" onClick={() => backToGrid()}>返回列表</button>
        ) : null}
      </div>
      <div className="boot-info">
        <div>当前 API：{apiBaseDisplay || '默认（相对路径）'}</div>
        {diag && <div className="diag">{diag}</div>}
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
.boot-info { position: fixed; top: 48px; left: 8px; z-index: 10; font-size: 12px; color: #eee; background: rgba(0,0,0,0.4); padding: 6px 8px; border-radius: 6px; max-width: 80vw; word-break: break-all; }
.diag { margin-top: 4px; color: #ffb347; }
.boot-error { position: fixed; top: 40px; right: 8px; z-index: 10; font-size: 12px; color: #fff; background: #b00020; padding: 6px 8px; border-radius: 6px; }
`;
