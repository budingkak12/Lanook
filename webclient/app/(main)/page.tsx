"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { MediaGrid } from "@/components/media-grid"
import { MediaCollectionView, type MediaCollectionHandle } from "@/components/media-collection-view"
import type { MediaItem } from "@/app/(main)/types"

export default function FeedPage() {
  const searchParams = useSearchParams()
  const mockMode = searchParams.get("mock") === "1"
  const router = useRouter()
  const [sessionId] = useState<string | null>(() =>
    Math.floor(Math.random() * 9e12 + 1e12).toString(),
  )
  const feedCollectionRef = useRef<MediaCollectionHandle | null>(null)

  const handleSearchMediaClick = useCallback((media: MediaItem) => {
    console.log("[search] media click received but no viewer is bound yet", media.mediaId)
  }, [])

  return (
    <div className="h-full">
      <div className="fixed bottom-20 right-4 z-[9999] flex gap-2">
        <button
          className="px-3 py-2 rounded-lg border border-border/60 bg-card/80 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
          onClick={() => {
            router.push("/?forceInit=true&mock=1&initStep=3")
          }}
        >
          调试：跳到初始化第3步
        </button>
      </div>
      <MediaCollectionView
        collectionRef={feedCollectionRef}
        className="h-full"
        renderList={({ listRef, onMediaClick, onItemsChange }) => (
        <MediaGrid
          ref={listRef}
          sessionId={sessionId}
          mockMode={mockMode}
          onMediaClick={onMediaClick}
          onItemsChange={onItemsChange}
        />
        )}
      />
    </div>
  )
}
