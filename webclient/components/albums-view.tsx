"use client"

import { FolderOpen } from "lucide-react"

export function AlbumsView() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center text-muted-foreground">
        <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium mb-2">相册功能</p>
        <p className="text-sm">此功能正在开发中...</p>
      </div>
    </div>
  )
}
