"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { MediaGrid, type MediaGridHandle } from "@/components/media-grid"
import { MediaViewer } from "@/components/media-viewer"
import { SearchView } from "@/components/search-view"
import { AlbumsView } from "@/components/albums-view"
import { SettingsView } from "@/components/settings-view"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api"

export type MediaItem = {
  id: string
  mediaId: number
  type: "image" | "video"
  url: string
  resourceUrl: string
  thumbnailUrl?: string | null
  filename: string
  createdAt: string
  liked?: boolean
  favorited?: boolean
  tags?: string[]
}

export default function Home() {
  const [activeView, setActiveView] = useState<"feed" | "albums" | "search" | "settings">("feed")

  // 在客户端检查是否应该显示设置页面
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const autoShowSettings = urlParams.get('autoShowSettings')
      const defaultView = urlParams.get('default')

      if (autoShowSettings === 'true' || defaultView === 'settings') {
        setActiveView('settings')
      }
    }
  }, [])
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [gridItems, setGridItems] = useState<MediaItem[]>([])
  const gridRef = useRef<MediaGridHandle | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false

    const fetchSession = async () => {
      try {
        const response = await apiFetch("/session", { credentials: "omit" })
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`)
        }
        const data = (await response.json()) as { session_seed?: string }
        if (cancelled) {
          return
        }
        const seed = data.session_seed ?? ""
        setSessionId(seed)
        setSessionError(null)
        toast({
          title: "会话已建立",
          description: `session_seed=${seed}`,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误"
        if (cancelled) {
          return
        }
        setSessionError(message)
        toast({
          title: "会话初始化失败",
          description: message,
        })
      }
    }

    fetchSession()

    return () => {
      cancelled = true
    }
  }, [toast])

  useEffect(() => {
    if (!selectedMedia) {
      return
    }

    if (gridItems.length === 0) {
      setSelectedMedia(null)
      setSelectedIndex(-1)
      return
    }

    const currentIdx = gridItems.findIndex((item) => item.mediaId === selectedMedia.mediaId)
    if (currentIdx >= 0) {
      if (currentIdx !== selectedIndex) {
        setSelectedIndex(currentIdx)
      }
      const updatedItem = gridItems[currentIdx]
      if (updatedItem !== selectedMedia) {
        setSelectedMedia(updatedItem)
      }
      return
    }

    const fallbackIndex = Math.min(Math.max(selectedIndex, 0), gridItems.length - 1)
    if (fallbackIndex < 0) {
      setSelectedMedia(null)
      setSelectedIndex(-1)
      return
    }
    const fallbackItem = gridItems[fallbackIndex]
    setSelectedIndex(fallbackIndex)
    setSelectedMedia(fallbackItem)
  }, [gridItems, selectedIndex, selectedMedia])

  const handleNavigate = useCallback(
    async (direction: "prev" | "next") => {
      if (selectedIndex < 0) {
        return
      }

      let items = gridRef.current?.getItems() ?? gridItems
      if (items.length === 0) {
        return
      }

      const delta = direction === "next" ? 1 : -1
      let targetIndex = selectedIndex + delta

      if (targetIndex < 0) {
        return
      }

      // 预加载机制：当接近边界时（距离边界5个元素以内）就开始加载更多
      const PRELOAD_THRESHOLD = 5
      const needsPreload = direction === "next" &&
                          targetIndex >= items.length - PRELOAD_THRESHOLD

      if (needsPreload || targetIndex >= items.length) {
        const added = (await gridRef.current?.loadMore()) ?? 0
        if (added > 0) {
          items = gridRef.current?.getItems() ?? gridItems
        }
      }

      // 加载更多数据后，重新检查边界
      if (targetIndex >= items.length) {
        return
      }

      const nextMedia = items[targetIndex]
      if (!nextMedia) {
        return
      }

      setSelectedIndex(targetIndex)
      setSelectedMedia(nextMedia)
    },
    [gridItems, selectedIndex],
  )

  const handleMediaUpdate = useCallback((mediaId: number, updates: Partial<MediaItem>) => {
    gridRef.current?.updateItem(mediaId, (prev) => ({ ...prev, ...updates }))
    setSelectedMedia((prev) => {
      if (!prev || prev.mediaId !== mediaId) {
        return prev
      }
      return { ...prev, ...updates }
    })
  }, [])

  const handleMediaRemove = useCallback((mediaIds: number[]) => {
    if (mediaIds.length === 0) {
      return
    }
    gridRef.current?.removeItems(mediaIds)
  }, [])

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end p-4">
        <div className="pointer-events-auto rounded-lg bg-card/80 px-4 py-2 text-sm shadow">
          {sessionId ? (
            <span className="font-mono text-muted-foreground">session: {sessionId}</span>
          ) : sessionError ? (
            <span className="text-destructive">会话失败：{sessionError}</span>
          ) : (
            <span className="text-muted-foreground">正在获取会话...</span>
          )}
        </div>
      </div>
      <Sidebar activeView={activeView} onViewChange={setActiveView} />

      <main className="flex-1 overflow-hidden">
        {activeView === "feed" && (
          <MediaGrid
            ref={gridRef}
            sessionId={sessionId}
            onMediaClick={(media, index) => {
              setSelectedMedia(media)
              setSelectedIndex(index)
            }}
            onItemsChange={setGridItems}
          />
        )}
        {activeView === "albums" && <AlbumsView />}
        {activeView === "search" && (
          <SearchView
            onMediaClick={(media, index) => {
              setSelectedMedia(media)
              setSelectedIndex(index)
            }}
          />
        )}
        {activeView === "settings" && <SettingsView />}
      </main>

      {selectedMedia && (
        <MediaViewer
          media={selectedMedia}
          currentIndex={selectedIndex}
          onClose={() => {
            setSelectedMedia(null)
            setSelectedIndex(-1)
          }}
          onNavigate={handleNavigate}
          onMediaUpdate={handleMediaUpdate}
          onMediaRemove={handleMediaRemove}
        />
      )}
    </div>
  )
}
