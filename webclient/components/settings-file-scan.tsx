"use client"

import { useState, useEffect } from "react"
import { Monitor, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
        description: "无法获取文件索引服务的当前状态",
        variant: "destructive"
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
        description: error instanceof Error ? error.message : "设置更新失败，请重试",
        variant: "destructive"
      })
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              <CardTitle>文件索引服务</CardTitle>
            </div>
            <Switch
              id="scan-enabled"
              checked={localSettings.enabled}
              onCheckedChange={(enabled) => updateSetting({ enabled })}
            />
          </div>
          <CardDescription>
            开启后将自动监控媒体目录的新文件变化
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {localSettings.enabled && (
            <>
              {/* 扫描模式选择 */}
              <div className="space-y-4">
                <Label className="text-base font-medium">扫描模式</Label>
                <RadioGroup
                  value={localSettings.scan_mode}
                  onValueChange={(scan_mode) => updateSetting({ scan_mode: scan_mode as "realtime" | "scheduled" })}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="realtime" id="realtime" />
                    <Label htmlFor="realtime" className="flex items-center gap-2 cursor-pointer">
                      <div>
                        <p className="font-medium">实时模式</p>
                        <p className="text-sm text-muted-foreground">
                          新文件出现时立即记录
                        </p>
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="scheduled" id="scheduled" />
                    <Label htmlFor="scheduled" className="flex items-center gap-2 cursor-pointer">
                      <div>
                        <p className="font-medium">定时模式</p>
                        <p className="text-sm text-muted-foreground">
                          按固定间隔检查新文件
                        </p>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* 定时扫描间隔设置 */}
              {localSettings.scan_mode === "scheduled" && (
                <div className="space-y-2">
                  <Label htmlFor="scan-interval" className="text-base font-medium">
                    扫描间隔
                  </Label>
                  <Select
                    value={localSettings.scan_interval}
                    onValueChange={(scan_interval) => updateSetting({ scan_interval: scan_interval as "hourly" | "daily" | "weekly" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">每小时扫描一次</SelectItem>
                      <SelectItem value="daily">每天扫描一次</SelectItem>
                      <SelectItem value="weekly">每周扫描一次</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {/* 状态消息显示 */}
          {status.message && (
            <div className="p-3 rounded-md bg-muted border">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{status.message}</p>
              </div>
            </div>
          )}

                  </CardContent>
      </Card>
    </div>
  )
}
