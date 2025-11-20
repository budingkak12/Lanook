"use client"

import { useCallback } from "react"
import { SearchView } from "@/components/search-view"
import type { MediaItem } from "@/app/(main)/types"

export default function SearchPage() {
  const handleSearchMediaClick = useCallback((media: MediaItem) => {
    console.log("[search] media click received but no viewer is bound yet", media.mediaId)
  }, [])

  return (
    <div className="h-full">
      <SearchView onMediaClick={handleSearchMediaClick} />
    </div>
  )
}
