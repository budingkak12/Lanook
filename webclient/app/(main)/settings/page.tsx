"use client"

import { SettingsView } from "@/components/settings-view"

export default function SettingsPage() {
  return (
    <div className="relative h-full min-h-[100dvh] settings-web-androidlike">
      {/* 强制整屏背景色（覆盖外层 layout 的 bg-background） */}
      <div className="fixed inset-0 bg-[rgb(212_215_218)] z-0" aria-hidden="true" />
      <div className="relative z-10">
        <SettingsView />
      </div>
    </div>
  )
}
