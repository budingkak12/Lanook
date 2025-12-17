"use client"

import { useState, useEffect } from "react"
import { Monitor, AlertCircle } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"
import { apiFetch } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface AutoScanStatus {
  enabled: boolean
  active: boolean
  scan_mode: "realtime" | "scheduled" | null
  scan_interval: "hourly" | "daily" | "weekly" | null
  message: string | null
}

export function SettingsFileScan() {
  const { toast } = useToast()
  const [status, setStatus] = useState<AutoScanStatus>({
    enabled: false,
    active: false,
    scan_mode: null,
    scan_interval: null,
    message: null
  })
  const [isLoading, setIsLoading] = useState(false)
  const [localSettings, setLocalSettings] = useState({
    enabled: false,
    scan_mode: "realtime" as "realtime" | "scheduled",
    scan_interval: "hourly" as "hourly" | "daily" | "weekly"
  })

  const fetchStatus = async () => {
    try {
      setIsLoading(true)
      const response = await apiFetch("/settings/auto-scan")
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
        setLocalSettings({
          enabled: data.enabled,
          scan_mode: data.scan_mode || "realtime",
          scan_interval: data.scan_interval || "hourly"
        })
      } else {
        throw new Error("获取状态失败")
      }
    } catch (error) {
      console.error("获取文件扫描状态失败:", error)
      toast({
        title: "获取状态失败",
        description: "无法获取文件索引服务的当前状态"
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 即时更新设置
  const updateSetting = async (updates: Partial<typeof localSettings>) => {
    let newSettings = { ...localSettings, ...updates }

    // 如果用户启用了服务但还没有设置扫描模式，默认使用实时模式
    if (newSettings.enabled && !newSettings.scan_mode) {
      newSettings = { ...newSettings, scan_mode: "realtime" }
    }

    setLocalSettings(newSettings)

    const payload = {
      enabled: newSettings.enabled,
      scan_mode: newSettings.enabled ? newSettings.scan_mode : null,
      scan_interval: newSettings.enabled && newSettings.scan_mode === "scheduled"
        ? newSettings.scan_interval
        : null
    }

    try {
      const response = await apiFetch("/settings/auto-scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || "更新设置失败")
      }
    } catch (error) {
      console.error("更新文件扫描设置失败:", error)
      toast({
        title: "更新失败",
        description: error instanceof Error ? error.message : "设置更新失败，请重试"
      })
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  
  return (
    <div className="space-y-4">
      <div className="rounded-xl overflow-hidden shadow-lg border border-border/50 bg-[rgb(251_251_251)]">
        <div className="px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-[rgb(74_77_78)]">
              <Monitor className="w-5 h-5 text-[rgb(130_133_134)]" />
              <span>文件索引服务</span>
            </div>
            <div className="mt-1 text-xs text-[rgb(120_123_124)]">
              开启后将自动监控媒体目录的新文件变化
              {isLoading ? "（刷新中…）" : ""}
            </div>
          </div>
          <div
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <Switch
              id="scan-enabled"
              checked={localSettings.enabled}
              onCheckedChange={(enabled) => updateSetting({ enabled })}
            />
          </div>
        </div>

        {localSettings.enabled && (
          <div className="px-4 pb-4 space-y-3">
            <div className="text-xs font-medium text-[rgb(74_77_78)]">扫描模式</div>
            <SelectableListCard className="shadow-none">
              <SelectableListItem
                selected={localSettings.scan_mode === "realtime"}
                onSelect={() => updateSetting({ scan_mode: "realtime" })}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">实时模式</div>
                  <div className="text-xs text-[rgb(120_123_124)] mt-0.5">新文件出现时立即记录</div>
                </div>
              </SelectableListItem>
              <SelectableListItem
                selected={localSettings.scan_mode === "scheduled"}
                onSelect={() => updateSetting({ scan_mode: "scheduled" })}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">定时模式</div>
                  <div className="text-xs text-[rgb(120_123_124)] mt-0.5">按固定间隔检查新文件</div>
                </div>
              </SelectableListItem>
            </SelectableListCard>

            {localSettings.scan_mode === "scheduled" && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-[rgb(74_77_78)]">扫描间隔</div>
                <SelectableListCard className="shadow-none">
                  <SelectableListItem
                    selected={localSettings.scan_interval === "hourly"}
                    onSelect={() => updateSetting({ scan_interval: "hourly" })}
                  >
                    每小时扫描一次
                  </SelectableListItem>
                  <SelectableListItem
                    selected={localSettings.scan_interval === "daily"}
                    onSelect={() => updateSetting({ scan_interval: "daily" })}
                  >
                    每天扫描一次
                  </SelectableListItem>
                  <SelectableListItem
                    selected={localSettings.scan_interval === "weekly"}
                    onSelect={() => updateSetting({ scan_interval: "weekly" })}
                  >
                    每周扫描一次
                  </SelectableListItem>
                </SelectableListCard>
              </div>
            )}
          </div>
        )}

        {status.message && (
          <div className="px-4 pb-4">
            <div className="p-3 rounded-lg bg-[rgb(240_242_244)] border border-border/50">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[rgb(120_123_124)] mt-0.5 flex-shrink-0" />
                <p className="text-sm text-[rgb(120_123_124)]">{status.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
