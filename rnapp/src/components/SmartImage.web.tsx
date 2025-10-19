import React from 'react';
import { ImageStyle, StyleProp } from 'react-native';

type Source = { uri: string } | string;

type Props = {
  source: Source;
  style?: StyleProp<ImageStyle> | any;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  alt?: string;
  // 用于区分缩略图/详情等场景，调整 fetch 优先级
  priority?: 'low' | 'normal' | 'high';
};

export default function SmartImage({ source, style, resizeMode = 'cover', alt = '', priority = 'normal' }: Props) {
  const uri = typeof source === 'string' ? source : source?.uri || '';
  const objectFit = resizeMode === 'contain' ? 'contain' : resizeMode === 'cover' ? 'cover' : 'fill';
  // 将 RN 的 style 直接赋给 img 的 style；常见的宽高/定位可直接生效
  const fetchpriority = priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'auto';
  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      src={uri}
      style={{ objectFit, display: 'block', ...style }}
      decoding="async"
      loading="lazy"
      // @ts-ignore: fetchpriority is supported by Chromium/Edge/Safari
      fetchpriority={fetchpriority}
      alt={alt}
    />
  );
}

