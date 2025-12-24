"use client"

import { useState } from "react"
import { Album, Users, FolderOpen } from "lucide-react"
import { PeopleView } from "@/components/people-view"
import { CollectionsView } from "@/components/collections-view"
import { FoldersView } from "@/components/folders-view"
import { TabLikeButton } from "@/components/ui/tab-like-button"

function AlbumsPlaceholder() {
  return (
    <div className="h-full flex items-center justify-center border rounded-lg bg-muted/30">
      <div className="text-center text-muted-foreground p-8">
        <Album className="w-14 h-14 mx-auto mb-3 opacity-30" />
        <p className="text-base font-medium mb-1">相册视图筹备中</p>
        <p className="text-sm">传统的树状/列表相册功能正在紧张开发中。</p>
      </div>
    </div>
  )
}

export function AlbumsView() {
  const [tab, setTab] = useState<"albums" | "people" | "collections" | "folders">("collections")

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 h-16 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <TabLikeButton
          active={tab === "collections"}
          className="h-10 px-4"
          icon={<FolderOpen className="w-4 h-4" />}
          onClick={() => setTab("collections")}
        >
          合集
        </TabLikeButton>
        <TabLikeButton
          active={tab === "albums"}
          className="h-10 px-4"
          icon={<Album className="w-4 h-4" />}
          onClick={() => setTab("albums")}
        >
          相册
        </TabLikeButton>
        <TabLikeButton
          active={tab === "people"}
          className="h-10 px-4"
          icon={<Users className="w-4 h-4" />}
          onClick={() => setTab("people")}
        >
          人物
        </TabLikeButton>
        <TabLikeButton
          active={tab === "folders"}
          className="h-10 px-4"
          icon={<FolderOpen className="w-4 h-4" />}
          onClick={() => setTab("folders")}
        >
          文件夹
        </TabLikeButton>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4 lg:px-6 lg:pb-6">
        {tab === "collections" && <CollectionsView />}
        {tab === "albums" && <AlbumsPlaceholder />}
        {tab === "people" && <PeopleView />}
        {tab === "folders" && <FoldersView />}
      </div>
    </div>
  )
}
