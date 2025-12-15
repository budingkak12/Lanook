"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

type SourceType = "local" | "smb" | "webdav"

type PlannedSource = {
  id: string
  type: SourceType
  label: string
  // data kept for future submission
  path?: string
  host?: string
  share?: string
  subPath?: string
  username?: string
  domain?: string
  anonymous?: boolean
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

function LocalForm({ onAdd }: { onAdd: (src: PlannedSource) => void }) {
  const { toast } = useToast()
  const [path, setPath] = useState("")
  const suggestions = useMemo(() => {
    const items = [
      "~/Pictures",
      "~/Movies",
      "C:\\Users\\你的名字\\Pictures",
      "/mnt/photos",
      "/Volumes/Photos",
    ]
    return items
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>本机目录</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm mb-1">路径</label>
          <input className="w-full border rounded px-3 py-2" value={path} onChange={(e) => setPath(e.target.value)} placeholder="例如 /Users/you/Pictures 或 C:\\Users\\you\\Pictures" />
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} className="text-xs px-2 py-1 rounded border hover:bg-accent" onClick={() => setPath(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => {
              if (!path.trim()) {
                toast({ title: "请填写路径" })
                return
              }
              onAdd({ id: genId(), type: "local", label: path.trim(), path: path.trim() })
              setPath("")
            }}
          >加入来源列表</Button>
        </div>
        <div className="text-xs text-muted-foreground">只读说明：程序不会修改该目录内的文件。</div>
      </CardContent>
    </Card>
  )
}

function LanForm({ onAdd }: { onAdd: (src: PlannedSource) => void }) {
  const { toast } = useToast()
  const [host, setHost] = useState("172.29.45.119")
  const [share, setShare] = useState("")
  const [subPath, setSubPath] = useState("")
  const [anonymous, setAnonymous] = useState(true)
  const [username, setUsername] = useState("")
  const [domain, setDomain] = useState("")

  return (
    <Card>
      <CardHeader>
        <CardTitle>局域网（SMB 共享）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">主机/IP</label>
            <input className="w-full border rounded px-3 py-2" value={host} onChange={(e) => setHost(e.target.value)} placeholder="例如 172.29.45.119 或 nas.local" />
          </div>
          <div>
            <label className="block text-sm mb-1">共享名</label>
            <input className="w-full border rounded px-3 py-2" value={share} onChange={(e) => setShare(e.target.value)} placeholder="例如 photo" />
          </div>
          <div>
            <label className="block text-sm mb-1">子路径（可选）</label>
            <input className="w-full border rounded px-3 py-2" value={subPath} onChange={(e) => setSubPath(e.target.value)} placeholder="例如 family/2024" />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="anon2" type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            <label htmlFor="anon2" className="text-sm">匿名访问</label>
          </div>
        </div>

        {!anonymous && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1">用户名</label>
              <input className="w-full border rounded px-3 py-2" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="alice" />
            </div>
            <div>
              <label className="block text-sm mb-1">域（可选）</label>
              <input className="w-full border rounded px-3 py-2" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="WORKGROUP" />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={() => {
              if (!host.trim() || !share.trim()) {
                toast({ title: "请填写主机和共享名" })
                return
              }
              const label = `smb://${anonymous ? '' : (domain ? domain + ';' : '')}${anonymous ? '' : username + '@'}${host}/${share}${subPath ? '/' + subPath : ''}`
              onAdd({ id: genId(), type: "smb", label, host, share, subPath, username: anonymous ? undefined : username, domain: anonymous ? undefined : domain, anonymous })
              setHost(""); setShare(""); setSubPath(""); setUsername(""); setDomain(""); setAnonymous(true)
            }}
          >加入来源列表</Button>
        </div>

        <div className="text-xs text-muted-foreground">只读说明：程序不会写入或删除共享内文件，缩略图和数据库仅保存在本机。</div>
      </CardContent>
    </Card>
  )
}

export function SourcesPlanner() {
  const { toast } = useToast()
  const [tab, setTab] = useState<"local" | "lan">("local")
  const [sources, setSources] = useState<PlannedSource[]>([])

  const remove = (id: string) => setSources((prev) => prev.filter((s) => s.id !== id))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex gap-2 border-b mb-2">
          <button className="px-3 py-2 text-sm border-b-2 border-transparent data-[active=true]:border-primary data-[active=true]:text-primary" data-active={tab === 'local'} onClick={() => setTab("local")}>本机</button>
          <button className="px-3 py-2 text-sm border-b-2 border-transparent data-[active=true]:border-primary data-[active=true]:text-primary" data-active={tab === 'lan'} onClick={() => setTab("lan")}>局域网</button>
        </div>
        {tab === "local" ? (
          <LocalForm onAdd={(src) => setSources((prev) => [...prev, src])} />
        ) : (
          <LanForm onAdd={(src) => setSources((prev) => [...prev, src])} />
        )}
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>已选择的来源</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sources.length === 0 && <div className="text-sm text-muted-foreground">从“本机”或“局域网”添加多个来源到列表。</div>}
            {sources.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-2 border rounded">
                <div className="min-w-0">
                  <div className="text-xs uppercase text-muted-foreground">
                    {s.type === 'local' ? 'LOCAL' : s.type.toUpperCase()}
                  </div>
                  <div className="truncate" title={s.label}>{s.label}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => remove(s.id)}>移除</Button>
              </div>
            ))}

            <div className="pt-2 text-xs text-muted-foreground">支持添加多个本机目录与多个局域网共享。</div>

            <Button className="w-full" disabled={sources.length === 0} onClick={() => toast({ title: "预览模式", description: `将提交 ${sources.length} 个来源（未接后端）` })}>下一步（预览，未接后端）</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
