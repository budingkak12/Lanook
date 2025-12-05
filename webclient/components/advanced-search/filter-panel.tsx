"use client"

import { Clock, FolderOpen, Image as ImageIcon, ListFilter, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  DIRECTORY_OPTIONS,
  LENGTH_BUCKETS,
  TIME_OPTIONS,
  type FilterState,
} from "./config"

type FilterPanelProps = {
  state: FilterState
  onStateChange: (updater: (prev: FilterState) => FilterState) => void
}

export function FilterPanel({ state, onStateChange }: FilterPanelProps) {
  const toggleDirectory = (dir: string) => {
    onStateChange((prev) => {
      if (dir === "全部") {
        return { ...prev, directories: ["全部"] }
      }
      const exists = prev.directories.includes(dir)
      const next = exists
        ? prev.directories.filter((d) => d !== dir)
        : [...prev.directories.filter((d) => d !== "全部"), dir]
      return { ...prev, directories: next.length === 0 ? ["全部"] : next }
    })
  }

  const toggleLength = (value: string) => {
    onStateChange((prev) => {
      const exists = prev.lengthBuckets.includes(value)
      const next = exists ? prev.lengthBuckets.filter((v) => v !== value) : [...prev.lengthBuckets, value]
      return { ...prev, lengthBuckets: next.length === 0 ? [] : next }
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ListFilter className="w-4 h-4 text-primary" />
        筛选器
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <FolderOpen className="w-3 h-3" />
          目录（多选）
        </p>
        <div className="flex flex-wrap gap-2">
          {DIRECTORY_OPTIONS.map((dir) => {
            const checked = state.directories.includes(dir)
            return (
              <button
                key={dir}
                type="button"
                onClick={() => toggleDirectory(dir)}
                className={`px-3 py-1 rounded-full text-xs border ${
                  checked
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                } transition-colors`}
              >
                {dir}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="自定义目录，如 /mnt/nas/family"
            value={state.customDirectory}
            onChange={(e) => onStateChange((prev) => ({ ...prev, customDirectory: e.target.value }))}
            className="h-9"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!state.customDirectory.trim()) return
              toggleDirectory(state.customDirectory.trim())
              onStateChange((prev) => ({ ...prev, customDirectory: "" }))
            }}
          >
            添加
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ListFilter className="w-3 h-3" />
            媒体类型
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={state.includeImage}
              onCheckedChange={(v) => onStateChange((prev) => ({ ...prev, includeImage: Boolean(v) }))}
            />
            <span className="flex items-center gap-1">
              <ImageIcon className="w-4 h-4" /> 图片
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={state.includeVideo}
              onCheckedChange={(v) => onStateChange((prev) => ({ ...prev, includeVideo: Boolean(v) }))}
            />
            <span className="flex items-center gap-1">
              <Video className="w-4 h-4" /> 视频
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            时间范围
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onStateChange((prev) => ({ ...prev, timeRange: opt.value }))}
                className={`rounded-lg border px-3 py-2 text-xs text-left ${
                  state.timeRange === opt.value
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {state.includeVideo && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">视频长度偏好</p>
          <div className="flex flex-wrap gap-2">
            {LENGTH_BUCKETS.map((bucket) => {
              const active = state.lengthBuckets.includes(bucket.value)
              return (
                <button
                  key={bucket.value}
                  type="button"
                  onClick={() => toggleLength(bucket.value)}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {bucket.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">限制最新 200 条</p>
          <p className="text-[11px] text-muted-foreground">用作候选池，适合“最新随机”场景</p>
        </div>
        <Switch
          checked={state.limitLatest}
          onCheckedChange={(v) => onStateChange((prev) => ({ ...prev, limitLatest: Boolean(v) }))}
        />
      </div>
    </section>
  )
}
