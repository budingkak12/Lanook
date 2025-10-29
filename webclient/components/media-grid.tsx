"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import type { MediaItem } from "@/app/page"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Trash2, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type MediaGridProps = {
  onMediaClick: (media: MediaItem, index: number) => void
}

// Mock data generator
const generateMockMedia = (startId: number, count: number): MediaItem[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `media-${startId + i}`,
    type: Math.random() > 0.7 ? "video" : ("image" as "image" | "video"),
    url: `/placeholder.svg?height=600&width=800&query=photo ${startId + i}`,
    thumbnail: `/placeholder.svg?height=300&width=400&query=photo ${startId + i}`,
    liked: false,
    favorited: false,
    tags: ["风景", "旅行", "自然"].slice(0, Math.floor(Math.random() * 3) + 1),
  }))
}

export function MediaGrid({ onMediaClick }: MediaGridProps) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(generateMockMedia(0, 20))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [page, setPage] = useState(1)
  const { toast } = useToast()
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((prev) => prev + 1)
        }
      },
      { threshold: 0.1 },
    )

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    if (page > 1) {
      const newItems = generateMockMedia(mediaItems.length, 20)
      setMediaItems((prev) => [...prev, ...newItems])
    }
  }, [page])

  const handleCheckboxClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isSelectionMode) {
      setIsSelectionMode(true)
    }

    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      if (newSet.size === 0) {
        setIsSelectionMode(false)
      }
      return newSet
    })
  }

  const handleDeleteSelected = () => {
    setMediaItems((prev) => prev.filter((item) => !selectedIds.has(item.id)))
    setSelectedIds(new Set())
    setIsSelectionMode(false)
    setShowDeleteDialog(false)
    toast({
      title: "删除成功",
      description: `已删除 ${selectedIds.size} 个项目`,
    })
  }

  const handleCancelSelection = () => {
    setSelectedIds(new Set())
    setIsSelectionMode(false)
  }

  return (
    <div className="h-full flex flex-col">
      {isSelectionMode && (
        <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleCancelSelection}>
              <X className="w-4 h-4 mr-2" />
              取消
            </Button>
            <span className="text-sm text-muted-foreground">已选择 {selectedIds.size} 项</span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={selectedIds.size === 0}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            删除
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {mediaItems.map((item, index) => (
            <div
              key={item.id}
              className="group relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              onClick={() => !isSelectionMode && onMediaClick(item, index)}
            >
              <img
                src={item.thumbnail || "/placeholder.svg"}
                alt={`Media ${item.id}`}
                className="w-full h-full object-cover"
              />

              <div
                className={`absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity ${
                  isSelectionMode ? "opacity-100" : ""
                }`}
                onClick={(e) => handleCheckboxClick(item.id, e)}
              >
                <Checkbox checked={selectedIds.has(item.id)} className="bg-white border-2" />
              </div>

              {item.type === "video" && (
                <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs">视频</div>
              )}
            </div>
          ))}
        </div>

        <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">加载更多...</div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {selectedIds.size} 个项目吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
