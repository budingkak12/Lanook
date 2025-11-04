"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MainSidebar } from "@/components/main-sidebar"
import { MainHeader } from "@/components/main-header"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

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

  // 在客户端检查是否应该强制初始化
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const defaultView = urlParams.get('default')
      const forceInit = urlParams.get('forceInit')

      const initTransitionDone = sessionStorage.getItem('initTransitionDone') === 'true'
      if (forceInit === 'true' && !initTransitionDone) {
        // 强制显示初始化页面
        setIsInitialized(false)
        setIsCheckingInit(false)
      } else if (defaultView === 'settings') {
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
  const [sessionId] = useState<string | null>(() => {
    // 前端生成12-13位随机数字种子，与后端格式兼容
    return Math.floor(Math.random() * 9e12 + 1e12).toString()
  })
  const [gridItems, setGridItems] = useState<MediaItem[]>([])
  const [viewerItems, setViewerItems] = useState<MediaItem[]>([]) // MediaViewer专用数据快照
  const gridRef = useRef<MediaGridHandle | null>(null)

  const { toast } = useToast()


  useEffect(() => {
    console.log('🔄 [主页面useEffect] 索引同步检查开始')
    console.log('📊 selectedMedia:', selectedMedia ? {
      id: selectedMedia.id,
      mediaId: selectedMedia.mediaId,
      filename: selectedMedia.filename
    } : 'null')
    console.log('📊 selectedIndex:', selectedIndex)
    console.log('📊 gridItems.length:', gridItems.length)
    console.log('📊 viewerItems.length:', viewerItems.length)

    if (!selectedMedia) {
      console.log('❌ selectedMedia为空，退出')
      return
    }

    if (gridItems.length === 0) {
      console.log('❌ gridItems为空，清理状态')
      setSelectedMedia(null)
      setSelectedIndex(-1)
      return
    }

    // 直接查找媒体在当前列表中的位置
    const currentIdx = gridItems.findIndex(item => item.mediaId === selectedMedia.mediaId)
    console.log('🎯 useEffect中计算的索引:', currentIdx)

    if (currentIdx >= 0) {
      console.log('✅ 找到媒体，当前索引:', currentIdx, 'selectedIndex:', selectedIndex)
      if (currentIdx !== selectedIndex) {
        console.log('🔄 索引不匹配，更新selectedIndex从', selectedIndex, '到', currentIdx)
        setSelectedIndex(currentIdx)
      }
      const updatedItem = gridItems[currentIdx]
      if (updatedItem !== selectedMedia) {
        console.log('🔄 媒体对象不同，更新selectedMedia')
        setSelectedMedia(updatedItem)
      }
      return
    }

    // 如果找不到对应媒体，清理选择状态
    console.log('❌ 未找到对应媒体，清理选择状态')
    setSelectedMedia(null)
    setSelectedIndex(-1)
  }, [gridItems, selectedIndex, selectedMedia])

  // 处理媒体列表变化
  const handleItemsChange = useCallback((newItems: MediaItem[]) => {
    setGridItems(newItems)
  }, [])

  // 基于媒体ID的点击处理函数，确保精确定位
  const handleMediaClick = useCallback((media: MediaItem) => {
    console.log('🔍 [handleMediaClick] 开始处理点击')
    console.log('📸 点击的媒体:', {
      id: media.id,
      mediaId: media.mediaId,
      filename: media.filename,
      type: media.type
    })
    console.log('📊 当前gridItems数量:', gridItems.length)
    console.log('📋 gridItems前5项:', gridItems.slice(0, 5).map(item => ({
      id: item.id,
      mediaId: item.mediaId,
      filename: item.filename
    })))

    // 创建数据快照，确保MediaViewer使用的是点击时的数据
    console.log('📸 创建viewerItems快照，数量:', gridItems.length)
    setViewerItems([...gridItems])

    // 直接设置选中的媒体
    setSelectedMedia(media)

    // 计算当前媒体在完整列表中的准确索引
    const currentMediaIndex = gridItems.findIndex(item => item.mediaId === media.mediaId)
    console.log('🎯 计算得到的索引:', currentMediaIndex)

    if (currentMediaIndex >= 0 && currentMediaIndex < gridItems.length) {
      const foundMedia = gridItems[currentMediaIndex]
      console.log('✅ 找到的匹配媒体:', {
        id: foundMedia.id,
        mediaId: foundMedia.mediaId,
        filename: foundMedia.filename,
        是否匹配: foundMedia.mediaId === media.mediaId
      })
    } else {
      console.log('❌ 未找到匹配的媒体，索引:', currentMediaIndex)
    }

    setSelectedIndex(currentMediaIndex)
    console.log('🏁 [handleMediaClick] 处理完成，设置索引为:', currentMediaIndex)
  }, [gridItems])

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
    <div className="relative h-screen overflow-hidden bg-background">
      {/* Main Content Area */}
      <div className="flex">
        {/* Sidebar - 只在桌面端显示 */}
        <div className="hidden lg:block">
          <MainSidebar
            activeView={activeView}
            onViewChange={setActiveView}
            isSidebarOpen={isSidebarOpen}
            onSidebarClose={() => setIsSidebarOpen(false)}
          />
        </div>

        {/* Main Content */}
        <main
          className="flex-1 lg:ml-44 ml-0 lg:relative pb-16 lg:pb-4"
          onClick={() => setIsSidebarOpen(false)} // 点击内容区域关闭侧边栏
          style={{
            height: '100vh',
            overflowY: 'auto'
          }}
        >
          <div className="w-full h-full">
            {activeView === "feed" && (
              <div className="h-full">
                <MediaGrid
                  ref={gridRef}
                  sessionId={sessionId}
                  onMediaClick={handleMediaClick}
                  onItemsChange={handleItemsChange}
                />
              </div>
            )}
            {activeView === "albums" && (
              <div className="h-full">
                <AlbumsView />
              </div>
            )}
            {activeView === "search" && (
              <div className="h-full">
                <SearchView
                  onMediaClick={handleMediaClick}
                />
              </div>
            )}
            {activeView === "settings" && (
              <div className="h-full">
                <SettingsView />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation - 只在移动端显示 */}
      <MobileBottomNav
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {selectedMedia && (
        <MediaViewer
          media={selectedMedia}
          currentIndex={selectedIndex}
          allMedia={viewerItems}
          onClose={() => {
            setSelectedMedia(null)
            setSelectedIndex(-1)
            setViewerItems([])
          }}
          onNavigate={handleNavigate}
          onMediaUpdate={handleMediaUpdate}
          onMediaRemove={handleMediaRemove}
          onIndexChange={setSelectedIndex}
          onLoadMore={async () => {
            const added = await gridRef.current?.loadMore() ?? 0
            if (added > 0) {
              // 加载更多后，更新viewerItems快照
              setViewerItems([...gridItems])
            }
            return added
          }}
          hasMore={gridRef.current?.getHasMore() ?? true}
          isLoadingMore={gridRef.current?.getIsLoadingMore() ?? false}
        />
      )}
    </div>
  )
}