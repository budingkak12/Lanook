import React from 'react';
type Props = { source: { uri: string }; style?: any; resizeMode?: any };
const FastImage: any = (_props: Props) => React.createElement('noscript');
FastImage.priority = { low: 'low', normal: 'normal', high: 'high' } as const;
FastImage.cacheControl = { immutable: 'immutable' } as const;
FastImage.preload = (_arr: Array<{ uri: string }>) => {};
export default FastImage;
export const priority = FastImage.priority;
export const cacheControl = FastImage.cacheControl;
