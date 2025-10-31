"use client"

import { HardDrive } from "lucide-react"
import { SourcesPlanner } from "@/components/sources-planner"

interface InitializationViewProps { onInitialized?: () => void }

export function InitializationView(_props: InitializationViewProps) {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 mb-4">
            <HardDrive className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">欢迎使用媒体库</h1>
          </div>
          <p className="text-muted-foreground">可组合添加多个来源（本机/局域网）；当前仅展示页面交互，未接入后端。</p>
        </div>

        <SourcesPlanner />
      </div>
    </div>
  )
}
