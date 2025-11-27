"use client"

import { useEffect, useState } from "react"
import { Activity, Database, Gauge, ImageIcon, Sparkles, VideoIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import {
  type ArtifactProgressItem,
  type AssetPipelineStatus,
  type ClipIndexStatus,
  type ScanTaskStatus,
  getAssetPipelineStatus,
  getClipIndexStatus,
  getScanTaskStatus,
} from "@/lib/api"

function formatPercent(numerator: number, denominator: number | null | undefined): string {
  if (!denominator || denominator <= 0) return "—"
  const ratio = numerator / denominator
  if (!Number.isFinite(ratio) || ratio < 0) return "—"
  return `${Math.round(ratio * 100)}%`
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString()
  } catch {
    return "—"
  }
}

function artifactLabel(item: ArtifactProgressItem): string {
  switch (item.artifact_type) {
    case "thumbnail":
      return "缩略图"
    case "metadata":
      return "元数据"
    case "placeholder":
      return "占位图"
    case "transcode":
      return "转码"
    default:
      return item.artifact_type
  }
}

function artifactIcon(type: ArtifactProgressItem["artifact_type"]) {
  switch (type) {
    case "thumbnail":
      return <ImageIcon className="w-4 h-4" />
    case "metadata":
      return <Sparkles className="w-4 h-4" />
    case "placeholder":
      return <Activity className="w-4 h-4" />
    case "transcode":
      return <VideoIcon className="w-4 h-4" />
    default:
      return <Activity className="w-4 h-4" />
  }
}

export function SettingsTasksPanel() {
  const { toast } = useToast()
  const [scanStatus, setScanStatus] = useState<ScanTaskStatus | null>(null)
  const [assetStatus, setAssetStatus] = useState<AssetPipelineStatus | null>(null)
  const [clipStatus, setClipStatus] = useState<ClipIndexStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [scan, asset, clip] = await Promise.allSettled([
        getScanTaskStatus(false),
        getAssetPipelineStatus(),
        getClipIndexStatus(),
      ])

      if (scan.status === "fulfilled") {
        setScanStatus(scan.value)
      } else {
        toast({
          title: "获取索引进度失败",
          description: scan.reason instanceof Error ? scan.reason.message : "无法获取索引统计数据",
        })
      }

      if (asset.status === "fulfilled") {
        setAssetStatus(asset.value)
      } else {
        toast({
          title: "获取资产流水线状态失败",
          description: asset.reason instanceof Error ? asset.reason.message : "无法获取资产处理状态",
        })
      }

      if (clip.status === "fulfilled") {
        setClipStatus(clip.value)
      } else {
        toast({
          title: "获取向量索引状态失败",
          description: clip.reason instanceof Error ? clip.reason.message : "无法获取向量索引状态",
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()

    if (typeof window === "undefined") {
      return
    }
    const handler = () => {
      void loadAll()
    }
    window.addEventListener("media-sources-changed", handler)
    return () => {
      window.removeEventListener("media-sources-changed", handler)
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* 媒体索引进度 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5" />
            <CardTitle>媒体索引进度</CardTitle>
          </div>
          <CardDescription>
            显示当前媒体库的整体索引情况（数据库已入库 vs 文件系统已发现）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {scanStatus ? (
            <>
              <div className="flex flex-wrap gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">已入库 / 总发现</div>
                  <div className="font-medium">
                    {scanStatus.scanned_count} / {scanStatus.total_discovered ?? "—"}{" "}
                    <span className="text-xs text-muted-foreground ml-1">
                      {formatPercent(scanStatus.scanned_count, scanStatus.total_discovered)}
                    </span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">预计剩余</div>
                  <div className="font-medium">
                    {scanStatus.remaining_count ?? "—"}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">媒体根目录</div>
                  <div className="font-mono text-xs break-all">
                    {scanStatus.media_root_path || "未配置"}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
                <span>
                  状态：{scanStatus.state === "no_media_root" && "未配置媒体目录"}
                  {scanStatus.state === "ready" && "正常"}
                  {scanStatus.state === "error" && "错误"}
                  {scanStatus.message ? ` · ${scanStatus.message}` : ""}
                </span>
                <span>统计时间：{formatDateTime(scanStatus.generated_at)}</span>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              {loading ? "正在获取索引进度..." : "暂无索引统计数据。"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 资产流水线进度：缩略图 / 元数据 / 占位图 / 转码 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            <CardTitle>资产处理进度</CardTitle>
          </div>
          <CardDescription>
            包括缩略图、元数据、转码等后台任务的整体完成度。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {assetStatus ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {assetStatus.items.map((item) => (
                  <div
                    key={item.artifact_type}
                    className="border rounded-md p-2.5 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {artifactIcon(item.artifact_type)}
                        <span className="text-xs font-medium">
                          {artifactLabel(item)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatPercent(item.ready_count, item.total_media)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>已完成 {item.ready_count}</span>
                      <span>排队 {item.queued_count}</span>
                      <span>处理中 {item.processing_count}</span>
                      {item.failed_count > 0 && (
                        <span className="text-red-500">
                          失败 {item.failed_count}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  流水线：{assetStatus.started ? "已启动" : "未启动"} · 工作线程{" "}
                  {assetStatus.worker_count} · 队列长度约 {assetStatus.queue_size}
                </span>
                {assetStatus.message && (
                  <span className="truncate max-w-[240px] text-right">
                    {assetStatus.message}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              {loading ? "正在获取资产处理状态..." : "暂无资产处理统计数据。"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 向量索引覆盖率：CLIP / SigLIP */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <CardTitle>向量索引进度（CLIP / SigLIP）</CardTitle>
          </div>
          <CardDescription>
            文本搜图 / 图搜图依赖的向量索引覆盖情况。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {clipStatus ? (
            <>
              <div className="flex flex-wrap gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">已构建向量的媒体</div>
                  <div className="font-medium">
                    {clipStatus.total_media_with_embeddings} / {clipStatus.total_media}{" "}
                    <span className="text-xs text-muted-foreground ml-1">
                      {formatPercent(
                        clipStatus.total_media_with_embeddings,
                        clipStatus.total_media,
                      )}
                    </span>
                  </div>
                </div>
              </div>
              {clipStatus.models.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {clipStatus.models.map((m) => (
                    <div
                      key={m.model}
                      className="border rounded-md p-2.5 space-y-1.5 text-xs"
                    >
                      <div className="font-medium break-all">{m.model}</div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          覆盖 {m.media_with_embedding} 个媒体
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          最近更新 {formatDateTime(m.last_updated_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  当前数据库中尚未检测到任何向量索引记录，请先在后端运行一次 /clip/rebuild。
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              {loading ? "正在获取向量索引状态..." : "暂无向量索引统计数据。"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
