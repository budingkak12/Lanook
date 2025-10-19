import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, RefreshControl, StatusBar, StyleSheet, TouchableOpacity, View, Text, Platform, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { VideoView, useVideoPlayer, useEvent } from 'react-native-video';
import { ThumbItem, fetchThumbnails, shuffleInPlace } from '../api';
import SmartImage from '../components/SmartImage';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const GAP = 2;
const NUM_COLS = 3; // 可按设备宽度/密度调整
const CELL = Math.floor((SCREEN_W - GAP * (NUM_COLS - 1)) / NUM_COLS);

export default function HomeScreen() {
  const [items, setItems] = useState<ThumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  // 与安卓原生一致的分页大小
  const limit = 20;
  const reachedEndRef = useRef(false);
  const noMoreRef = useRef(false);
  const [showDetail, setShowDetail] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const pagerRef = useRef<FlatList<ThumbItem>>(null);
  const isWeb = Platform.OS === 'web';
  const detailIndexRef = useRef(0);
  const lastNavAtRef = useRef(0);

  const load = useCallback(async (reset = false) => {
    if (loading) return;
    if (!reset && noMoreRef.current) return;
    setLoading(true);
    try {
      const data = await fetchThumbnails(reset ? 0 : offset, limit);
      const mixed = shuffleInPlace([...data]);
      setItems(prev => (reset ? mixed : [...prev, ...mixed]));
      setOffset(prev => (reset ? limit : prev + limit));
      if (reset) noMoreRef.current = false;
      if (!reset && mixed.length === 0) {
        noMoreRef.current = true;
      }
    } catch (e) {
      console.warn('load thumbnails failed', e);
    } finally {
      setLoading(false);
    }
  }, [loading, offset]);

  useEffect(() => {
    // 冷启动后延迟一帧触发，避免部分机型上 JS 引擎尚未就绪导致首轮 fetch 异常
    const t = setTimeout(() => load(true), 0);
    return () => clearTimeout(t);
  }, []);

  const selectedIndex = useMemo(() => {
    if (selectedId == null) return currentIndex;
    const idx = items.findIndex(it => String(it.id) === String(selectedId));
    return idx >= 0 ? idx : currentIndex;
  }, [items, selectedId, currentIndex]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const renderItem = useCallback(({ item, index }: { item: ThumbItem; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.cell}
      onPress={() => { setSelectedId(item.id); setCurrentIndex(index); setShowDetail(true); }}>
      <SmartImage source={{ uri: item.uri }} style={styles.img} resizeMode="cover" priority="low" />
    </TouchableOpacity>
  ), []);

  const keyExtractor = useCallback((it: ThumbItem) => String(it.id), []);
  const ItemSeparator = useMemo(() => <View style={{ height: GAP }} />, []);

  // 预加载相邻媒体（图片）
  const prefetchNeighbors = useCallback((centerIndex: number) => {
    const indices = [centerIndex - 2, centerIndex - 1, centerIndex + 1, centerIndex + 2];
    for (const i of indices) {
      if (i < 0 || i >= items.length) continue;
      const it = items[i];
      const url = it.resourceUrl || it.uri;
      if (!url) continue;
      if (it.type === 'video') {
        // Web: 轻量触发连接建立；原生端依赖系统缓存
        if (isWeb) {
          try { fetch(url, { method: 'HEAD' }).catch(() => {}); } catch {}
        }
      } else {
        if (isWeb) {
          try { const img = new (window as any).Image(); img.src = url; } catch {}
        } else {
          // 原生端仅使用 FastImage 预加载，不再回退到 Image.prefetch
          const FI = require('@d11/react-native-fast-image');
          if (FI && typeof FI.preload === 'function') {
            FI.preload([{ uri: url }]);
          }
        }
      }
    }
  }, [items, isWeb]);

  // 当选中项或数据变化时，确保详情页正确对齐到选中项
  useEffect(() => {
    if (!showDetail || !pagerRef.current) return;
    try {
      pagerRef.current.scrollToIndex({ index: selectedIndex, animated: false });
    } catch {}
    detailIndexRef.current = selectedIndex;
    // 初次进入详情立即预加载邻居
    prefetchNeighbors(selectedIndex);
  }, [showDetail, selectedIndex, prefetchNeighbors]);

  // Web 端详情页键盘切换：←/→、PgUp/PgDn、Home/End
  useEffect(() => {
    if (!showDetail || !isWeb) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'PageUp' || k === 'PageDown' || k === 'Home' || k === 'End') {
        // 阻止浏览器滚动，提升手感
        try { e.preventDefault(); } catch {}
        const now = Date.now();
        if ((e as any).repeat && now - lastNavAtRef.current < 60) return; // 简单节流
        lastNavAtRef.current = now;
        const cur = detailIndexRef.current;
        let target = cur;
        if (k === 'ArrowLeft' || k === 'PageUp') target = cur - 1;
        if (k === 'ArrowRight' || k === 'PageDown') target = cur + 1;
        if (k === 'Home') target = 0;
        if (k === 'End') target = items.length - 1;
        target = Math.max(0, Math.min(items.length - 1, target));
        if (target !== cur) {
          try {
            pagerRef.current?.scrollToIndex({ index: target, animated: true });
            detailIndexRef.current = target;
            prefetchNeighbors(target);
          } catch {}
        }
      }
    };
    window.addEventListener('keydown', onKey as any, { passive: false } as any);
    return () => window.removeEventListener('keydown', onKey as any);
  }, [showDetail, isWeb, items.length, prefetchNeighbors]);

  function VideoDetailPlayer({ uri }: { uri: string }) {
    // v7 正确形态：直接传字符串 URI 或 { uri }
    const player = useVideoPlayer(
      { uri },
      (p) => { p.loop = false; }
    );
    // 加载完成后自动开播，并记录错误便于排查
    useEvent(player, 'onLoad', () => { try { player.play(); } catch {} });
    useEvent(player, 'onError', (e: any) => { try { console.warn('[video] onError', e?.code, e?.message); } catch {} });
    return (
      <VideoView
        player={player}
        style={styles.detailImg}
        resizeMode={"contain" as any}
        controls
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <FlatList
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={NUM_COLS}
        initialNumToRender={36}
        windowSize={21}
        maxToRenderPerBatch={48}
        updateCellsBatchingPeriod={16}
        // Web 端移除裁剪以避免点击/命中区域异常
        removeClippedSubviews={Platform.OS === 'web' ? false : true}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!reachedEndRef.current) {
            reachedEndRef.current = true;
            load(false).finally(() => { reachedEndRef.current = false; });
          }
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#999" />}
        ItemSeparatorComponent={() => ItemSeparator}
        columnWrapperStyle={{ gap: GAP }}
      />

      {showDetail && (
        <View style={styles.detailWrap}>
          <FlatList
            ref={pagerRef}
            data={items}
            horizontal
            pagingEnabled
            style={styles.detailPager}
            initialScrollIndex={selectedIndex}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            initialNumToRender={3}
            windowSize={5}
            maxToRenderPerBatch={3}
            removeClippedSubviews={Platform.OS === 'web' ? false : true}
            keyExtractor={(it) => String(it.id)}
            onScrollToIndexFailed={(info) => {
              // 尝试延迟后再次定位，避免首帧还未测量完导致失败
              const wait = new Promise(res => setTimeout(res, 50));
              wait.then(() => pagerRef.current?.scrollToIndex({ index: info.index, animated: false })).catch(() => {});
            }}
            onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const offsetX = e.nativeEvent.contentOffset.x || 0;
              const idx = Math.round(offsetX / SCREEN_W);
              if (Number.isFinite(idx)) {
                detailIndexRef.current = Math.max(0, Math.min(items.length - 1, idx));
                prefetchNeighbors(detailIndexRef.current);
                // 详情页接近尾部时自动分页加载
                const remain = items.length - 1 - detailIndexRef.current;
                const threshold = Math.max(5, Math.floor(limit / 2));
                if (remain <= threshold && !loading && !noMoreRef.current) {
                  load(false);
                }
              }
            }}
            renderItem={({ item }) => (
              <View style={styles.detailPage}>
                {Platform.OS === 'web' ? (
                  item.type === 'video' ? (
                    // eslint-disable-next-line react/no-unknown-property
                    <video
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100vh', objectFit: 'contain' }}
                      src={item.resourceUrl || item.uri}
                      controls
                      autoPlay
                      muted
                      playsInline
                      preload="auto"
                    />
                  ) : (
                    <SmartImage source={{ uri: item.resourceUrl || item.uri }} style={styles.detailImg} resizeMode="contain" priority="high" />
                  )
                ) : (
                  item.type === 'video' ? (
                    <VideoDetailPlayer uri={item.resourceUrl || item.uri} />
                  ) : (
                    <SmartImage source={{ uri: item.resourceUrl || item.uri }} style={styles.detailImg} resizeMode="contain" priority="high" />
                  )
                )}
              </View>
            )}
          />
          <TouchableOpacity style={styles.detailClose} onPress={() => setShowDetail(false)}>
            <Text style={{ color: '#fff', fontSize: 16 }}>关闭</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  list: { padding: 0 },
  cell: { width: CELL, height: CELL, backgroundColor: '#111' },
  img: { width: '100%', height: '100%' },
  detailPager: { flex: 1 },
  detailWrap: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 999 },
  detailPage: { width: SCREEN_W, height: SCREEN_H, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  detailImg: { width: SCREEN_W, height: SCREEN_H },
  detailClose: { position: 'absolute', top: 48, right: 16, padding: 8, backgroundColor: '#0008', borderRadius: 6, zIndex: 1001 },
});
