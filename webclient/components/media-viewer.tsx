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
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Keyboard } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/keyboard'

type MediaViewerProps = {
  media: MediaItem
  currentIndex: number
  allMedia: MediaItem[]
  onClose: () => void
  onNavigate: (direction: "prev" | "next") => void | Promise<void>
  onMediaUpdate: (mediaId: number, updates: Partial<MediaItem>) => void
  onMediaRemove: (mediaIds: number[]) => void
  onIndexChange: (index: number) => void
}

export function MediaViewer({ media, currentIndex, allMedia, onClose, onNavigate, onMediaUpdate, onMediaRemove, onIndexChange }: MediaViewerProps) {
  const [currentMedia, setCurrentMedia] = useState(media)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(currentIndex)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isLiked, setIsLiked] = useState(Boolean(media.liked))
  const [isFavorited, setIsFavorited] = useState(Boolean(media.favorited))
  const [likeLoading, setLikeLoading] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const swiperRef = useRef<any>(null)
  const { toast } = useToast()

  // 检测移动端设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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

  // 同步 Swiper 索引变化
  useEffect(() => {
    if (swiperRef.current && currentSlideIndex !== currentIndex) {
      swiperRef.current.slideTo(currentIndex)
    }
  }, [currentIndex, currentSlideIndex])

  // 当媒体项变化时更新状态
  useEffect(() => {
    setCurrentMedia(media)
    setIsLiked(Boolean(media.liked))
    setIsFavorited(Boolean(media.favorited))
    setLikeLoading(false)
    setFavoriteLoading(false)
    setIsDeleting(false)
    setShowDeleteDialog(false)
    setCurrentSlideIndex(currentIndex)
  }, [media, currentIndex])

  
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

  const handleSlideChange = (swiper: any) => {
    const newIndex = swiper.activeIndex
    setCurrentSlideIndex(newIndex)
    onIndexChange(newIndex)

    // 更新当前媒体项
    if (allMedia[newIndex]) {
      const newMedia = allMedia[newIndex]
      setCurrentMedia(newMedia)
      setIsLiked(Boolean(newMedia.liked))
      setIsFavorited(Boolean(newMedia.favorited))
    }
  }

  const handlePrev = () => {
    if (swiperRef.current) {
      swiperRef.current.slidePrev()
    } else {
      void onNavigate("prev")
    }
  }

  const handleNext = () => {
    if (swiperRef.current) {
      swiperRef.current.slideNext()
    } else {
      void onNavigate("next")
    }
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

      {/* Swiper Container */}
      <div className="flex-1 relative">
        <Swiper
          modules={[Navigation, Keyboard]}
          initialSlide={currentIndex}
          onSwiper={(swiper) => { swiperRef.current = swiper }}
          onSlideChange={handleSlideChange}
          spaceBetween={0}
          slidesPerView={1}
          navigation={{
            prevEl: '.swiper-button-prev',
            nextEl: '.swiper-button-next',
          }}
          keyboard={{
            enabled: true,
            onlyInViewport: true,
          }}
          resistance={true}
          resistanceRatio={0.85}
          watchSlidesProgress={true}
          loop={false}
          speed={300}
          touchEventsTarget='container'
          allowTouchMove={true}
          touchRatio={1}
          touchAngle={45}
          longSwipes={true}
          longSwipesRatio={0.5}
          shortSwipes={true}
          preventInteractionOnTransition={true}
          centeredSlides={true}
          centeredSlidesBounds={true}
          className="w-full h-full"
          style={{
            width: '100%',
            height: '100%'
          }}
        >
          {allMedia.map((mediaItem, index) => (
            <SwiperSlide key={`${mediaItem.id}-${index}`} className="flex items-center justify-center">
              <div
                className="w-full h-full flex items-center justify-center"
                onDoubleClick={handleDoubleClick}
              >
                {mediaItem.type === "image" ? (
                  <img
                    src={resolveApiUrl(mediaItem.resourceUrl || mediaItem.url || "/file.svg")}
                    alt="Media"
                    className="max-w-full max-h-full object-contain"
                    style={{
                      maxHeight: '100vh',
                      maxWidth: '100vw',
                      objectFit: 'contain'
                    }}
                    onError={(e) => {
                      const target = e.currentTarget
                      if (!target.src.endsWith("/file.svg")) {
                        target.src = resolveApiUrl("/file.svg")
                      }
                    }}
                    draggable={false}
                  />
                ) : (
                  <video
                    src={resolveApiUrl(mediaItem.resourceUrl || mediaItem.url)}
                    controls
                    className="max-w-full max-h-full object-contain"
                    style={{
                      maxWidth: '100vw',
                      maxHeight: '100vh',
                      objectFit: 'contain'
                    }}
                    autoPlay
                    playsInline
                    muted
                  />
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Navigation Arrows - 桌面端显示，移动端隐藏 */}
      {!isMobile && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="swiper-button-prev absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-20"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="w-8 h-8" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="swiper-button-next absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-20"
            onClick={handleNext}
            disabled={currentIndex >= allMedia.length - 1}
          >
            <ChevronRight className="w-8 h-8" />
          </Button>
        </>
      )}

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
