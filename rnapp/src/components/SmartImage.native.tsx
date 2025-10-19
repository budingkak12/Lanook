import React from 'react';
import { ImageStyle, StyleProp } from 'react-native';
import FastImage from '@d11/react-native-fast-image';

type Source = { uri: string } | string;

type Props = {
  source: Source;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  priority?: 'low' | 'normal' | 'high';
};

export default function SmartImage({ source, style, resizeMode = 'cover', priority = 'normal' }: Props) {
  const uri = typeof source === 'string' ? source : (source as any)?.uri || '';
  const prio = priority === 'high' ? FastImage.priority.high : priority === 'low' ? FastImage.priority.low : FastImage.priority.normal;
  return (
    <FastImage
      source={{ uri, priority: prio, cache: FastImage.cacheControl.immutable }}
      style={style as any}
      resizeMode={resizeMode as any}
    />
  );
}
