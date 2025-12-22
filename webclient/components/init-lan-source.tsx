"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api"
import { cn } from "@/lib/utils"

interface Props {
  onDone?: () => void
}

export function InitLanSource({ onDone }: Props) {
  const { toast } = useToast()
  const [host, setHost] = useState("10.103.30.77")
  const [share, setShare] = useState("")
  const [subPath, setSubPath] = useState("")
  const [anonymous, setAnonymous] = useState(true)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [domain, setDomain] = useState("")
  const [validating, setValidating] = useState(false)
  const [validated, setValidated] = useState<null | { estimated: number, samples: string[] }>(null)
  const [creating, setCreating] = useState(false)
  const [createdSourceId, setCreatedSourceId] = useState<number | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const canSubmit = () => {
    if (!host.trim() || !share.trim()) return false
    if (!anonymous && (!username.trim() || !password.trim())) return false
    return true
  }

  const validate = async () => {
    if (!canSubmit()) {
      toast({ title: "请填写完整信息" })
      return
    }
    setValidating(true)
    setValidated(null)
    try {
      const body: any = { type: "smb", host, share, subPath: subPath || undefined }
      if (anonymous) body.anonymous = true
      else { body.username = username; body.password = password; if (domain) body.domain = domain }
      const resp = await apiFetch("/setup/source/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      setValidated({ estimated: data.estimatedCount, samples: data.samples || [] })
      toast({ title: "验证成功", description: `预计 ${data.estimatedCount} 个媒体文件（只读访问）` })
    } catch (e: any) {
      toast({ title: "验证失败", description: String(e) })
    } finally {
      setValidating(false)
    }
  }

  const createAndScan = async () => {
    if (!canSubmit()) {
      toast({ title: "请填写完整信息" })
      return
    }
    setCreating(true)
    try {
      const body: any = { type: "smb", host, share, subPath: subPath || undefined, displayName: `${host}/${share}${subPath ? '/' + subPath : ''}`, scan: false }
      if (!anonymous) { body.username = username; body.password = password; if (domain) body.domain = domain }
      else { body.anonymous = true }
      const resp = await apiFetch("/setup/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!resp.ok) throw new Error(await resp.text())
      const src = await resp.json()
      setCreatedSourceId(src.id)
      // start scan
      setStarting(true)
      const r2 = await apiFetch(`/scan/start?source_id=${src.id}`, { method: "POST" })
      if (!r2.ok) throw new Error(await r2.text())
      const j = await r2.json()
      setJobId(j.jobId)
      toast({ title: "已开始扫描", description: "可直接进入相册，后台将持续入库。" })
      // 后台扫描即可，直接回调进入首页
      onDone?.()
    } catch (e: any) {
      toast({ title: "创建来源或启动扫描失败", description: String(e) })
    } finally {
      setCreating(false)
      setStarting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">服务器地址</label>
          <input
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="10.103.30.77 或 nas.local"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">共享名称</label>
          <input
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={share}
            onChange={(e) => setShare(e.target.value)}
            placeholder="photo"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">用户名</label>
          <input
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="输入用户名"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">密码</label>
          <input
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="输入密码"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={validating || !canSubmit()}
          onClick={() => void validate()}
          className={cn(
            "px-6 py-2 rounded-md text-sm font-medium transition-colors",
            validating || !canSubmit()
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          )}
        >
          {validating ? "正在验证..." : "验证连接"}
        </button>
      </div>

      {validated && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="text-sm text-blue-800">
            预计找到 {validated.estimated} 个媒体文件
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500">
        程序将以只读方式访问共享文件夹，不会修改或删除任何文件
      </div>
    </div>
  )
}
