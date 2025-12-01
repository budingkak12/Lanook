"use client"

import { useState } from "react"
import { Album, Users, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { PeopleView } from "@/components/people-view"

function AlbumsPlaceholder() {
  return (
    <div className="h-full flex items-center justify-center border rounded-lg bg-muted/30">
      <div className="text-center text-muted-foreground p-8">
        <FolderOpen className="w-14 h-14 mx-auto mb-3 opacity-30" />
        <p className="text-base font-medium mb-1">相册视图筹备中</p>
        <p className="text-sm">目前先使用下方“人物”查看人脸分组。</p>
      </div>
    </div>
  )
}

export function AlbumsView() {
  const [tab, setTab] = useState<"albums" | "people">("people")

  return (
    <div className="h-full flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition",
            tab === "albums"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border hover:bg-muted",
          )}
          onClick={() => setTab("albums")}
        >
          <Album className="w-4 h-4" />
          相册
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition",
            tab === "people"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border hover:bg-muted",
          )}
          onClick={() => setTab("people")}
        >
          <Users className="w-4 h-4" />
          人物
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "albums" ? <AlbumsPlaceholder /> : <PeopleView />}
      </div>
    </div>
  )
}
