"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { AlertCircle, ArrowLeft, Loader2, Users } from "lucide-react"
import { resolveApiUrl } from "@/lib/api"
import type { FaceCluster, FaceClusterMediaItem } from "@/lib/api"
import { getFaceClusterItems, getFaceClusters } from "@/lib/api"
import type { MediaItem } from "@/app/(main)/types"
import { MediaViewer } from "@/components/media-viewer"
import { SearchStandaloneButton } from "@/components/search/search-capsule"

function guessType(filename: string): "image" | "video" {
  const lower = (filename || "").toLowerCase()
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".mkv")) return "video"
  return "image"
}

function toMediaItem(item: FaceClusterMediaItem): MediaItem {
  const thumb = item.thumbnailUrl ? resolveApiUrl(item.thumbnailUrl) : `/media/${item.mediaId}/thumbnail`
  const resourceUrl = `/media-resource/${item.mediaId}`
  return {
    id: String(item.mediaId),
    mediaId: item.mediaId,
    type: guessType(item.filename),
    url: resourceUrl,
    resourceUrl,
    thumbnailUrl: thumb,
    filename: item.filename,
    createdAt: "",
    liked: false,
    favorited: false,
  }
}

type ViewMode = "list" | "detail"

export function PeopleView() {
  // 人物列表分页
  const [clusters, setClusters] = useState<FaceCluster[]>([])
  const [clusterOffset, setClusterOffset] = useState(0)
  const [clustersHasMore, setClustersHasMore] = useState(true)
  const [clustersLoading, setClustersLoading] = useState(false)
  const [clusterError, setClusterError] = useState<string | null>(null)

  // 人物详情列表分页
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [items, setItems] = useState<MediaItem[]>([])
  const [itemsOffset, setItemsOffset] = useState(0)
  const [itemsHasMore, setItemsHasMore] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemsLoadingMore, setItemsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 详情查看
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [mode, setMode] = useState<ViewMode>("list")

  const clustersLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const itemsLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const itemsRef = useRef<MediaItem[]>([])
  const clustersFetchingRef = useRef(false)
  const itemsFetchingRef = useRef(false)
  const clustersInitRef = useRef(false)

  const CLUSTER_PAGE_SIZE = 40
  const ITEM_PAGE_SIZE = 60

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const fetchClusters = useCallback(
    async (offset: number, mode: "replace" | "append" = "replace") => {
      if (clustersLoading || clustersFetchingRef.current) return 0
      const nextOffset = mode === "replace" ? 0 : offset
      try {
        clustersFetchingRef.current = true
        setClustersLoading(true)
        const data = await getFaceClusters({ offset: nextOffset, limit: CLUSTER_PAGE_SIZE })
        const list = Array.isArray((data as any).items) ? (data as any).items : (data as any)
        const payload = (list as FaceCluster[]) ?? []
        const hasMore = Array.isArray((data as any).items)
          ? Boolean((data as any).hasMore)
          : false
        const usedOffset = Array.isArray((data as any).items) ? (data as any).offset : nextOffset

        setClusters((prev) => (mode === "replace" ? payload : [...prev, ...payload]))
        setClusterOffset(usedOffset + payload.length)
        setClustersHasMore(hasMore)
        setClusterError(null)
        return payload.length
      } catch (err: any) {
        const msg = err?.message || "加载人物分组失败"
        setClusterError(msg)
        return 0
      } finally {
        setClustersLoading(false)
        clustersFetchingRef.current = false
      }
    },
    [CLUSTER_PAGE_SIZE, clustersLoading],
  )

  useEffect(() => {
    if (clustersInitRef.current) return
    clustersInitRef.current = true
    void fetchClusters(0, "replace")
  }, [fetchClusters])

  const loadMoreClusters = useCallback(() => {
    if (!clustersHasMore || clustersLoading) return
    void fetchClusters(clusterOffset, "append")
  }, [clusterOffset, clustersHasMore, clustersLoading, fetchClusters])

  const enterCluster = async (clusterId: number) => {
    try {
      setSelectedId(clusterId)
      setItems([])
      setItemsOffset(0)
      setItemsHasMore(true)
      setItemsLoading(true)
      setError(null)
      const data = await getFaceClusterItems(clusterId, { offset: 0, limit: ITEM_PAGE_SIZE })
      const list = (data?.items || []).map(toMediaItem)
      setItems(list)
      setItemsOffset((data?.offset ?? 0) + list.length)
      setItemsHasMore(Boolean(data?.hasMore))
      setMode("detail")
    } catch (err: any) {
      setError(err?.message || "加载该人物的照片失败")
    } finally {
      setItemsLoading(false)
    }
  }

  const fetchMoreItems = useCallback(
    async (clusterId: number, offset: number) => {
      if (itemsLoadingMore || itemsFetchingRef.current || !itemsHasMore) return 0
      try {
        itemsFetchingRef.current = true
        setItemsLoadingMore(true)
        const data = await getFaceClusterItems(clusterId, { offset, limit: ITEM_PAGE_SIZE })
        const list = (data?.items || []).map(toMediaItem)
        setItems((prev) => [...prev, ...list])
        const nextOffset = (data?.offset ?? offset) + list.length
        setItemsOffset(nextOffset)
        setItemsHasMore(Boolean(data?.hasMore))
        setError(null)
        return list.length
      } catch (err: any) {
        setError(err?.message || "加载更多照片失败")
        return 0
      } finally {
        setItemsLoadingMore(false)
        itemsFetchingRef.current = false
      }
    },
    [ITEM_PAGE_SIZE, itemsHasMore, itemsLoadingMore],
  )

  const selectedCluster = useMemo(
    () => clusters.find((c) => c.id === selectedId) || null,
    [clusters, selectedId],
  )

  const handleNavigate = useCallback(
    async (direction: "prev" | "next") => {
      if (viewerIndex === null) return
      const delta = direction === "next" ? 1 : -1
      let target = viewerIndex + delta
      if (target < 0) return

      if (target >= itemsRef.current.length) {
        if (!itemsHasMore || selectedId === null) return
        const added = await fetchMoreItems(selectedId, itemsOffset)
        if (added === 0) return
        target = Math.min(target, itemsRef.current.length - 1)
      }

      setViewerIndex(target)
    },
    [fetchMoreItems, itemsHasMore, itemsOffset, selectedId, viewerIndex],
  )

  const handleUpdate = (mediaId: number, updates: Partial<MediaItem>) => {
    setItems((prev) =>
      prev.map((m) => (m.mediaId === mediaId ? { ...m, ...updates } : m)),
    )
  }

  const handleRemove = (mediaIds: number[]) => {
    setItems((prev) => prev.filter((m) => !mediaIds.includes(m.mediaId)))
    if (viewerIndex !== null) {
      const nextLen = items.length - mediaIds.length
      if (nextLen === 0) {
        setViewerIndex(null)
      } else {
        setViewerIndex((idx) => {
          if (idx === null) return idx
          const next = Math.min(idx, nextLen - 1)
          return next
        })
      }
    }
  }

  // 人物列表无限滚动
  useEffect(() => {
    if (!clustersLoadMoreRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first?.isIntersecting && !clustersFetchingRef.current && !clustersLoading && clustersHasMore) {
          loadMoreClusters()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(clustersLoadMoreRef.current)
    return () => observer.disconnect()
  }, [loadMoreClusters])

  // 人物详情列表无限滚动
  useEffect(() => {
    if (!itemsLoadMoreRef.current || mode !== "detail") return
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first?.isIntersecting && selectedId !== null && !itemsFetchingRef.current && itemsHasMore) {
          void fetchMoreItems(selectedId, itemsOffset)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(itemsLoadMoreRef.current)
    return () => observer.disconnect()
  }, [fetchMoreItems, itemsOffset, mode, selectedId])

  const renderList = () => (
    <div className="h-full flex flex-col gap-3">
      {clusterError && clusters.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          {clusterError}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {clustersLoading && clusters.length === 0 && (
          <div className="col-span-full flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在加载人物分组...
          </div>
        )}
        {clusters.length === 0 && !clustersLoading && !clusterError && (
          <div className="col-span-full text-sm text-muted-foreground">
            暂无人脸分组，请先完成一次人脸聚类。
          </div>
        )}
        {clusters.map((c) => {
          const coverUrl = c.representativeMediaId
            ? resolveApiUrl(`/media/${c.representativeMediaId}/thumbnail`)
            : null
          return (
            <button
              key={c.id}
              className="group text-left rounded-lg border bg-card overflow-hidden hover:shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              onClick={() => enterCluster(c.id)}
            >
              <div className="aspect-[4/5] bg-muted relative">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt={c.label}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                    无封面
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
              </div>
              <div className="p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="w-4 h-4" />
                  <span className="truncate">{c.label}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  人脸 {c.faceCount}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div ref={clustersLoadMoreRef} className="h-12 flex items-center justify-center text-sm text-muted-foreground">
        {clustersHasMore ? (clustersLoading ? "正在加载更多..." : "下滑加载更多") : "已经到底了"}
      </div>
    </div>
  )

  const renderDetail = () => (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <SearchStandaloneButton
            onClick={() => {
              setMode("list")
              setSelectedId(null)
              setItems([])
              setItemsOffset(0)
              setItemsHasMore(true)
              setError(null)
            }}
            icon={<ArrowLeft className="w-5 h-5" strokeWidth={2.4} />}
            aria-label="返回"
            wrapperClassName="w-11"
          />
          <div className="text-base font-semibold">
            {selectedCluster ? `${selectedCluster.label} 的照片` : "人物照片"}
          </div>
        </div>
        {selectedCluster && (
          <div className="text-xs text-muted-foreground">
            共 {items.length} 张 | 人脸 {selectedCluster.faceCount}
          </div>
        )}
        {(itemsLoading || itemsLoadingMore) && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {error && (
        <div className="mb-1 flex items-center gap-2 text-sm text-red-500 px-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {!itemsLoading && selectedCluster && items.length === 0 && !error && (
        <div className="text-sm text-muted-foreground px-1">该人物暂时没有可展示的图片。</div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-px">
          {items.map((item, idx) => (
            <div
              key={`${item.id}-${item.thumbnailUrl ?? ""}`}
              className="group relative aspect-square overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              onClick={() => setViewerIndex(idx)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveApiUrl(item.thumbnailUrl || item.resourceUrl)}
                alt={item.filename}
                className="w-full h-full object-cover"
                loading={idx > 6 ? "lazy" : "eager"}
              />

              {item.type === "video" && (
                <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                  视频
                </div>
              )}
            </div>
          ))}
        </div>
        <div ref={itemsLoadMoreRef} className="h-12 flex items-center justify-center text-sm text-muted-foreground">
          {itemsHasMore ? (itemsLoadingMore ? "正在加载更多..." : "下滑加载更多") : "已经到底了"}
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">人物</span>
      </div>

      {mode === "list" ? renderList() : renderDetail()}

      {viewerIndex !== null && items[viewerIndex] && (
        <MediaViewer
          media={items[viewerIndex]}
          currentIndex={viewerIndex}
          allMedia={items}
          onClose={() => setViewerIndex(null)}
          onNavigate={(dir) => void handleNavigate(dir)}
          onMediaUpdate={handleUpdate}
          onMediaRemove={handleRemove}
          onIndexChange={(idx) => setViewerIndex(idx)}
          hasMore={itemsHasMore}
          isLoadingMore={itemsLoadingMore}
          onLoadMore={() => (selectedId ? fetchMoreItems(selectedId, itemsOffset) : Promise.resolve(0))}
        />
      )}
    </div>
  )
}
