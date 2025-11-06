"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react"
import type { MediaItem } from "@/app/page"
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

type MediaGridProps = {
  sessionId: string | null
  onMediaClick: (media: MediaItem) => void
  onItemsChange?: (items: MediaItem[]) => void
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
  { sessionId, onMediaClick, onItemsChange },
  ref,
) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [isInitialLoading, setIsInitialLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fetchingRef = useRef(false)

  const resetSelection = useCallback(() => {
    setSelectedIds(new Set())
    setIsSelectionMode(false)
    setShowDeleteDialog(false)
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
      const effectiveSessionId = currentSessionId || sessionId
      if (!effectiveSessionId) {
        setMediaItems([])
        setHasMore(false)
        setError("尚未获取会话，请稍候重试。")
        return 0
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
        const params = new URLSearchParams({
          seed: effectiveSessionId,
          offset: String(offset),
          limit: String(PAGE_SIZE),
          order: "seeded",
        })
        const response = await apiFetch(`/media-list?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`获取媒体列表失败：${response.status}`)
        }
        const data = (await response.json()) as MediaListResponse
        const nextItems = normalizeItems(data.items)
        let addedCount = 0
        setMediaItems((prev) => {
          if (mode === "replace") {
            addedCount = nextItems.length
            return nextItems
          }
          addedCount = nextItems.length
          return [...prev, ...nextItems]
        })
        setHasMore(data.hasMore)
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
    [normalizeItems, toast],
  )

  useEffect(() => {
    setMediaItems([])
    setHasMore(true)
    resetSelection()
    setError(null)
    abortRef.current?.abort()

    if (!sessionId) {
      return
    }

    // 使用 setTimeout 来避免 React StrictMode 的双重执行问题
    const timeoutId = setTimeout(() => {
      fetchMedia(0, "replace", sessionId)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      abortRef.current?.abort()
      fetchingRef.current = false
    }
  }, [sessionId, fetchMedia, resetSelection])

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
    const ids = Array.from(selectedIds)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value))
    if (ids.length === 0) {
      setShowDeleteDialog(false)
      return
    }

    setIsDeleting(true)
    try {
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
    }
  }

  const handleCancelSelection = () => {
    setSelectedIds(new Set())
    setIsSelectionMode(false)
  }

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
      {isSelectionMode && (
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
            onClick={() => setShowDeleteDialog(true)}
            disabled={selectedIds.size === 0}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            删除
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pt-0">
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
                  key={`${item.id}-${item.thumbnailUrl ?? ""}`}
                  className="group relative aspect-square overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                  onClick={() => {
                    if (!isSelectionMode) {
                      console.log('🖱️ [MediaGrid] 点击缩略图')
                      console.log('📸 点击的item:', {
                        id: item.id,
                        mediaId: item.mediaId,
                        filename: item.filename,
                        type: item.type
                      })
                      console.log('📊 当前索引(index):', index)
                      console.log('📊 mediaItems总数:', mediaItems.length)
                      onMediaClick(item)
                    }
                  }}
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
                    className={`absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity ${
                      isSelectionMode ? "opacity-100" : ""
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {selectedIds.size} 个项目吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={() => void handleDeleteSelected()}>
              {isDeleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})
