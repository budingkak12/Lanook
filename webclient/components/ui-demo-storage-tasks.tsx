"use client"

import { useState } from "react"
import { HardDrive, Monitor } from "lucide-react"

import { SettingsExpand, SettingsGroup, SettingsPanel, SettingsRow } from "@/components/settings/list-ui"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"
import { Switch } from "@/components/ui/switch"

// 存储与任务总块 / Storage & Tasks Block (一级)
export function StorageSettingsBlockDemo() {
  const [open, setOpen] = useState(true)

  return (
    <SettingsGroup>
      <SettingsRow
        icon={<HardDrive className="w-5 h-5" />}
        title="存储与任务 / Storage & Tasks"
        description="管理媒体库设置、路径配置与后台任务进度"
        expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        showChevron={false}
      />
      <SettingsExpand open={open}>
        <SettingsPanel>
          <div className="space-y-6">
            {/* 二级：文件索引服务卡片 / File Indexing Service card */}
            <StorageTasksSectionDemo />

            {/* 预留区：任务与进度 / Tasks & Progress */}
            <div className="border-t border-[rgb(228_231_234)] pt-4">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="w-4 h-4" />
                <h4 className="text-sm font-medium">任务与进度 / Tasks &amp; Progress</h4>
              </div>
              <div className="text-xs text-[rgb(120_123_124)] bg-[rgb(240_242_244)] rounded-lg px-3 py-2">
                Demo 占位：这里展示后台任务队列和执行进度。
              </div>
            </div>

            {/* 预留区：媒体路径管理 / Media Path Management */}
            <div className="border-t border-[rgb(228_231_234)] pt-4">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="w-4 h-4" />
                <h4 className="text-sm font-medium">媒体路径管理 / Media Paths</h4>
              </div>
              <div className="text-xs text-[rgb(120_123_124)] bg-[rgb(240_242_244)] rounded-lg px-3 py-2">
                Demo 占位：这里配置媒体库路径与挂载信息。
              </div>
            </div>
          </div>
        </SettingsPanel>
      </SettingsExpand>
    </SettingsGroup>
  )
}

// 文件索引服务卡片 / File Indexing Service Card (二级)
export function StorageTasksSectionDemo() {
  const [enabled, setEnabled] = useState(true)
  const [scanMode, setScanMode] = useState<"realtime" | "scheduled">("realtime")
  const [scanInterval, setScanInterval] = useState<"hourly" | "daily" | "weekly">("hourly")

  return (
    <div className="rounded-xl overflow-hidden shadow-lg border border-border/50 bg-[rgb(251_251_251)]">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-[rgb(74_77_78)]">
            <Monitor className="w-5 h-5 text-[rgb(130_133_134)]" />
            <span>文件索引服务 / File Indexing Service</span>
          </div>
          <div className="mt-1 text-xs text-[rgb(120_123_124)]">
            开启后将自动监控媒体目录的新文件变化
          </div>
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <Switch
            id="demo-scan-enabled"
            checked={enabled}
            onCheckedChange={(value) => setEnabled(Boolean(value))}
          />
        </div>
      </div>

      {enabled ? (
        <div className="px-4 pb-4 space-y-3">
          <div className="text-xs font-medium text-[rgb(74_77_78)]">扫描模式 / Scan Mode</div>
          {/* 三级组件：扫描模式选项 / Scan Mode Options */}
          <ScanModeOptionsDemo
            mode={scanMode}
            interval={scanInterval}
            onModeChange={setScanMode}
            onIntervalChange={setScanInterval}
          />
        </div>
      ) : null}
    </div>
  )
}

type ScanMode = "realtime" | "scheduled"
type ScanInterval = "hourly" | "daily" | "weekly"

type ScanModeOptionsDemoProps = {
  // 当前扫描模式 / Current scan mode
  mode: ScanMode
  // 当前扫描间隔（仅定时模式使用）/ Current scan interval (scheduled mode only)
  interval: ScanInterval
  // 模式变更回调 / Mode change callback
  onModeChange?: (mode: ScanMode) => void
  // 间隔变更回调 / Interval change callback
  onIntervalChange?: (interval: ScanInterval) => void
}

// 扫描模式选项组件 / Scan Mode Options Component
function ScanModeOptionsDemo({ mode, interval, onModeChange, onIntervalChange }: ScanModeOptionsDemoProps) {
  const handleModeChange = (next: ScanMode) => {
    onModeChange?.(next)
  }

  const handleIntervalChange = (next: ScanInterval) => {
    onIntervalChange?.(next)
  }

  return (
    <div className="space-y-3">
      {/* 二级列表盒子 / Second-level list card */}
      <SelectableListCard className="shadow-none">
        <SelectableListItem
          selected={mode === "realtime"}
          onSelect={() => handleModeChange("realtime")}
        >
          <div className="min-w-0">
            <div className="text-sm font-medium">实时模式 / Real-time</div>
            <div className="text-xs text-[rgb(120_123_124)] mt-0.5">新文件出现时立即记录</div>
          </div>
        </SelectableListItem>
        <SelectableListItem
          selected={mode === "scheduled"}
          onSelect={() => handleModeChange("scheduled")}
        >
          <div className="min-w-0">
            <div className="text-sm font-medium">定时模式 / Scheduled</div>
            <div className="text-xs text-[rgb(120_123_124)] mt-0.5">按固定间隔检查新文件</div>
          </div>
        </SelectableListItem>
      </SelectableListCard>

      {/* 定时模式下的扫描间隔 / Scan interval for scheduled mode */}
      {mode === "scheduled" ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-[rgb(74_77_78)]">扫描间隔 / Scan Interval</div>
          <SelectableListCard className="shadow-none">
            <SelectableListItem
              selected={interval === "hourly"}
              onSelect={() => handleIntervalChange("hourly")}
            >
              每小时扫描一次 / Scan every hour
            </SelectableListItem>
            <SelectableListItem
              selected={interval === "daily"}
              onSelect={() => handleIntervalChange("daily")}
            >
              每天扫描一次 / Scan every day
            </SelectableListItem>
            <SelectableListItem
              selected={interval === "weekly"}
              onSelect={() => handleIntervalChange("weekly")}
            >
              每周扫描一次 / Scan every week
            </SelectableListItem>
          </SelectableListCard>
        </div>
      ) : null}
    </div>
  )
}
