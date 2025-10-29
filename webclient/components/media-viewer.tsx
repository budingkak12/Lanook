"use client"

import { useState, useEffect } from "react"
import type { MediaItem } from "@/app/page"
import { Button } from "@/components/ui/button"
import { X, ChevronLeft, ChevronRight, Heart, Star, Trash2 } from "lucide-react"
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

type MediaViewerProps = {
  media: MediaItem
  currentIndex: number
  onClose: () => void
  onNavigate: (direction: "prev" | "next") => void
}

export function MediaViewer({ media, currentIndex, onClose, onNavigate }: MediaViewerProps) {
  const [currentMedia, setCurrentMedia] = useState(media)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isLiked, setIsLiked] = useState(media.liked)
  const [isFavorited, setIsFavorited] = useState(media.favorited)
  const { toast } = useToast()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowLeft") {
        onNavigate("prev")
      } else if (e.key === "ArrowRight") {
        onNavigate("next")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, onNavigate])

  const handleDoubleClick = () => {
    setIsLiked(!isLiked)
    toast({
      title: isLiked ? "取消点赞" : "已点赞",
    })
  }

  const handleDelete = () => {
    toast({
      title: "删除成功",
      description: "媒体已删除",
    })
    setShowDeleteDialog(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent z-10">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowDeleteDialog(true)}
          className="text-white hover:bg-white/20"
        >
          <Trash2 className="w-5 h-5" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4" onDoubleClick={handleDoubleClick}>
        {currentMedia.type === "image" ? (
          <img
            src={currentMedia.url || "/placeholder.svg"}
            alt="Media"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <video src={currentMedia.url} controls className="max-w-full max-h-full" autoPlay />
        )}
      </div>

      {/* Navigation Arrows */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
        onClick={() => onNavigate("prev")}
      >
        <ChevronLeft className="w-8 h-8" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
        onClick={() => onNavigate("next")}
      >
        <ChevronRight className="w-8 h-8" />
      </Button>

      {/* Bottom Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-4 bg-gradient-to-t from-black/50 to-transparent">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setIsLiked(!isLiked)
            toast({ title: isLiked ? "取消点赞" : "已点赞" })
          }}
          className={`text-white hover:bg-white/20 ${isLiked ? "text-red-500" : ""}`}
        >
          <Heart className={`w-6 h-6 ${isLiked ? "fill-current" : ""}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setIsFavorited(!isFavorited)
            toast({ title: isFavorited ? "取消收藏" : "已收藏" })
          }}
          className={`text-white hover:bg-white/20 ${isFavorited ? "text-yellow-500" : ""}`}
        >
          <Star className={`w-6 h-6 ${isFavorited ? "fill-current" : ""}`} />
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这个媒体吗？此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
