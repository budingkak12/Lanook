"use client"

import type React from "react"

import { useMemo, useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react"
import type { MediaItem } from "@/app/(main)/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Trash2, X, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { apiFetch, batchDeleteMedia, friendlyDeleteError, resolveApiUrl } from "@/lib/api"
import { hasSeenDeleteConfirm, markSeenDeleteConfirm } from "@/lib/delete-confirm"
import { FloatingDeleteButton } from "@/components/media-grid/floating-delete-button"
import { SelectionPreviewDialog } from "@/components/media-grid/selection-preview-dialog"

type MediaGridProps = {
  sessionId?: string | null
  /**
   * 当提供 tag 时走标签搜索模式。
   */
  tag?: string | null
  /**
   * 当提供 queryText 时走文本检索（可与 tag 组合），不要求 sessionId。
   */
  queryText?: string | null
  onMediaClick: (media: MediaItem) => void
  onItemsChange?: (items: MediaItem[]) => void
  /**
   * 调试/无后端时使用，走内置假数据，不触发任何接口。
   */
  mockMode?: boolean
  /**
   * 多选交互模式：
   * - legacy：沿用旧的“勾选框 + 顶部删除栏”逻辑；
   * - desktop：支持 Shift 区间选择 + 拖拽框选（所见即可选），并通过悬浮按钮触发“测试删除弹窗”。
   */
  selectionBehavior?: "legacy" | "desktop"
  /**
   * 删除行为：
   * - backend：调用后端批量删除接口；
   * - preview：不调用后端，仅弹窗预览选中项（用于联调/确认选择范围）。
   */
  deleteBehavior?: "backend" | "preview"
}

type MediaListItem = {
  id: number
  type: "image" | "video"
  url: string
  resourceUrl: string
  filename: string
  createdAt: string
  thumbnailUrl?: string | null
  liked?: boolean
  favorited?: boolean
}

type MediaListResponse = {
  items: MediaListItem[]
  offset: number
  hasMore: boolean
}

const PAGE_SIZE = 20

export type MediaGridHandle = {
  refresh: () => Promise<number>
  loadMore: () => Promise<number>
  getItems: () => MediaItem[]
  updateItem: (mediaId: number, updater: Partial<MediaItem> | ((prev: MediaItem) => MediaItem)) => void
  removeItems: (mediaIds: number[]) => void
  getHasMore: () => boolean
  getIsLoadingMore: () => boolean
}

export const MediaGrid = forwardRef<MediaGridHandle, MediaGridProps>(function MediaGrid(
  {
    sessionId = null,
    tag = null,
    queryText = null,
    onMediaClick,
    onItemsChange,
    mockMode = false,
    selectionBehavior = "legacy",
    deleteBehavior = "backend",
  },
  ref,
) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [isInitialLoading, setIsInitialLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [dontAskDeleteAgain, setDontAskDeleteAgain] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const { toast } = useToast()
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fetchingRef = useRef(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const anchorIndexRef = useRef<number | null>(null)
  const dragStateRef = useRef<{
    active: boolean
    pointerId: number
    startX: number
    startY: number
    additive: boolean
    subtractive: boolean
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingBoxRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)

  const resetSelection = useCallback(() => {
    setSelectedIds(new Set())
    setIsSelectionMode(false)
    setShowDeleteDialog(false)
    setShowPreviewDialog(false)
    anchorIndexRef.current = null
  }, [])

  const isDesktopSelection = selectionBehavior === "desktop"
  const isPreviewDelete = deleteBehavior === "preview"

  const generateMockItems = useCallback((offset: number, limit: number): MediaItem[] => {
    const mockTotal = 60
    const items: MediaItem[] = []
    const start = offset
    const end = Math.min(offset + limit, mockTotal)
    for (let i = start; i < end; i++) {
      const id = i + 1
      const seed = (i % 20) + 1
      const imageUrl = `https://picsum.photos/seed/lanook-${seed}/800/600`
      items.push({
        id: String(id),
        mediaId: id,
        type: "image",
        url: imageUrl,
        resourceUrl: imageUrl,
        thumbnailUrl: imageUrl,
        filename: `mock_image_${id}.jpg`,
        createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
        liked: (i % 7) === 0,
        favorited: (i % 11) === 0,
      })
    }
    return items
  }, [])

  const normalizeItems = useCallback((items: MediaListItem[]): MediaItem[] => {
    return items.map((item) => {
      const resourceUrl = item.resourceUrl || item.url || `/media-resource/${item.id}`
      return {
        id: String(item.id),
        mediaId: item.id,
        type: item.type === "video" ? "video" : "image",
        url: resourceUrl,
        resourceUrl,
        thumbnailUrl: item.thumbnailUrl ?? null,
        filename: item.filename,
        createdAt: item.createdAt,
        liked: item.liked ?? false,
        favorited: item.favorited ?? false,
      }
    })
  }, [])

  const fetchMedia = useCallback(
    async (offset: number, mode: "replace" | "append" = "replace", currentSessionId?: string) => {
      const trimmedTag = tag?.trim() ?? ""
      const trimmedQuery = queryText?.trim() ?? ""
      const isTagMode = trimmedTag.length > 0
      const isQueryMode = trimmedQuery.length > 0
      const effectiveSessionId = currentSessionId || sessionId

      // 无标签、无文本时才需要 seed；有文本则允许无 sessionId
      if (!mockMode) {
        if (!isTagMode && !isQueryMode && !effectiveSessionId) {
          setMediaItems([])
          setHasMore(false)
          setError("尚未获取会话，请稍候重试。")
          return 0
        }
        if (isTagMode && trimmedTag.length === 0) {
          setMediaItems([])
          setHasMore(false)
          setError(null)
          return 0
        }
      }

      if (fetchingRef.current) {
        return 0
      }
      fetchingRef.current = true

      if (mode === "replace") {
        setIsInitialLoading(true)
        setError(null)
      } else {
        setIsLoadingMore(true)
      }

      const controller = new AbortController()
      abortRef.current = controller

      try {
        if (mockMode) {
          const mockItems = generateMockItems(offset, PAGE_SIZE)
          let addedCount = 0
          setMediaItems((prev) => {
            if (mode === "replace") {
              addedCount = mockItems.length
              return mockItems
            }
            addedCount = mockItems.length
            return [...prev, ...mockItems]
          })
          const hasMoreMock = offset + PAGE_SIZE < 60
          setHasMore(hasMoreMock)
          setError(null)
          return addedCount
        }

        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(PAGE_SIZE),
        })
        if (isQueryMode) {
          params.set("query_text", trimmedQuery)
          if (isTagMode) {
            params.set("tag", trimmedTag)
          }
        } else if (isTagMode) {
          params.set("tag", trimmedTag)
        } else {
          params.set("seed", effectiveSessionId!)
          params.set("order", "seeded")
        }

        const response = await apiFetch(`/media-list?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) {
          let message = `获取媒体列表失败：${response.status}`
          try {
            const data = await response.json()
            if (typeof data?.detail === "string") {
              message = data.detail
            }
          } catch {
            // ignore
          }
          throw new Error(message)
        }
        const data = (await response.json()) as MediaListResponse
        const nextItems = normalizeItems(data.items)
        let addedCount = 0
        setMediaItems((prev) => {
          const seen = new Set(prev.map((item) => item.id))
          const uniqueNext = nextItems.filter((item) => !seen.has(item.id))
          if (mode === "replace") {
            const uniqueReplace: MediaItem[] = []
            const replaceSeen = new Set<string>()
            for (const item of nextItems) {
              if (replaceSeen.has(item.id)) continue
              replaceSeen.add(item.id)
              uniqueReplace.push(item)
            }
            addedCount = uniqueReplace.length
            return uniqueReplace
          }
          addedCount = uniqueNext.length
          return [...prev, ...uniqueNext]
        })
        // 防御：追加模式下如果服务端返回空数组，无论 hasMore 如何都停止继续加载，避免无限轮询。
        setHasMore(mode === "append" && nextItems.length === 0 ? false : data.hasMore)
        setError(null)
        return addedCount
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return 0
        }
        const message = err instanceof Error ? err.message : "加载失败"
        setError(message)
        toast({
          title: "媒体加载失败",
          description: message,
        })
      } finally {
        fetchingRef.current = false
        if (mode === "replace") {
          setIsInitialLoading(false)
        } else {
          setIsLoadingMore(false)
        }
      }
      return 0
    },
    [mockMode, normalizeItems, sessionId, tag, queryText, toast, generateMockItems],
  )

  useEffect(() => {
    const trimmedTag = tag?.trim() ?? ""
    const trimmedQuery = queryText?.trim() ?? ""
    setMediaItems([])
    setHasMore(
      mockMode || trimmedTag.length > 0 || trimmedQuery.length > 0 || !!sessionId,
    )
    resetSelection()
    setError(null)
    abortRef.current?.abort()

    if (!mockMode && !sessionId && trimmedTag.length === 0 && trimmedQuery.length === 0) {
      return
    }

    // 使用 setTimeout 来避免 React StrictMode 的双重执行问题
    const timeoutId = setTimeout(() => {
      fetchMedia(0, "replace", sessionId ?? undefined)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      abortRef.current?.abort()
      fetchingRef.current = false
    }
  }, [sessionId, fetchMedia, resetSelection, refreshVersion, tag, queryText, mockMode])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const handleSourcesChanged = () => {
      resetSelection()
      setHasMore(true)
      setMediaItems([])
      setError(null)
      setRefreshVersion((prev) => prev + 1)
    }
    window.addEventListener("media-sources-changed", handleSourcesChanged)
    return () => {
      window.removeEventListener("media-sources-changed", handleSourcesChanged)
    }
  }, [resetSelection])

  useEffect(() => {
    if (!loadMoreRef.current) {
      return
    }

    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (
          first?.isIntersecting &&
          hasMore &&
          !isInitialLoading &&
          !isLoadingMore &&
          !fetchingRef.current &&
          !error
        ) {
          fetchMedia(mediaItems.length, "append")
        }
      },
      { threshold: 0.1 },
    )

    observerRef.current.observe(loadMoreRef.current)

    return () => {
      observerRef.current?.disconnect()
    }
  }, [fetchMedia, hasMore, isInitialLoading, isLoadingMore, mediaItems.length, error])

  const handleCheckboxClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isSelectionMode) {
      setIsSelectionMode(true)
    }

    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      if (newSet.size === 0) {
        setIsSelectionMode(false)
      }
      return newSet
    })
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0 || isDeleting) {
      return
    }
    if (isPreviewDelete) {
      setShowPreviewDialog(true)
      return
    }
    if (mockMode) {
      toast({ title: "当前为动画预览模式", description: "已跳过删除接口调用" })
      setShowDeleteDialog(false)
      setIsSelectionMode(false)
      return
    }
    const ids = Array.from(selectedIds)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value))
    if (ids.length === 0) {
      setShowDeleteDialog(false)
      return
    }

    setIsDeleting(true)
    try {
      if (dontAskDeleteAgain) {
        markSeenDeleteConfirm()
      }
      const result = await batchDeleteMedia(ids)
      const deletedSet = new Set(result.deleted.map((id) => String(id)))

      if (deletedSet.size > 0) {
        setMediaItems((prev) => prev.filter((item) => !deletedSet.has(item.id)))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          deletedSet.forEach((id) => next.delete(id))
          return next
        })
        toast({
          title: "删除成功",
          description: `已删除 ${deletedSet.size} 个项目`,
        })
      }

      if (result.failed.length > 0) {
        const failedIds = result.failed.map((item) => String(item.id))
        const friendly = friendlyDeleteError(result.failed.map((item) => item.reason))
        setSelectedIds(new Set(failedIds))
        setIsSelectionMode(true)
        toast({
          title: "删除失败",
          description: friendly ?? `有 ${result.failed.length} 个项目未能删除，请稍后重试`,
        })
      } else {
        setIsSelectionMode(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败，请稍后重试"
      toast({
        title: "删除失败",
        description: message,
      })
    } finally {
      setShowDeleteDialog(false)
      setIsDeleting(false)
      setDontAskDeleteAgain(false)
    }
  }

  const handleCancelSelection = () => {
    setSelectedIds(new Set())
    setIsSelectionMode(false)
    anchorIndexRef.current = null
  }

  const selectedItems = useMemo(() => {
    if (selectedIds.size === 0) return []
    return mediaItems.filter((item) => selectedIds.has(item.id))
  }, [mediaItems, selectedIds])

  const toggleSelectOne = useCallback(
    (id: string, index: number) => {
      if (!isSelectionMode) setIsSelectionMode(true)
      anchorIndexRef.current = index
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        if (next.size === 0) setIsSelectionMode(false)
        return next
      })
    },
    [isSelectionMode],
  )

  const selectRange = useCallback(
    (fromIndex: number, toIndex: number, additive: boolean) => {
      const start = Math.min(fromIndex, toIndex)
      const end = Math.max(fromIndex, toIndex)
      const ids = mediaItems.slice(start, end + 1).map((item) => item.id)
      if (!isSelectionMode) setIsSelectionMode(true)
      setSelectedIds((prev) => {
        if (additive) {
          const next = new Set(prev)
          for (const id of ids) next.add(id)
          return next
        }
        return new Set(ids)
      })
    },
    [isSelectionMode, mediaItems],
  )

  const handleTileClick = useCallback(
    (item: MediaItem, index: number, e: React.MouseEvent) => {
      if (!isDesktopSelection) {
        if (!isSelectionMode) {
          onMediaClick(item)
          return
        }
        toggleSelectOne(item.id, index)
        return
      }

      const hasModifier = e.shiftKey || e.metaKey || e.ctrlKey
      if (e.shiftKey) {
        const anchor = anchorIndexRef.current ?? index
        if (anchorIndexRef.current == null) anchorIndexRef.current = anchor
        selectRange(anchor, index, e.metaKey || e.ctrlKey)
        return
      }
      if (e.metaKey || e.ctrlKey) {
        toggleSelectOne(item.id, index)
        return
      }
      if (selectedIds.size > 0) {
        toggleSelectOne(item.id, index)
        return
      }
      if (!hasModifier) {
        onMediaClick(item)
      }
    },
    [isDesktopSelection, isSelectionMode, onMediaClick, selectRange, selectedIds.size, toggleSelectOne],
  )

  const scheduleSelectionUpdate = useCallback(() => {
    if (!pendingBoxRef.current) return
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      const box = pendingBoxRef.current
      if (!box) return
      const { minX, minY, maxX, maxY } = box

      const hits: string[] = []
      tileRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect()
        const intersects = !(rect.right < minX || rect.left > maxX || rect.bottom < minY || rect.top > maxY)
        if (intersects) hits.push(id)
      })

      const dragState = dragStateRef.current
      const additive = !!dragState?.additive
      const subtractive = !!dragState?.subtractive

      setSelectedIds((prev) => {
        if (!additive && !subtractive) return new Set(hits)
        const next = new Set(prev)
        if (subtractive) {
          for (const id of hits) next.delete(id)
        } else {
          for (const id of hits) next.add(id)
        }
        return next
      })
    })
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isDesktopSelection) return
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest("[data-media-tile='true']")) return

      const container = scrollContainerRef.current
      if (!container) return
      container.setPointerCapture(e.pointerId)
      e.preventDefault()

      dragStateRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        additive: e.shiftKey,
        subtractive: e.altKey,
      }

      if (!isSelectionMode) setIsSelectionMode(true)

      const rect = container.getBoundingClientRect()
      const left = e.clientX - rect.left + container.scrollLeft
      const top = e.clientY - rect.top + container.scrollTop
      setSelectionBox({ left, top, width: 0, height: 0 })

      pendingBoxRef.current = { minX: e.clientX, minY: e.clientY, maxX: e.clientX, maxY: e.clientY }
      scheduleSelectionUpdate()

      document.body.style.userSelect = "none"
    },
    [isDesktopSelection, isSelectionMode, scheduleSelectionUpdate],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const state = dragStateRef.current
      if (!state?.active || state.pointerId !== e.pointerId) return
      const container = scrollContainerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const minX = Math.min(state.startX, e.clientX)
      const minY = Math.min(state.startY, e.clientY)
      const maxX = Math.max(state.startX, e.clientX)
      const maxY = Math.max(state.startY, e.clientY)

      pendingBoxRef.current = { minX, minY, maxX, maxY }
      scheduleSelectionUpdate()

      const left = minX - rect.left + container.scrollLeft
      const top = minY - rect.top + container.scrollTop
      const width = Math.max(maxX - minX, 0)
      const height = Math.max(maxY - minY, 0)
      setSelectionBox({ left, top, width, height })
    },
    [scheduleSelectionUpdate],
  )

  const stopDragSelect = useCallback(
    (e: React.PointerEvent) => {
      const state = dragStateRef.current
      if (!state?.active || state.pointerId !== e.pointerId) return
      dragStateRef.current = null
      pendingBoxRef.current = null
      setSelectionBox(null)
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      try {
        scrollContainerRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      document.body.style.userSelect = ""
      if (selectedIds.size === 0) setIsSelectionMode(false)
    },
    [selectedIds.size],
  )

  useEffect(() => {
    onItemsChange?.(mediaItems)
  }, [mediaItems, onItemsChange])

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => fetchMedia(0, "replace"),
      loadMore: async () => {
        if (!hasMore || isInitialLoading || isLoadingMore || fetchingRef.current || !!error) {
          return 0
        }
        return fetchMedia(mediaItems.length, "append")
      },
      getItems: () => mediaItems,
      updateItem: (mediaId, updater) => {
        setMediaItems((prev) => {
          let changed = false
          const next = prev.map((item) => {
            if (item.mediaId !== mediaId) {
              return item
            }
            changed = true
            if (typeof updater === "function") {
              return updater(item)
            }
            return { ...item, ...updater }
          })
          return changed ? next : prev
        })
      },
      removeItems: (mediaIds) => {
        if (mediaIds.length === 0) {
          return
        }
        const idSet = new Set(mediaIds.map((id) => String(id)))
        setMediaItems((prev) => prev.filter((item) => !idSet.has(item.id)))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          let changed = false
          idSet.forEach((id) => {
            if (next.delete(id)) {
              changed = true
            }
          })
          if (!changed) {
            return prev
          }
          if (next.size === 0) {
            setIsSelectionMode(false)
          }
          return next
        })
      },
      getHasMore: () => hasMore,
      getIsLoadingMore: () => isLoadingMore,
    }),
    [error, fetchMedia, hasMore, isInitialLoading, isLoadingMore, mediaItems],
  )

  return (
    <div className="h-full flex flex-col">
      {isSelectionMode && !isDesktopSelection && (
        <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleCancelSelection}>
              <X className="w-4 h-4 mr-2" />
              取消
            </Button>
            <span className="text-sm text-muted-foreground">已选择 {selectedIds.size} 项</span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (hasSeenDeleteConfirm()) {
                void handleDeleteSelected()
                return
              }
              setShowDeleteDialog(true)
            }}
            disabled={selectedIds.size === 0}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            删除
          </Button>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pt-0 relative"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragSelect}
        onPointerCancel={stopDragSelect}
      >
        {selectionBox && (
          <div
            className="absolute z-30 rounded-md border border-primary/60 bg-primary/10"
            style={{
              left: selectionBox.left,
              top: selectionBox.top,
              width: selectionBox.width,
              height: selectionBox.height,
            }}
          />
        )}
        {isInitialLoading && mediaItems.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">正在加载媒体...</div>
        ) : error && mediaItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={() => fetchMedia(0, "replace")}>
              <RefreshCw className="w-4 h-4 mr-1" />
              重试
            </Button>
          </div>
        ) : mediaItems.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">暂无媒体内容</div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-px">
              {mediaItems.map((item, index) => (
                <div
                  key={item.id}
                  ref={(el) => {
                    if (!el) {
                      tileRefs.current.delete(item.id)
                      return
                    }
                    tileRefs.current.set(item.id, el)
                  }}
                  data-media-tile="true"
                  className={`group relative aspect-square overflow-hidden bg-muted cursor-pointer transition-all ${selectedIds.has(item.id) ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-primary"
                    }`}
                  onClick={(e) => handleTileClick(item, index, e)}
                >
                  <img
                    src={item.thumbnailUrl ? resolveApiUrl(item.thumbnailUrl) : (item.resourceUrl ? resolveApiUrl(item.resourceUrl) : "/file.svg")}
                    alt={item.filename || `媒体 ${item.id}`}
                    className="w-full h-full object-cover"
                    loading={index > 6 ? "lazy" : "eager"}
                    onError={(e) => {
                      const target = e.currentTarget
                      if (target.src.endsWith("/file.svg")) {
                        return
                      }
                      target.src = "/file.svg"
                    }}
                  />

                  <div
                    className={`absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity ${isSelectionMode ? "opacity-100" : ""
                      }`}
                    onClick={(e) => handleCheckboxClick(item.id, e)}
                  >
                    <Checkbox checked={selectedIds.has(item.id)} className="bg-white border-2" />
                  </div>

                  {item.type === "video" && (
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                      视频
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div ref={loadMoreRef} className="h-12 flex items-center justify-center">
              {hasMore ? (
                <div className="text-sm text-muted-foreground">
                  {isLoadingMore ? "正在加载更多..." : "下滑加载更多"}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">已经到底了</div>
              )}
            </div>
          </>
        )}
      </div>

      {isDesktopSelection ? (
        <>
          <FloatingDeleteButton
            count={selectedIds.size}
            onClick={() => {
              if (isPreviewDelete) {
                setShowPreviewDialog(true)
                return
              }
              if (hasSeenDeleteConfirm()) {
                void handleDeleteSelected()
                return
              }
              setShowDeleteDialog(true)
            }}
          />
          {isPreviewDelete ? (
            <SelectionPreviewDialog
              open={showPreviewDialog}
              onOpenChange={setShowPreviewDialog}
              items={selectedItems}
            />
          ) : (
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除</AlertDialogTitle>
                  <AlertDialogDescription>
                    确定要删除选中的 {selectedIds.size} 个项目吗？将把原始文件移动到系统回收站/废纸篓（可恢复），同时从应用中移除并清理相关索引/缓存。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                  <AlertDialogCancel disabled={isDeleting} className="sm:order-1">取消</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isDeleting}
                    onClick={() => void handleDeleteSelected()}
                    className="sm:order-2"
                  >
                    {isDeleting ? "删除中..." : "删除"}
                  </AlertDialogAction>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isDeleting}
                    onClick={async () => {
                      markSeenDeleteConfirm()
                      await handleDeleteSelected()
                    }}
                    className="w-full sm:w-auto sm:order-3"
                  >
                    不再询问
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </>
      ) : (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
              确定要删除选中的 {selectedIds.size} 个项目吗？将把原始文件移动到系统回收站/废纸篓（可恢复），同时从应用中移除并清理相关索引/缓存。
          </AlertDialogDescription>
          </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel disabled={isDeleting} className="sm:order-1">取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={() => void handleDeleteSelected()}
                className="sm:order-2"
              >
                {isDeleting ? "删除中..." : "删除"}
              </AlertDialogAction>
              <Button
                type="button"
                variant="outline"
                disabled={isDeleting}
                onClick={async () => {
                  markSeenDeleteConfirm()
                  await handleDeleteSelected()
                }}
                className="w-full sm:w-auto sm:order-3"
              >
                不再询问
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
})
