import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, RefreshControl, StatusBar, StyleSheet, TouchableOpacity, View, Text, Platform } from 'react-native';
import { VideoView, useVideoPlayer, useEvent } from 'react-native-video';
import { ThumbItem, fetchThumbnails, shuffleInPlace } from '../api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const GAP = 2;
const NUM_COLS = 3; // 可按设备宽度/密度调整
const CELL = Math.floor((SCREEN_W - GAP * (NUM_COLS - 1)) / NUM_COLS);

export default function HomeScreen() {
  const [items, setItems] = useState<ThumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 90;
  const reachedEndRef = useRef(false);
  const [showDetail, setShowDetail] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const pagerRef = useRef<FlatList<ThumbItem>>(null);

  const load = useCallback(async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await fetchThumbnails(reset ? 0 : offset, limit);
      const mixed = shuffleInPlace([...data]);
      setItems(prev => (reset ? mixed : [...prev, ...mixed]));
      setOffset(prev => (reset ? limit : prev + limit));
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

  // 当选中项或数据变化时，确保详情页正确对齐到选中项
  useEffect(() => {
    if (!showDetail || !pagerRef.current) return;
    try {
      pagerRef.current.scrollToIndex({ index: selectedIndex, animated: false });
    } catch {}
  }, [showDetail, selectedIndex]);

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
      <Image source={{ uri: item.uri }} style={styles.img} resizeMode="cover" />
    </TouchableOpacity>
  ), []);

  const keyExtractor = useCallback((it: ThumbItem) => String(it.id), []);
  const ItemSeparator = useMemo(() => <View style={{ height: GAP }} />, []);

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
            keyExtractor={(it) => String(it.id)}
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
                    // eslint-disable-next-line react/no-unknown-property
                    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
                      {/* eslint-disable-next-line jsx-a11y/alt-text */}
                      <img src={item.resourceUrl || item.uri} style={{ height: '100vh', width: 'auto', display: 'block' }} />
                    </div>
                  )
                ) : (
                  item.type === 'video' ? (
                    <VideoDetailPlayer uri={item.resourceUrl || item.uri} />
                  ) : (
                    <Image source={{ uri: item.resourceUrl || item.uri }} style={styles.detailImg} resizeMode="contain" />
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
