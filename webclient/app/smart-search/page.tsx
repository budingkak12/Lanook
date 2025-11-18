"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, Image as ImageIcon, Loader2, Search as SearchIcon, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch, resolveApiUrl } from "@/lib/api"

type ClipSearchItem = {
  mediaId: number
  filename: string
  mediaType: string
  createdAt: string
  url: string
  resourceUrl: string
  thumbnailUrl: string
  score: number
}

type ClipSearchResponse = {
  model: string
  mode: string
  used_index: boolean
  count: number
  items: ClipSearchItem[]
}

export default function SmartSearchPage() {
  const [queryText, setQueryText] = useState("夕阳 海边")
  const [imageId, setImageId] = useState("")
  const [topK, setTopK] = useState(12)
  const [model, setModel] = useState("siglip")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [respMeta, setRespMeta] = useState<{ model: string; used: boolean; mode: string } | null>(null)
  const [items, setItems] = useState<ClipSearchItem[]>([])

  const payloadPreview = useMemo(() => {
    const payload: Record<string, unknown> = { top_k: topK }
    if (queryText.trim()) payload["query_text"] = queryText.trim()
    if (imageId.trim()) payload["image_id"] = Number(imageId)
    if (model.trim()) payload["model"] = model.trim()
    return JSON.stringify(payload, null, 2)
  }, [queryText, imageId, topK, model])

  const runSearch = async () => {
    if (!queryText.trim() && !imageId.trim()) {
      setError("请输入文本或图片 ID，至少需要一个条件")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const resp = await apiFetch("/search/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadPreview,
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || `接口错误 ${resp.status}`)
      }

      const data = (await resp.json()) as ClipSearchResponse
      setItems(data.items || [])
      setRespMeta({ model: data.model, used: data.used_index, mode: data.mode })
    } catch (err: any) {
      setError(err?.message || "查询失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto py-10 px-6 space-y-8">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Sparkles className="w-4 h-4" />
              <span>CLIP / SigLIP 向量检索测试页</span>
            </div>
            <h1 className="text-2xl font-bold mt-1">智能搜索</h1>
            <p className="text-sm text-slate-500">输入文本，或填入已有图片 ID 进行图搜图。</p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">返回首页</Link>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SearchIcon className="w-5 h-5" />
              发起检索
            </CardTitle>
            <CardDescription>向后端 /search/clip 发送请求，可选文本或图片 ID。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="queryText">文本查询（可留空）</Label>
                <Input
                  id="queryText"
                  placeholder="例：夕阳 海边 旅行"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageId">图片 ID（可留空，走以图搜图）</Label>
                <Input
                  id="imageId"
                  type="number"
                  inputMode="numeric"
                  placeholder="如 1"
                  value={imageId}
                  onChange={(e) => setImageId(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="model">模型</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="siglip / clip"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topK">返回数量</Label>
                <Input
                  id="topK"
                  type="number"
                  min={1}
                  max={200}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value) || 10)}
                />
              </div>
              <div className="space-y-2">
                <Label>请求示例</Label>
                <pre className="text-xs bg-slate-900 text-slate-100 rounded-md p-3 h-full overflow-auto">{payloadPreview}</pre>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={loading} onClick={runSearch}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    查询中...
                  </>
                ) : (
                  <>
                    <SearchIcon className="w-4 h-4 mr-2" />
                    开始搜索
                  </>
                )}
              </Button>
              {respMeta && (
                <div className="text-xs text-slate-600">
                  模型 {respMeta.model} · {respMeta.mode === "image" ? "以图搜图" : "文本搜图"} · {respMeta.used ? "使用 Faiss 索引" : "内存计算"}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              结果 ({items.length})
            </CardTitle>
            <CardDescription>展示得分从高到低的媒体，点击可查看原图。</CardDescription>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <SearchIcon className="w-4 h-4" />
                暂无结果，先提交一次查询。
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {items.map((item) => {
                  const thumb = resolveApiUrl(item.thumbnailUrl || item.url)
                  return (
                    <a
                      key={item.mediaId}
                      href={resolveApiUrl(item.resourceUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="group border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="aspect-square bg-slate-100 overflow-hidden">
                        <img
                          src={thumb}
                          alt={item.filename}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      </div>
                      <div className="px-3 py-2 space-y-1">
                        <div className="text-xs text-slate-500">ID {item.mediaId}</div>
                        <div className="text-sm font-medium truncate" title={item.filename}>{item.filename}</div>
                        <div className="text-xs text-blue-600">score {item.score.toFixed(4)}</div>
                      </div>
                    </a>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

