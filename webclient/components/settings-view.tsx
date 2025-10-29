"use client"

import { Settings } from "lucide-react"

export function SettingsView() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center text-muted-foreground">
        <Settings className="w-16 h-16 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium mb-2">设置</p>
        <p className="text-sm">此功能正在开发中...</p>
      </div>
    </div>
  )
}
