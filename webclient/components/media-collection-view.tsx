"use client"

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MutableRefObject,
  type ReactNode,
} from "react"

import type { MediaItem } from "@/app/(main)/types"
import { MediaViewer } from "@/components/media-viewer"
import type { MediaGridHandle } from "@/components/media-grid"

type MediaViewerProps = ComponentProps<typeof MediaViewer>

type MediaCollectionViewerOverrides = Partial<
  Omit<
    MediaViewerProps,
    |
      "media"
      | "allMedia"
      | "currentIndex"
      | "onClose"
      | "onNavigate"
      | "onMediaUpdate"
      | "onMediaRemove"
      | "onIndexChange"
      | "onLoadMore"
      | "hasMore"
      | "isLoadingMore"
  >
>

export type MediaCollectionHandle = {
  openAt: (index: number) => void
  closeViewer: () => void
  getItems: () => MediaItem[]
  getSelectedIndex: () => number
  refresh: () => Promise<number>
  loadMore: () => Promise<number>
}

export type MediaCollectionListRenderProps = {
  listRef: MutableRefObject<MediaGridHandle | null>
  onMediaClick: (media: MediaItem) => void
  onItemsChange: (items: MediaItem[]) => void
  selectedMediaId: number | null
  items: MediaItem[]
}

type MediaCollectionViewProps = {
  renderList: (props: MediaCollectionListRenderProps) => ReactNode
  collectionRef?: React.Ref<MediaCollectionHandle | null>
  className?: string
  autoOpenFirst?: boolean
  viewerOverrides?: MediaCollectionViewerOverrides
  viewerEnabled?: boolean
  onViewerOpen?: (media: MediaItem, index: number) => void
  onViewerClose?: () => void
}

const DEFAULT_AUTO_OPEN_ONCE = false

export function MediaCollectionView({
  renderList,
  collectionRef,
  className,
  autoOpenFirst = false,
  viewerOverrides,
  viewerEnabled = true,
  onViewerOpen,
  onViewerClose,
}: MediaCollectionViewProps) {
  const listRef = useRef<MediaGridHandle | null>(null)
  const [items, setItems] = useState<MediaItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const pendingIndexRef = useRef<number | null>(null)
  const autoOpenTriggeredRef = useRef(DEFAULT_AUTO_OPEN_ONCE)

  const currentMedia = useMemo(() => {
    if (selectedIndex < 0 || selectedIndex >= items.length) {
      return null
    }
    return items[selectedIndex]
  }, [items, selectedIndex])

  const currentMediaId = currentMedia?.mediaId ?? null

  const hasMore = listRef.current?.getHasMore?.() ?? false
  const isLoadingMore = listRef.current?.getIsLoadingMore?.() ?? false

  const handleItemsChange = useCallback((nextItems: MediaItem[]) => {
    setItems(nextItems)
  }, [])

  const handleMediaClick = useCallback(
    (media: MediaItem) => {
      pendingIndexRef.current = null
      const listItems = listRef.current?.getItems?.() ?? items
      const index = listItems.findIndex((item) => item.mediaId === media.mediaId)
      if (index === -1) {
        return
      }
      setItems(listItems)
      setSelectedIndex(index)
      autoOpenTriggeredRef.current = true
      onViewerOpen?.(listItems[index], index)
    },
    [items, onViewerOpen],
  )

  const closeViewer = useCallback(() => {
    pendingIndexRef.current = null
    if (selectedIndex !== -1) {
      setSelectedIndex(-1)
      onViewerClose?.()
    }
  }, [onViewerClose, selectedIndex])

  const openAt = useCallback(
    (index: number) => {
      if (index < 0) {
        closeViewer()
        return
      }
      const listItems = listRef.current?.getItems?.() ?? items
      if (index >= listItems.length) {
        pendingIndexRef.current = index
        void listRef.current?.loadMore?.()
        return
      }
      pendingIndexRef.current = null
      setItems(listItems)
      setSelectedIndex(index)
      autoOpenTriggeredRef.current = true
      onViewerOpen?.(listItems[index], index)
    },
    [closeViewer, items, onViewerOpen],
  )

  const refresh = useCallback(() => listRef.current?.refresh?.() ?? Promise.resolve(0), [])
  const loadMore = useCallback(() => listRef.current?.loadMore?.() ?? Promise.resolve(0), [])

  useImperativeHandle(
    collectionRef,
    () => ({
      openAt,
      closeViewer,
      getItems: () => listRef.current?.getItems?.() ?? items,
      getSelectedIndex: () => selectedIndex,
      refresh,
      loadMore,
    }),
    [closeViewer, items, loadMore, openAt, refresh, selectedIndex],
  )

  useEffect(() => {
    if (pendingIndexRef.current !== null) {
      const pendingIndex = pendingIndexRef.current
      if (pendingIndex < items.length) {
        pendingIndexRef.current = null
        setSelectedIndex(pendingIndex)
        autoOpenTriggeredRef.current = true
        const media = items[pendingIndex]
        if (media) {
          onViewerOpen?.(media, pendingIndex)
        }
        return
      }
    }

    if (items.length === 0) {
      pendingIndexRef.current = null
      autoOpenTriggeredRef.current = autoOpenFirst ? DEFAULT_AUTO_OPEN_ONCE : true
      if (selectedIndex !== -1) {
        setSelectedIndex(-1)
        onViewerClose?.()
      }
      return
    }

    if (autoOpenFirst && !autoOpenTriggeredRef.current) {
      autoOpenTriggeredRef.current = true
      setSelectedIndex(0)
      const firstMedia = items[0]
      if (firstMedia) {
        onViewerOpen?.(firstMedia, 0)
      }
      return
    }

    if (selectedIndex >= items.length && items.length > 0) {
      const adjustedIndex = items.length - 1
      setSelectedIndex(adjustedIndex)
      const media = items[adjustedIndex]
      if (media) {
        onViewerOpen?.(media, adjustedIndex)
      }
    }
  }, [autoOpenFirst, items, onViewerClose, onViewerOpen, selectedIndex])

  const handleNavigate = useCallback(
    async (direction: "prev" | "next") => {
      if (selectedIndex < 0) {
        return
      }

      let listItems = listRef.current?.getItems?.() ?? items
      if (listItems.length === 0) {
        return
      }

      const delta = direction === "next" ? 1 : -1
      let targetIndex = selectedIndex + delta

      if (targetIndex < 0) {
        return
      }

      const PRELOAD_THRESHOLD = 5
      const needsPreload =
        direction === "next" && targetIndex >= listItems.length - PRELOAD_THRESHOLD

      if (needsPreload || targetIndex >= listItems.length) {
        const added = (await listRef.current?.loadMore?.()) ?? 0
        if (added > 0) {
          listItems = listRef.current?.getItems?.() ?? items
        } else if (targetIndex >= listItems.length) {
          pendingIndexRef.current = null
        }
      }

      if (targetIndex >= listItems.length) {
        const listHasMore = listRef.current?.getHasMore?.() ?? false
        if (listHasMore) {
          pendingIndexRef.current = targetIndex
        }
        return
      }

      const nextMedia = listItems[targetIndex]
      if (!nextMedia) {
        return
      }

      pendingIndexRef.current = null
      setItems(listItems)
      setSelectedIndex(targetIndex)
      onViewerOpen?.(nextMedia, targetIndex)
    },
    [items, onViewerOpen, selectedIndex],
  )

  const handleMediaUpdate = useCallback((mediaId: number, updates: Partial<MediaItem>) => {
    listRef.current?.updateItem?.(mediaId, (prev) => ({ ...prev, ...updates }))
  }, [])

  const handleMediaRemove = useCallback(
    (mediaIds: number[]) => {
      if (mediaIds.length === 0) {
        return
      }
      const currentId = currentMediaId
      const wasViewerOpen = selectedIndex !== -1 && currentId !== null
      const beforeItems = listRef.current?.getItems?.() ?? items
      const removeSet = new Set(mediaIds)
      const nextItems = beforeItems.filter((item) => !removeSet.has(item.mediaId))

      pendingIndexRef.current = null
      listRef.current?.removeItems?.(mediaIds)

      if (!wasViewerOpen) {
        return
      }

      if (nextItems.length === 0) {
        closeViewer()
        return
      }

      // 保持在详情页：如果当前媒体被删，则展示“下一张”（在删除前的 index 位置）。
      // 如果当前媒体未被删，则定位回当前媒体在新列表里的位置（处理批量删除导致的 index 偏移）。
      let nextIndex = nextItems.findIndex((item) => item.mediaId === currentId)
      if (nextIndex === -1) {
        const beforeIndex = beforeItems.findIndex((item) => item.mediaId === currentId)
        nextIndex = Math.min(Math.max(beforeIndex, 0), nextItems.length - 1)
      }

      setItems(nextItems)
      setSelectedIndex(nextIndex)
      const nextMedia = nextItems[nextIndex]
      if (nextMedia) {
        onViewerOpen?.(nextMedia, nextIndex)
      }
    },
    [closeViewer, currentMediaId, items, onViewerOpen, selectedIndex],
  )

  const onLoadMore = useCallback(() => listRef.current?.loadMore?.() ?? Promise.resolve(0), [])

  const viewerProps: MediaViewerProps | null = useMemo(() => {
    if (!viewerEnabled || !currentMedia) {
      return null
    }

    const base: MediaViewerProps = {
      media: currentMedia,
      currentIndex: selectedIndex,
      allMedia: items,
      onClose: closeViewer,
      onNavigate: handleNavigate,
      onMediaUpdate: handleMediaUpdate,
      onMediaRemove: handleMediaRemove,
      onIndexChange: setSelectedIndex,
      onLoadMore,
      hasMore,
      isLoadingMore,
    }

    return {
      ...base,
      ...viewerOverrides,
    }
  }, [
    closeViewer,
    currentMedia,
    handleMediaRemove,
    handleMediaUpdate,
    handleNavigate,
    hasMore,
    isLoadingMore,
    items,
    onLoadMore,
    selectedIndex,
    viewerEnabled,
    viewerOverrides,
  ])

  return (
    <div className={className}>
      {renderList({
        listRef,
        onMediaClick: handleMediaClick,
        onItemsChange: handleItemsChange,
        selectedMediaId: currentMediaId,
        items,
      })}
      {viewerProps && <MediaViewer {...viewerProps} />}
    </div>
  )
}
