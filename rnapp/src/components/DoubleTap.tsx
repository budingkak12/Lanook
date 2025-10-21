import React, { useRef } from 'react';
import { GestureResponderEvent, Platform, Pressable, ViewStyle } from 'react-native';

type Props = {
  onDoubleTap: () => void;
  delay?: number; // ms
  style?: ViewStyle;
  children?: React.ReactNode;
};

// 轻量双击侦测组件：Web 端直接使用 onDoubleClick，原生端用时间阈值判定
export default function DoubleTap({ onDoubleTap, delay = 280, style, children }: Props) {
  const lastTap = useRef(0);

  if (Platform.OS === 'web') {
    return (
      <div onDoubleClick={onDoubleTap as any} style={style as any}>
        {children as any}
      </div>
    );
  }

  function onPress(_: GestureResponderEvent) {
    const now = Date.now();
    if (now - lastTap.current < delay) {
      lastTap.current = 0;
      try { onDoubleTap(); } catch {}
    } else {
      lastTap.current = now;
    }
  }

  return (
    <Pressable onPress={onPress} style={style}>
      {children}
    </Pressable>
  );
}

