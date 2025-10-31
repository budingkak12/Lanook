"use client"

import { useEffect, useMemo, useState } from "react"
import { FolderOpen, Lock, Unlock, RefreshCw, CheckCircle2, HardDrive, ArrowRight, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  type CommonFolderEntry,
  getCommonFolders,
  probePermissions,
  type ProbeResult,
} from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api"

type Props = {
  selectedPath: string
  onChangePath: (path: string) => void
  onStart: () => void
  isStarting?: boolean
}

export function InitCommonFolders({ selectedPath, onChangePath, onStart, isStarting }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<CommonFolderEntry[]>([])
  // 不再请求 OS/IP 信息，减少初始化页的网络调用
  const [probing, setProbing] = useState<Record<string, boolean>>({})
  const [inputPath, setInputPath] = useState(selectedPath)
  useEffect(() => { setInputPath(selectedPath) }, [selectedPath])

  type DirEntry = { path: string; name: string; readable: boolean; writable: boolean; is_root: boolean; is_symlink: boolean }
  type Viewer = { current: string; parent: string | null; entries: DirEntry[]; loading: boolean }
  const [viewers, setViewers] = useState<Record<string, Viewer | undefined>>({})

  const loadViewer = async (root: string, path: string) => {
    setViewers((m) => ({ ...m, [root]: { ...(m[root] ?? { current: path, parent: null, entries: [], loading: true }), loading: true } }))
    try {
      const resp = await apiFetch(`/filesystem/list?path=${encodeURIComponent(path)}`)
      if (!resp.ok) throw new Error("list failed")
      const data = await resp.json() as { current_path: string; parent_path: string | null; entries: DirEntry[] }
      setViewers((m) => ({ ...m, [root]: { current: data.current_path, parent: data.parent_path, entries: data.entries, loading: false } }))
    } catch (e) {
      setViewers((m) => ({ ...m, [root]: { ...(m[root] ?? { current: path, parent: null, entries: [] }), loading: false } }))
      toast({ title: "无法浏览目录", description: String(e) })
    }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        // 仅加载常用文件夹，避免在初始化页请求 OS/IP 信息
        const folders = await getCommonFolders()
        if (cancelled) return
        setEntries(folders)
      } catch (e) {
        console.error("加载常用文件夹失败", e)
        toast({ title: "错误", description: "无法获取常用文件夹列表" })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [toast])

  const byGroups = useMemo(() => {
    const groups: Record<string, CommonFolderEntry[]> = { common: [], volumes: [] }
    for (const e of entries) {
      if (e.category === "volume") groups.volumes.push(e)
      else groups.common.push(e)
    }
    return groups
  }, [entries])

  const probeOne = async (path: string) => {
    setProbing((p) => ({ ...p, [path]: true }))
    try {
      const res = await probePermissions([path])
      const r: ProbeResult | undefined = res[0]
      if (!r) return
      if (r.status === "ok") {
        toast({ title: "已获得访问权限" })
        // 刷新当前列表状态
        const fresh = await getCommonFolders()
        setEntries(fresh)
      } else if (r.status === "denied") {
        // 通用提示：具体平台差异由后续单独帮助文档/提示承担
        toast({ title: "拒绝访问", description: "请在系统设置为应用授予该目录读写权限，或尝试其他目录" })
      } else if (r.status === "not_found") {
        toast({ title: "目录不存在", description: path })
      } else {
        toast({ title: "读取失败", description: r.reason || "未知错误" })
      }
    } finally {
      setProbing((p) => ({ ...p, [path]: false }))
    }
  }

  const probeAllDenied = async () => {
    const targets = entries.filter((e) => !e.readable).map((e) => e.path)
    if (targets.length === 0) return
    setProbing((p) => ({ ...p, __all: true }))
    try {
      await probePermissions(targets)
      const fresh = await getCommonFolders()
      setEntries(fresh)
    } finally {
      setProbing((p) => ({ ...p, __all: false }))
    }
  }

  const renderList = (items: CommonFolderEntry[]) => (
    <div className="space-y-3">
      {items.map((e) => {
        const locked = !e.readable
        return (
          <Card key={e.path} className="hover:bg-accent/40 transition-colors">
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FolderOpen className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" title={e.name}
                         onDoubleClick={() => { if (e.readable) loadViewer(e.path, e.path) }}
                    >{e.name}</div>
                    <div className="text-xs text-muted-foreground truncate" title={e.path}>{e.path}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {locked ? (
                    <Button size="sm" variant="outline" disabled={!!probing[e.path]} onClick={() => probeOne(e.path)}>
                      {probing[e.path] ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Lock className="w-3.5 h-3.5 mr-1" />}
                      获取访问权限
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => { onChangePath(e.path); setInputPath(e.path) }}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 选为路径
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => loadViewer(e.path, e.path)}>
                        浏览
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* 内联浏览器 */}
              {viewers[e.path] && (
                <div className="rounded border p-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-muted-foreground truncate" title={viewers[e.path]?.current}>{viewers[e.path]?.current}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={!viewers[e.path]?.parent} onClick={() => viewers[e.path]?.parent && loadViewer(e.path, viewers[e.path]!.parent!)}>
                        <ArrowLeft className="w-3.5 h-3.5 mr-1" /> 上级
                      </Button>
                      <Button size="sm" onClick={() => { onChangePath(viewers[e.path]!.current); setInputPath(viewers[e.path]!.current) }}>
                        选为路径
                      </Button>
                    </div>
                  </div>
                  {viewers[e.path]?.loading ? (
                    <div className="text-xs text-muted-foreground py-4 flex items-center justify-center"><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> 加载中...</div>
                  ) : viewers[e.path]?.entries?.length ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {viewers[e.path]!.entries.map((d) => (
                        <Button key={d.path} variant="ghost" className="justify-start" onClick={() => loadViewer(e.path, d.path)}>
                          <FolderOpen className="w-4 h-4 mr-2" /> {d.name}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" /> 常用文件夹
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="或粘贴一个绝对路径，例如 /Users/xxx/Pictures"
              value={inputPath}
              onChange={(e) => { setInputPath(e.target.value); onChangePath(e.target.value) }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputPath.trim()) onStart()
              }}
            />
            <Button disabled={!inputPath.trim() || isStarting} onClick={() => onStart()}>
              {isStarting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
              开始初始化
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> 加载常用文件夹...
            </div>
          ) : (
            <div className="space-y-4">
              {byGroups.common.length > 0 && (
                <div className="space-y-2">
                  {renderList(byGroups.common)}
                </div>
              )}
              {byGroups.volumes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">外置磁盘/卷</div>
                  {renderList(byGroups.volumes)}
                </div>
              )}

              {entries.some((e) => !e.readable) && (
                <div className="flex items-center justify-end">
                  <Button variant="outline" size="sm" onClick={probeAllDenied} disabled={probing.__all === true}>
                    {probing.__all ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Unlock className="w-3.5 h-3.5 mr-2" />}
                    一键获取常用目录权限
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
