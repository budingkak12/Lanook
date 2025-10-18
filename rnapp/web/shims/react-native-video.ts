import React, { useEffect } from 'react';
// Web 端占位：实际渲染逻辑由页面里的 <video> 实现。
// 提供与 v7 API 兼容的导出以避免类型/打包错误。
export const VideoView: React.FC<{ player?: any; style?: any; resizeMode?: any; controls?: boolean }>
  = () => React.createElement('noscript');
export function useVideoPlayer(_opts?: any, _config?: (p: any) => void): any {
  return {};
}
// 事件订阅占位：在 Web 端不做任何事，仅保持 hooks 依赖一致
export function useEvent(_player: any, _event: string, _handler: (...args: any[]) => void): void {
  // no-op to satisfy API shape
  useEffect(() => {}, [_player, _event, _handler]);
}
export default VideoView;
