"use client"

import { useCallback, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { MediaGrid } from "@/components/media-grid"
import { MediaCollectionView, type MediaCollectionHandle } from "@/components/media-collection-view"
import type { MediaItem } from "@/app/(main)/types"

export default function FeedPage() {
  const searchParams = useSearchParams()
  const mockMode = searchParams.get("mock") === "1"
  const [sessionId] = useState<string | null>(() =>
    Math.floor(Math.random() * 9e12 + 1e12).toString(),
  )
  const feedCollectionRef = useRef<MediaCollectionHandle | null>(null)

  const handleSearchMediaClick = useCallback((media: MediaItem) => {
    console.log("[search] media click received but no viewer is bound yet", media.mediaId)
  }, [])

  return (
    <div className="h-full">
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
