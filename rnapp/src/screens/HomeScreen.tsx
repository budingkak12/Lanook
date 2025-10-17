import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, RefreshControl, StatusBar, StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { ThumbItem, fetchThumbnails, shuffleInPlace } from '../api';

const { width: SCREEN_W } = Dimensions.get('window');
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const renderItem = useCallback(({ item, index }: { item: ThumbItem; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.cell}
      onPress={() => { setCurrentIndex(index); setShowDetail(true); }}>
      <Image source={{ uri: item.uri }} style={styles.img} resizeMode="cover" />
    </TouchableOpacity>
  ), []);

  const keyExtractor = useCallback((it: ThumbItem, idx: number) => `${it.id}-${idx}`, []);
  const ItemSeparator = useMemo(() => <View style={{ height: GAP }} />, []);

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
        removeClippedSubviews
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
        <View style={styles.detailWrap} pointerEvents="auto">
          <FlatList
            ref={pagerRef}
            data={items}
            horizontal
            pagingEnabled
            initialScrollIndex={currentIndex}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            keyExtractor={(it, i) => `${it.id}-${i}`}
            renderItem={({ item }) => (
              <View style={styles.detailPage}>
                <Image source={{ uri: item.resourceUrl || item.uri }} style={styles.detailImg} resizeMode="contain" />
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
  detailWrap: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  detailPage: { width: SCREEN_W, height: '100%', alignItems: 'center', justifyContent: 'center' },
  detailImg: { width: SCREEN_W, height: '100%' },
  detailClose: { position: 'absolute', top: 48, right: 16, padding: 8, backgroundColor: '#0008', borderRadius: 6 },
});
