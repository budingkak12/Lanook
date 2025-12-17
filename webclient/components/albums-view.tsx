"use client"

import { useState } from "react"
import { Album, Users, FolderOpen } from "lucide-react"
import { PeopleView } from "@/components/people-view"
import { TabLikeButton } from "@/components/ui/tab-like-button"

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
        <TabLikeButton
          active={tab === "albums"}
          className="w-28"
          icon={<Album className="w-4 h-4" />}
          onClick={() => setTab("albums")}
        >
          相册
        </TabLikeButton>
        <TabLikeButton
          active={tab === "people"}
          className="w-28"
          icon={<Users className="w-4 h-4" />}
          onClick={() => setTab("people")}
        >
          人物
        </TabLikeButton>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "albums" ? <AlbumsPlaceholder /> : <PeopleView />}
      </div>
    </div>
  )
}
