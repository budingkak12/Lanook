"use client"

import { useEffect, useState, useRef, useCallback } from "react"
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
import { batchDeleteMedia, friendlyDeleteError, setFavorite, setLike, resolveApiUrl } from "@/lib/api"

type MediaViewerProps = {
  media: MediaItem
  currentIndex: number
  onClose: () => void
  onNavigate: (direction: "prev" | "next") => void | Promise<void>
  onMediaUpdate: (mediaId: number, updates: Partial<MediaItem>) => void
  onMediaRemove: (mediaIds: number[]) => void
}

export function MediaViewer({ media, onClose, onNavigate, onMediaUpdate, onMediaRemove }: MediaViewerProps) {
  const [currentMedia, setCurrentMedia] = useState(media)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isLiked, setIsLiked] = useState(Boolean(media.liked))
  const [isFavorited, setIsFavorited] = useState(Boolean(media.favorited))
  const [likeLoading, setLikeLoading] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowLeft") {
        void onNavigate("prev")
      } else if (e.key === "ArrowRight") {
        void onNavigate("next")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, onNavigate])

  useEffect(() => {
    setCurrentMedia(media)
    setIsLiked(Boolean(media.liked))
    setIsFavorited(Boolean(media.favorited))
    setLikeLoading(false)
    setFavoriteLoading(false)
    setIsDeleting(false)
    setShowDeleteDialog(false)
  }, [media])

  const toggleLike = async () => {
    console.log('🔄 toggleLike called', { likeLoading, isLiked, mediaId: media.mediaId })

    if (likeLoading) {
      console.log('⚠️ likeLoading is true, returning early')
      return
    }

    const target = !isLiked
    console.log('🎯 Target state:', target)

    setLikeLoading(true)
    setIsLiked(target)
    setCurrentMedia((prev) => ({ ...prev, liked: target }))

    try {
      console.log('📡 Calling setLike API:', media.mediaId, target)
      await setLike(media.mediaId, target)
      console.log('✅ setLike API call successful')
      onMediaUpdate(media.mediaId, { liked: target })
      toast({
        title: target ? "已点赞" : "已取消点赞",
      })
    } catch (err) {
      console.error('❌ setLike API call failed:', err)
      const message = err instanceof Error ? err.message : "操作失败，请稍后重试"
      setIsLiked(!target)
      setCurrentMedia((prev) => ({ ...prev, liked: !target }))
      toast({
        title: "点赞失败",
        description: message,
      })
    } finally {
      setLikeLoading(false)
      console.log('🏁 toggleLike finished')
    }
  }

  const toggleFavorite = async () => {
    console.log('🔄 toggleFavorite called', { favoriteLoading, isFavorited, mediaId: media.mediaId })

    if (favoriteLoading) {
      console.log('⚠️ favoriteLoading is true, returning early')
      return
    }

    const target = !isFavorited
    console.log('🎯 Target favorite state:', target)

    setFavoriteLoading(true)
    setIsFavorited(target)
    setCurrentMedia((prev) => ({ ...prev, favorited: target }))

    try {
      console.log('📡 Calling setFavorite API:', media.mediaId, target)
      await setFavorite(media.mediaId, target)
      console.log('✅ setFavorite API call successful')
      onMediaUpdate(media.mediaId, { favorited: target })
      toast({
        title: target ? "已收藏" : "已取消收藏",
      })
    } catch (err) {
      console.error('❌ setFavorite API call failed:', err)
      const message = err instanceof Error ? err.message : "操作失败，请稍后重试"
      setIsFavorited(!target)
      setCurrentMedia((prev) => ({ ...prev, favorited: !target }))
      toast({
        title: "收藏失败",
        description: message,
      })
    } finally {
      setFavoriteLoading(false)
      console.log('🏁 toggleFavorite finished')
    }
  }

  const handleDelete = async () => {
    if (isDeleting) {
      return
    }
    setIsDeleting(true)
    try {
      const result = await batchDeleteMedia([media.mediaId])
      if (result.deleted.includes(media.mediaId)) {
        toast({
          title: "删除成功",
          description: "媒体已删除",
        })
        onMediaRemove(result.deleted)
      }
      if (result.failed.length > 0) {
        const friendly = friendlyDeleteError(result.failed.map((item) => item.reason))
        toast({
          title: "删除失败",
          description: friendly ?? "删除未完成，请稍后重试",
        })
      } else {
        setShowDeleteDialog(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败，请稍后重试"
      toast({
        title: "删除失败",
        description: message,
      })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleDoubleClick = () => {
    void toggleLike()
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
          disabled={isDeleting}
          onClick={() => setShowDeleteDialog(true)}
          className="text-white hover:bg-white/20"
        >
          <Trash2 className="w-5 h-5" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden" onDoubleClick={handleDoubleClick}>
        {currentMedia.type === "image" ? (
          <img
            src={resolveApiUrl(currentMedia.resourceUrl || currentMedia.url || "/file.svg")}
            alt="Media"
            className="h-full w-auto object-cover"
            style={{
              maxHeight: '100vh',
              objectFit: 'cover'
            }}
            onError={(e) => {
              const target = e.currentTarget
              if (!target.src.endsWith("/file.svg")) {
                target.src = resolveApiUrl("/file.svg")
              }
            }}
          />
        ) : (
          <video
            src={resolveApiUrl(currentMedia.resourceUrl || currentMedia.url)}
            controls
            className="w-full h-auto object-contain"
            style={{
              maxWidth: '100vw',
              maxHeight: '100vh',
              objectFit: 'contain'
            }}
            autoPlay
          />
        )}
      </div>

      {/* Navigation Arrows */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
        onClick={() => void onNavigate("prev")}
      >
        <ChevronLeft className="w-8 h-8" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
        onClick={() => void onNavigate("next")}
      >
        <ChevronRight className="w-8 h-8" />
      </Button>

      {/* Bottom Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-4 bg-gradient-to-t from-black/50 to-transparent">
        <Button
          variant="ghost"
          size="icon"
          disabled={likeLoading || isDeleting}
          onClick={() => void toggleLike()}
          className={`text-white hover:bg-white/20 ${isLiked ? "text-red-500" : ""}`}
        >
          <Heart className={`w-6 h-6 ${isLiked ? "fill-current" : ""}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={favoriteLoading || isDeleting}
          onClick={() => void toggleFavorite()}
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
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={() => void handleDelete()}>
              {isDeleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
