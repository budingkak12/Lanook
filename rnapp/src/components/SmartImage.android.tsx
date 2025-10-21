import React from 'react';
import { Image as RNImage, ImageStyle, StyleProp } from 'react-native';

type Source = { uri: string } | string;

type Props = {
  source: Source;
  style?: StyleProp<ImageStyle> | any;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  alt?: string; // Android 无此属性，保留以对齐 Web API
  priority?: 'low' | 'normal' | 'high';
};

// 运行时按需使用 FastImage；若不可用则回退到 RN Image。
let FastImage: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  FastImage = require('@d11/react-native-fast-image');
} catch {}

export default function SmartImage({ source, style, resizeMode = 'cover', priority = 'normal' }: Props) {
  const uri = typeof source === 'string' ? source : source?.uri || '';

  if (FastImage && typeof FastImage === 'object') {
    const fit = resizeMode === 'contain' ? FastImage.resizeMode.contain
      : resizeMode === 'center' ? FastImage.resizeMode.center
      : resizeMode === 'stretch' ? FastImage.resizeMode.stretch
      : FastImage.resizeMode.cover;
    const pr = priority === 'high' ? FastImage.priority.high
      : priority === 'low' ? FastImage.priority.low
      : FastImage.priority.normal;
    return (
      <FastImage
        source={{ uri, priority: pr }}
        style={style}
        resizeMode={fit}
      />
    );
  }

  return (
    <RNImage
      source={{ uri }}
      style={style}
      resizeMode={resizeMode as any}
    />
  );
}

