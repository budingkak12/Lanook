"use client"

import { useEffect, useState } from "react"
import { Activity, Database, Gauge, ImageIcon, Sparkles, Users } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import {
  type ArtifactProgressItem,
  type AssetPipelineStatus,
  type ScanTaskStatus,
  getAssetPipelineStatus,
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
    case "vector":
      return "以文/以图搜图"
    case "tags":
      return "标签筛选"
    case "faces":
      return "人脸聚类"
    case "thumbnail":
      return "缩略图"
    default:
      return item.artifact_type
  }
}

function artifactIcon(type: ArtifactProgressItem["artifact_type"]) {
  switch (type) {
    case "vector":
      return <Sparkles className="w-4 h-4" />
    case "tags":
      return <Sparkles className="w-4 h-4" />
    case "faces":
      return <Users className="w-4 h-4" />
    case "thumbnail":
      return <ImageIcon className="w-4 h-4" />
    default:
      return <Activity className="w-4 h-4" />
  }
}

export function SettingsTasksPanel() {
  const { toast } = useToast()
  const [scanStatus, setScanStatus] = useState<ScanTaskStatus | null>(null)
  const [assetStatus, setAssetStatus] = useState<AssetPipelineStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [scan, asset] = await Promise.allSettled([
        getScanTaskStatus(false),
        getAssetPipelineStatus(),
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

      {/* 资产处理进度：缩略图 / 以文搜图 / 标签筛选 / 人脸聚类 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            <CardTitle>资产处理进度</CardTitle>
          </div>
          <CardDescription>
            包括缩略图、以文搜图、标签筛选、人脸聚类等后台任务的整体完成度。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {assetStatus ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {assetStatus.items
                  .filter((item) =>
                    ["thumbnail", "vector", "tags", "faces"].includes(item.artifact_type),
                  )
                  .map((item) => (
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

    </div>
  )
}
