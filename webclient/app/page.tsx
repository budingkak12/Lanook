"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MainSidebar } from "@/components/main-sidebar"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { MediaGrid } from "@/components/media-grid"
import { MediaCollectionView, type MediaCollectionHandle } from "@/components/media-collection-view"
import { SearchView } from "@/components/search-view"
import { AlbumsView } from "@/components/albums-view"
import { SettingsView } from "@/components/settings-view"
import { InitializationView } from "@/components/initialization-view"
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
  const [sessionId] = useState<string | null>(() => {
    // 前端生成12-13位随机数字种子，与后端格式兼容
    return Math.floor(Math.random() * 9e12 + 1e12).toString()
  })
  const feedCollectionRef = useRef<MediaCollectionHandle | null>(null)

  const handleSearchMediaClick = useCallback((media: MediaItem) => {
    console.log('[search] media click received but no viewer is bound yet', media.mediaId)
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
            height: '100dvh', // 使用动态视口高度，避免移动端浏览器工具栏遮挡
            overflowY: 'auto'
          }}
          id="main-content"
        >
          <div className="w-full h-full flex flex-col">
            {activeView === "feed" && (
              <MediaCollectionView
                collectionRef={feedCollectionRef}
                className="h-full"
                renderList={({ listRef, onMediaClick, onItemsChange }) => (
                  <MediaGrid
                    ref={listRef}
                    sessionId={sessionId}
                    onMediaClick={onMediaClick}
                    onItemsChange={onItemsChange}
                  />
                )}
              />
            )}
            {activeView === "albums" && (
              <div className="h-full">
                <AlbumsView />
              </div>
            )}
            {activeView === "search" && (
              <div className="h-full">
                <SearchView
                  onMediaClick={handleSearchMediaClick}
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
    </div>
  )
}
