"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { FolderOpen, HardDrive, ArrowRight, ArrowLeft, CheckCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiFetch } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "react-i18next"
import { InitCommonFolders } from "@/components/init-common-folders"

interface DirectoryEntry {
  path: string
  name: string
  readable: boolean
  writable: boolean
  is_root: boolean
  is_symlink: boolean
}

interface InitializationStatus {
  state: "idle" | "running" | "completed"
  message: string | null
  media_root_path: string | null
}

interface InitializationViewProps {
  onInitialized?: () => void
}

export function InitializationView({ onInitialized }: InitializationViewProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<InitializationStatus | null>(null)
  const [selectedPath, setSelectedPath] = useState<string>("")
  const [roots, setRoots] = useState<DirectoryEntry[]>([])
  const [currentDir, setCurrentDir] = useState<DirectoryEntry[]>([])
  const [currentPath, setCurrentPath] = useState<string>("")
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { toast } = useToast()
  const isRootView = !currentPath
  const displayedEntries = isRootView ? roots : currentDir
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const hasCompletedRef = useRef(false)

  const clearPollTimeout = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }

  const handleInitializationCompleted = useCallback(() => {
    if (hasCompletedRef.current) return
    hasCompletedRef.current = true
    clearPollTimeout()
    setIsInitializing(false)
    toast({ title: "初始化完成", description: "媒体库已成功初始化！" })
    onInitialized?.()
  }, [onInitialized, toast])

  useEffect(() => {
    hasCompletedRef.current = false
    return () => {
      isMountedRef.current = false
      clearPollTimeout()
    }
  }, [])

  // 不在初始化页请求 /init-status，避免刷新时重复请求

  // 获取文件系统根目录
  const fetchRoots = async () => {
    try {
      const response = await apiFetch("/filesystem/roots")
      if (response.ok) {
        const data = await response.json()
        setRoots(data)
      }
    } catch (error) {
      console.error("获取根目录失败:", error)
      toast({
        title: "错误",
        description: "无法获取文件系统信息",
      })
    }
  }

  // 浏览目录
  const browseDirectory = async (path: string) => {
    console.log("browseDirectory called with path:", path)
    setIsLoading(true)
    try {
      const response = await apiFetch(`/filesystem/list?path=${encodeURIComponent(path)}`)
      if (response.ok) {
        const data = await response.json()
        console.log("API response:", data)
        setCurrentDir(data.entries || [])
        setCurrentPath(data.current_path)
        setParentPath(data.parent_path)
        console.log("States set - currentPath:", data.current_path, "entries:", data.entries)
      }
    } catch (error) {
      console.error("浏览目录失败:", error)
      toast({
        title: "错误",
        description: "无法浏览目录",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 选择目录
  const selectDirectory = (path: string) => {
    setSelectedPath(path)
  }

  const scheduleStatusPoll = () => {
    const poll = async () => {
      try {
        const response = await apiFetch("/init-status")
        if (!response.ok) {
          throw new Error("无法获取初始化状态")
        }
        const statusData = await response.json()
        if (!isMountedRef.current) {
          return
        }
        setStatus(statusData)
        // 后端状态为 running/completed；running 表示后台扫描中，但前端可直接进入
        setIsInitializing(statusData.state === "running")
        if (statusData.media_root_path) {
          setSelectedPath(statusData.media_root_path)
          setCurrentPath(statusData.media_root_path)
          setParentPath(null)
        }

        if (statusData.state === "completed") {
          handleInitializationCompleted()
          return
        }

        if (statusData.state === "idle") {
          clearPollTimeout()
          setIsInitializing(false)
          toast({
            title: "初始化失败",
            description: statusData.message || "初始化过程中发生错误",
          })
          return
        }

        pollTimeoutRef.current = setTimeout(poll, 500)
      } catch (error) {
        console.error("轮询初始化状态失败:", error)
        clearPollTimeout()
        if (isMountedRef.current) {
          setIsInitializing(false)
          toast({
            title: "错误",
            description: "无法获取初始化状态",
          })
        }
      }
    }

    clearPollTimeout()
    poll()
  }

  // 开始初始化
  const startInitialization = async () => {
    if (!selectedPath.trim()) {
      toast({
        title: "错误",
        description: "请选择一个媒体目录",
      })
      return
    }

    hasCompletedRef.current = false
    setIsInitializing(true)

    // 成功判定：2xx 均视为成功；409（已在进行）也当作成功继续
    const treatAsSuccess = (resp: Response) => resp.ok || resp.status === 409 || (resp as any).type === "opaque"

    try {
      console.log('[init] startInitialization, path=', selectedPath)
      const resp = await apiFetch("/media-root", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedPath })
      })

      // 即使组件可能被 React 严格模式短暂卸载，也不要过早 return，
      // 否则会导致加载态无法复位。后续 setState 均带保护。

      if (treatAsSuccess(resp)) {
        console.log("[init] media-root accepted, status=", resp.status)
        // 直接进入首页；Home 会基于 /init-status 的 running/completed 决定后续
        try {
          // 清理 URL 上的 forceInit 标记，避免热重载/二次挂载又回到初始化页
          if (typeof window !== 'undefined') {
            try {
              const url = new URL(window.location.href)
              if (url.searchParams.has('forceInit')) {
                url.searchParams.delete('forceInit')
                window.history.replaceState({}, document.title, url.pathname + (url.search ? '?' + url.searchParams.toString() : '') + url.hash)
              }
            } catch {}
          }
          onInitialized?.()
        } catch (e) { console.warn('[init] onInitialized error', e) }
        // 保护性兜底：若父组件未切换视图，强制刷新到首页
        setTimeout(() => {
          if (isMountedRef.current) {
            try {
              // 避免 forceInit 残留
              localStorage.removeItem('forceInit')
            } catch {}
            if (typeof window !== 'undefined') {
              // 仅当仍停留在初始化页时执行
              if (document?.title?.includes('欢迎使用媒体库') || document?.body?.innerText?.includes('选择媒体目录')) {
                window.location.href = '/'
              }
            }
          }
        }, 800)
      } else {
        let message = "初始化失败"
        try {
          const data = await resp.json()
          message = data?.detail || data?.message || message
        } catch {}
        toast({ title: "错误", description: message })
        console.warn('[init] media-root not accepted, status=', resp.status, 'message=', message)
      }
    } catch (err) {
      console.error("提交媒体根目录失败:", err)
      if (isMountedRef.current) {
        toast({ title: "错误", description: "初始化请求失败" })
      }
    } finally {
      // 无论成功失败都停止按钮转圈，避免 UI 卡住
      setIsInitializing(false)
      console.log('[init] setIsInitializing(false)')
    }
  }

  const loadedOnceRef = useRef(false)
  useEffect(() => {
    if (loadedOnceRef.current) return
    loadedOnceRef.current = true
    fetchRoots()
  }, [])

  // 如果已经完成初始化，显示加载状态
  if (status?.state === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
          <h1 className="text-2xl font-bold">初始化已完成</h1>
          <p className="text-muted-foreground">正在跳转到首页...</p>
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 标题区域 */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 mb-4">
            <HardDrive className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">欢迎使用媒体库</h1>
          </div>
        </div>

        {/* 状态显示 */}
  
        {/* 常用文件夹优先（适合小白） */}
        <InitCommonFolders
          selectedPath={selectedPath}
          onChangePath={(p) => setSelectedPath(p)}
          onStart={startInitialization}
          isStarting={isInitializing}
        />

        {/* 高级浏览（默认收起） */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "收起高级浏览" : "需要浏览任意位置？展开高级浏览"}
          </Button>
        </div>
        {showAdvanced && (
        <Card id="advanced-browser">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              浏览其他位置（高级）
            </CardTitle>
            <CardDescription>
              若需要选择非常规位置，可在此浏览/输入路径
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 当前选择的路径 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">当前选择的路径:</label>
              <div className="flex items-center gap-2">
                <Input
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
                  placeholder="点击下方目录进行选择"
                  className="flex-1"
                />
              </div>
            </div>

            {/* 目录浏览 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">选择文件夹:</label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isRootView) {
                        return
                      }
                      if (parentPath) {
                        browseDirectory(parentPath)
                      } else {
                        setCurrentDir([])
                        setCurrentPath("")
                        setParentPath(null)
                      }
                    }}
                    disabled={isRootView || isLoading}
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    返回上级
                  </Button>
                  {currentPath && (
                    <span className="text-xs text-muted-foreground truncate max-w-xs">
                      {currentPath}
                    </span>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8 border rounded-lg">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  {displayedEntries.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      此目录为空或无法访问
                    </div>
                  ) : (
                    <div className="divide-y">
                      {displayedEntries.map((entry) => (
                        <div
                          key={entry.path}
                          className={`flex items-center justify-between p-3 hover:bg-accent cursor-pointer transition-colors ${
                            selectedPath === entry.path ? "bg-accent" : ""
                          }`}
                          onClick={() => {
                            if (entry.readable) {
                              selectDirectory(entry.path)
                            }
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault()
                            if (entry.readable) {
                              browseDirectory(entry.path)
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{entry.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {entry.writable && (
                              <div className="w-2 h-2 bg-green-500 rounded-full" title="可写" />
                            )}
                            {!entry.readable && (
                              <div className="w-2 h-2 bg-red-500 rounded-full" title="不可读" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

              </CardContent>
        </Card>
        )}
      </div>
    </div>
  )
}
