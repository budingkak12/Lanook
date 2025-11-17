"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { apiFetch, resolveApiUrl } from "@/lib/api"

type Cluster = {
  id: number
  label: string
  faceCount: number
  representativeMediaId?: number | null
}

type ClusterMediaItem = {
  mediaId: number
  filename: string
  thumbnailUrl?: string | null
}

export default function FaceTestPage() {
  const [loading, setLoading] = useState(true)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [selected, setSelected] = useState<Cluster | null>(null)
  const [clusterItems, setClusterItems] = useState<ClusterMediaItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchClusters = async () => {
      try {
        setLoading(true)
        const resp = await apiFetch("/face-clusters")
        if (!resp.ok) throw new Error(`接口错误 ${resp.status}`)
        const data: Cluster[] = await resp.json()
        setClusters(data)
      } catch (err: any) {
        setError(err?.message || "加载聚类失败")
      } finally {
        setLoading(false)
      }
    }
    fetchClusters()
  }, [])

  const fetchClusterMedia = async (cluster: Cluster) => {
    try {
      setSelected(cluster)
      setClusterItems([])
      setLoading(true)
      const resp = await apiFetch(`/face-clusters/${cluster.id}`)
      if (!resp.ok) throw new Error(`接口错误 ${resp.status}`)
      const data = await resp.json()
      const enriched = (data.items as ClusterMediaItem[]).map((item) => ({
        ...item,
        thumbnailUrl: item.thumbnailUrl ? resolveApiUrl(item.thumbnailUrl) : undefined,
      }))
      setClusterItems(enriched)
    } catch (err: any) {
      setError(err?.message || "加载相册失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto py-10 px-6 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">人脸聚类测试页</h1>
            <p className="text-sm text-slate-500">仅供测试：点击聚类查看该人物的所有照片</p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">返回首页</Link>
        </header>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <div className="rounded-lg border bg-white shadow-sm divide-y">
              <div className="p-4 flex items-center justify-between">
                <h2 className="font-semibold">聚类列表</h2>
                {loading && <span className="text-xs text-slate-400">加载中...</span>}
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                {clusters.length === 0 && !loading && (
                  <div className="p-4 text-sm text-slate-500">暂无数据，先调用 /face-clusters/rebuild</div>
                )}
                {clusters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => fetchClusterMedia(c)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between ${selected?.id === c.id ? "bg-blue-50 border-l-4 border-blue-500" : ""}`}
                  >
                    <div>
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs text-slate-500">{c.faceCount} 张</div>
                    </div>
                    {c.representativeMediaId && (
                      <span className="text-[10px] text-blue-500">封面</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="rounded-lg border bg-white shadow-sm">
              <div className="p-4 flex items-center justify-between">
                <h2 className="font-semibold">{selected ? `${selected.label} 的相册` : "选择一个聚类"}</h2>
                {selected && <span className="text-xs text-slate-500">共 {clusterItems.length} 张</span>}
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {loading && <div className="text-sm text-slate-500">加载中...</div>}
                {!loading && selected && clusterItems.length === 0 && (
                  <div className="text-sm text-slate-500">暂无图片</div>
                )}
                {clusterItems.map((item) => (
                  <div key={item.mediaId} className="group border rounded-md overflow-hidden bg-slate-100">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-500">No thumbnail</div>
                    )}
                    <div className="px-2 py-1 text-xs text-slate-600 truncate">{item.filename}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
