"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { MainSidebar } from "@/components/main-sidebar"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { InitializationView } from "@/components/initialization-view"
import { apiFetch } from "@/lib/api"

interface InitializationStatus {
  state: "idle" | "running" | "completed"
  message: string | null
  media_root_path: string | null
}

type ViewKey = "feed" | "albums" | "search" | "settings"

const viewToPath: Record<ViewKey, string> = {
  feed: "/",
  albums: "/albums",
  search: "/search",
  settings: "/settings",
}

const pathToView = (pathname: string): ViewKey => {
  if (pathname.startsWith("/albums")) return "albums"
  if (pathname.startsWith("/search")) return "search"
  if (pathname.startsWith("/settings")) return "settings"
  return "feed"
}

export default function MainLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMockMode = searchParams.get("mock") === "1"

  const [isInitialized, setIsInitialized] = useState<boolean | null>(null)
  const [isCheckingInit, setIsCheckingInit] = useState(true)
  const [sidebarIntro, setSidebarIntro] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  const clearForceInitFromUrl = () => {
    if (typeof window === "undefined") return
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.has("forceInit")) {
        url.searchParams.delete("forceInit")
        window.history.replaceState(
          {},
          document.title,
          url.pathname + (url.search ? "?" + url.searchParams.toString() : "") + url.hash,
        )
      }
    } catch {
      // ignore
    }
  }

  const checkInitializationStatus = useCallback(async () => {
    if (isMockMode) {
      setIsInitialized(true)
      setIsCheckingInit(false)
      return
    }
    try {
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search)
        const forceInit = urlParams.get("forceInit")
        const localStorageForceInit = localStorage.getItem("forceInit")

        if (localStorageForceInit === "true") {
          localStorage.removeItem("forceInit")
        }

        const initTransitionDone = sessionStorage.getItem("initTransitionDone") === "true"
        if (forceInit === "true" && !initTransitionDone) {
          setIsInitialized(false)
          setIsCheckingInit(false)
          return
        }
      }

      const response = await apiFetch("/init-status")
      if (response.ok) {
        const data: InitializationStatus = await response.json()
        const initialized = data.state === "completed" || data.state === "running"
        setIsInitialized(initialized)
        if (!initialized) {
          setIsCheckingInit(false)
          return
        }
      } else {
        setIsInitialized(true)
      }
    } catch (error) {
      console.error("检查初始化状态失败:", error)
      setIsInitialized(true)
    } finally {
      setIsCheckingInit(false)
    }
  }, [isMockMode])

  useEffect(() => {
    if (typeof window === "undefined") return
    const defaultView = searchParams.get("default")
    const forceInit = searchParams.get("forceInit")
    const initTransitionDone = sessionStorage.getItem("initTransitionDone") === "true"

    if (forceInit === "true") {
      // 调试场景：强制进入初始化，无视已完成标记
      sessionStorage.removeItem("initTransitionDone")
      setIsInitialized(false)
      setIsCheckingInit(false)
      return
    }

    if (defaultView === "settings") {
      router.replace("/settings")
    }
  }, [router, searchParams])

  const checkedOnceRef = useRef(false)
  useEffect(() => {
    if (checkedOnceRef.current) return
    checkedOnceRef.current = true
    checkInitializationStatus()
  }, [checkInitializationStatus])

  const activeView = useMemo(() => pathToView(pathname || "/"), [pathname])

  const handleViewChange = useCallback(
    (view: ViewKey) => {
      const target = viewToPath[view]
      if (pathname !== target) {
        router.push(target)
      }
      setIsSidebarOpen(false)
    },
    [pathname, router],
  )

  // 跟踪桌面断点，避免移动端受折叠逻辑影响
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  if (isCheckingInit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">正在检查系统状态...</p>
        </div>
      </div>
    )
  }

  if (isInitialized === false) {
    return (
      <InitializationView
        onInitialized={() => {
          try {
            sessionStorage.setItem("initTransitionDone", "true")
          } catch {
            // ignore
          }
          clearForceInitFromUrl()
          setSidebarIntro(true)
          setIsInitialized(true)
          setIsCheckingInit(false)
        }}
      />
    )
  }

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <div className="flex">
        <div className="hidden lg:block">
          <motion.div
            initial={sidebarIntro ? { x: -160, opacity: 0 } : { x: 0, opacity: 1 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <MainSidebar
              activeView={activeView}
              onViewChange={handleViewChange}
              isSidebarOpen={isSidebarOpen}
              onSidebarClose={() => setIsSidebarOpen(false)}
              collapsed={isSidebarCollapsed}
              onCollapsedChange={setIsSidebarCollapsed}
            />
          </motion.div>
        </div>

        <main
          className="flex-1 ml-0 lg:relative"
          onClick={() => setIsSidebarOpen(false)}
          style={{
            height: "100dvh",
            overflowY: "auto",
            marginLeft: isDesktop ? (isSidebarCollapsed ? "48px" : "11rem") : "0px",
            transition: "margin-left 200ms ease",
          }}
          id="main-content"
        >
          <div className="w-full h-full flex flex-col overflow-hidden">{children}</div>
        </main>
      </div>

      <MobileBottomNav activeView={activeView} onViewChange={handleViewChange} />
    </div>
  )
}
