"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { MediaGrid } from "@/components/media-grid"
import { MediaViewer } from "@/components/media-viewer"
import { SearchView } from "@/components/search-view"
import { AlbumsView } from "@/components/albums-view"
import { SettingsView } from "@/components/settings-view"

export type MediaItem = {
  id: string
  type: "image" | "video"
  url: string
  thumbnail: string
  liked: boolean
  favorited: boolean
  tags: string[]
}

export default function Home() {
  const [activeView, setActiveView] = useState<"feed" | "albums" | "search" | "settings">("feed")
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />

      <main className="flex-1 overflow-hidden">
        {activeView === "feed" && (
          <MediaGrid
            onMediaClick={(media, index) => {
              setSelectedMedia(media)
              setSelectedIndex(index)
            }}
          />
        )}
        {activeView === "albums" && <AlbumsView />}
        {activeView === "search" && (
          <SearchView
            onMediaClick={(media, index) => {
              setSelectedMedia(media)
              setSelectedIndex(index)
            }}
          />
        )}
        {activeView === "settings" && <SettingsView />}
      </main>

      {selectedMedia && (
        <MediaViewer
          media={selectedMedia}
          currentIndex={selectedIndex}
          onClose={() => {
            setSelectedMedia(null)
            setSelectedIndex(-1)
          }}
          onNavigate={(direction) => {
            // Navigation logic will be handled by MediaViewer
          }}
        />
      )}
    </div>
  )
}
