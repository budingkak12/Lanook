"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { MediaGrid, type MediaGridHandle } from "@/components/media-grid"
import { MediaViewer } from "@/components/media-viewer"
import { SearchView } from "@/components/search-view"
import { AlbumsView } from "@/components/albums-view"
import { SettingsView } from "@/components/settings-view"
import { InitializationView } from "@/components/initialization-view"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api"
import { useTranslation } from "react-i18next"

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

interface InitializationStatus {
  state: "idle" | "running" | "completed"
  message: string | null
  media_root_path: string | null
}

export default function Home() {
  const { t } = useTranslation()
  const [activeView, setActiveView] = useState<"feed" | "albums" | "search" | "settings">("feed")
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null)
  const [isCheckingInit, setIsCheckingInit] = useState(true)
  
  // 工具：清理 URL 上的 forceInit 标记，避免热重载/二次挂载又回到初始化页
  const clearForceInitFromUrl = () => {
    if (typeof window === 'undefined') return
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.has('forceInit')) {
        url.searchParams.delete('forceInit')
        window.history.replaceState({}, document.title, url.pathname + (url.search ? '?' + url.searchParams.toString() : '') + url.hash)
      }
    } catch {}
  }

  // 检查初始化状态
  const checkInitializationStatus = useCallback(async () => {
    try {
      // 如果URL中有forceInit参数或localStorage中有标记，强制显示初始化页面
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search)
        const forceInit = urlParams.get('forceInit')
        const localStorageForceInit = localStorage.getItem('forceInit')

        // 清除localStorage标记（只使用一次），但不拦截后续正常检查
        if (localStorageForceInit === 'true') {
          localStorage.removeItem('forceInit')
        }

        // 若 URL 带有 forceInit，但已完成一次页面内初始化跳转（sessionStorage 标记），忽略该参数
        const initTransitionDone = sessionStorage.getItem('initTransitionDone') === 'true'
        if (forceInit === 'true' && !initTransitionDone) {
          setIsInitialized(false)
          setIsCheckingInit(false)
          return
        }
      }

      console.log('[init] checking /init-status ...')
      const response = await apiFetch("/init-status")
      if (response.ok) {
        const data: InitializationStatus = await response.json()
        console.log('[init] /init-status:', data)
        // Web 不等待扫描完成：running 也视为已初始化
        const initialized = data.state === "completed" || data.state === "running"
        setIsInitialized(initialized)
        console.log('[init] setIsInitialized =', initialized)

        // 如果未初始化，不需要继续执行其他逻辑
        if (!initialized) {
          setIsCheckingInit(false)
          return
        }
      } else {
        // 如果接口调用失败，默认认为已初始化
        setIsInitialized(true)
      }
    } catch (error) {
      console.error("检查初始化状态失败:", error)
      // 如果无法获取状态，默认认为已初始化，避免阻塞用户
      setIsInitialized(true)
    } finally {
      setIsCheckingInit(false)
    }
  }, [])

  // 在客户端检查是否应该显示设置页面或强制初始化
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const autoShowSettings = urlParams.get('autoShowSettings')
      const defaultView = urlParams.get('default')
      const forceInit = urlParams.get('forceInit')

      const initTransitionDone = sessionStorage.getItem('initTransitionDone') === 'true'
      if (forceInit === 'true' && !initTransitionDone) {
        // 强制显示初始化页面
        setIsInitialized(false)
        setIsCheckingInit(false)
      } else if (autoShowSettings === 'true' || defaultView === 'settings') {
        setActiveView('settings')
      }
    }
  }, [])

  // 检查初始化状态（StrictMode 下只执行一次）
  const checkedOnceRef = useRef(false)
  useEffect(() => {
    if (checkedOnceRef.current) return
    checkedOnceRef.current = true
    checkInitializationStatus()
  }, [checkInitializationStatus])
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [gridItems, setGridItems] = useState<MediaItem[]>([])
  const gridRef = useRef<MediaGridHandle | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (isCheckingInit || !isInitialized) {
      return
    }

    let cancelled = false

    const fetchSession = async () => {
      try {
        const response = await apiFetch("/session", { credentials: "omit" })
        if (!response.ok) {
          throw new Error(t("errors.requestFailed", { status: response.status }))
        }
        const data = (await response.json()) as { session_seed?: string }
        if (cancelled) {
          return
        }
        const seed = data.session_seed ?? ""
        setSessionId(seed)
        setSessionError(null)
        toast({
          title: t("session.established"),
          description: t("session.description", { seed }),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : t("errors.unknownError")
        if (cancelled) {
          return
        }
        setSessionError(message)
        toast({
          title: t("session.failed"),
          description: message,
        })
      }
    }

    fetchSession()

    return () => {
      cancelled = true
    }
  }, [isCheckingInit, isInitialized, t, toast])

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

  // 如果无法获取状态，显示加载中
  if (isCheckingInit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">正在检查系统状态...</p>
        </div>
      </div>
    )
  }

  // 如果未初始化，显示初始化页面
  if (isInitialized === false) {
    return <InitializationView onInitialized={() => {
      console.log('[init] onInitialized fired: entering app view')
      try {
        sessionStorage.setItem('initTransitionDone', 'true')
      } catch {}
      clearForceInitFromUrl()
      setIsInitialized(true)
      // 避免立即请求仍返回 idle 把状态又置回 false，延迟校验
      setTimeout(() => {
        console.log('[init] delayed checkInitializationStatus triggered')
        checkInitializationStatus()
      }, 1000)
    }} />
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end p-4">
        <div className="pointer-events-auto rounded-lg bg-card/80 px-4 py-2 text-sm shadow">
          {sessionId ? (
            <span className="font-mono text-muted-foreground">session: {sessionId}</span>
          ) : sessionError ? (
            <span className="text-destructive">{t("session.failedMessage", { error: sessionError })}</span>
          ) : (
            <span className="text-muted-foreground">{t("session.getting")}</span>
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

      {/* 已移除自动弹出二维码的逻辑与提示标记 */}
    </div>
  )
}
