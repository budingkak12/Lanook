"use client"

import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import type { MediaItem } from "@/app/(main)/types"
import { X, Trash2, ChevronLeft, ChevronRight, RotateCw } from "lucide-react"
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
import { ReactionButton, type ReactionVariant } from "@/components/ui/reaction-button"
import { Swiper, SwiperSlide } from 'swiper/react'
import { Keyboard } from 'swiper/modules'
import 'swiper/css'
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
  onLoadMore?: () => Promise<number> // 新增：加载更多媒体的函数
  hasMore?: boolean // 新增：是否还有更多数据
  isLoadingMore?: boolean // 新增：是否正在加载更多
}

export function MediaViewer({ media, currentIndex, allMedia, onClose, onNavigate, onMediaUpdate, onMediaRemove, onIndexChange, onLoadMore, hasMore = true, isLoadingMore = false }: MediaViewerProps) {
  console.log('🎬 [MediaViewer] 组件初始化')
  console.log('📸 接收到的media:', {
    id: media.id,
    mediaId: media.mediaId,
    filename: media.filename,
    type: media.type
  })
  console.log('📊 接收到的currentIndex:', currentIndex)
  console.log('📊 allMedia.length:', allMedia.length)
  console.log('📋 allMedia前3项:', allMedia.slice(0, 3).map(item => ({
    id: item.id,
    mediaId: item.mediaId,
    filename: item.filename
  })))

  const [currentSlideIndex, setCurrentSlideIndex] = useState(currentIndex)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isLiked, setIsLiked] = useState(Boolean(media.liked))
  const [isFavorited, setIsFavorited] = useState(Boolean(media.favorited))
  const [likeLoading, setLikeLoading] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())
  const [rotation, setRotation] = useState(0)
  const [rotationTransitionEnabled, setRotationTransitionEnabled] = useState(true)
  // 动效预览区已关闭：保留唯一选定方案（YouTube 1.5x）
  const swiperRef = useRef<any>(null)
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({})
  const { toast } = useToast()
  const PrevIcon = ChevronLeft
  const NextIcon = ChevronRight

  // === 动效可调参数（你可以直接改这里的数值来调节速度/幅度） ===
  // >1 更慢，<1 更快
  const REACTION_ANIM_SPEED = 1.0
  const PRIMARY_REACTION_VARIANT: ReactionVariant = "youtube_glow"
  const SHOW_REACTION_VARIANTS_PREVIEW = false

  const REACTION_VARIANTS_PREVIEW: Array<{ id: string; label: string; variant: ReactionVariant; speed: number }> = [
    { id: "yt", label: "YouTube", variant: "youtube", speed: 1.5 },
    { id: "yt-slow", label: "YT 3.0x", variant: "youtube", speed: 3.0 },
    { id: "yt-ripple", label: "YT Ripple", variant: "youtube_ripple", speed: 1.5 },
    { id: "yt-spark", label: "YT Spark", variant: "youtube_spark", speed: 1.5 },
    { id: "yt-glow", label: "YT Glow", variant: "youtube_glow", speed: 1.5 },
    { id: "yt-glow-slow", label: "Glow 3.0x", variant: "youtube_glow", speed: 3.0 },
    { id: "yt-soft", label: "YT Soft", variant: "youtube_soft", speed: 1.5 },
    { id: "tt", label: "抖音", variant: "tiktok", speed: 1.5 },
    { id: "tt-burst", label: "TT Burst", variant: "tiktok_burst", speed: 1.5 },
    { id: "spring", label: "弹簧", variant: "spring", speed: 1.5 },
    { id: "soft", label: "柔和", variant: "soft", speed: 1.5 },
  ]

  const [reactionPreviewActive, setReactionPreviewActive] = useState<Record<string, boolean>>({})

  const ROTATE_STEP_DEG = 90
  const ROTATE_ANIMATION_MS = 200

  const mediaId = useMemo(() => media.mediaId, [media.mediaId])

  // 避免 rotation 数值无限增长：超过阈值后“无动画”归一化到 0~359
  useEffect(() => {
    if (rotation <= 3600) return
    setRotationTransitionEnabled(false)
    setRotation(rotation % 360)
    queueMicrotask(() => setRotationTransitionEnabled(true))
  }, [rotation])

  // 检测移动端设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])


  // 视频播放管理函数
  const pauseAllVideos = useCallback(() => {
    Object.values(videoRefs.current).forEach(video => {
      if (video && !video.paused) {
        video.pause()
      }
    })
  }, [])

  const playVideo = useCallback((mediaId: string) => {
    const video = videoRefs.current[mediaId]
    if (video && video.paused) {
      video.play().catch(err => {
        console.log('视频自动播放失败:', err)
      })
    }
  }, [])

  const handlePrev = useCallback(() => {
    pauseAllVideos()
    if (swiperRef.current) {
      swiperRef.current.slidePrev()
    } else {
      void onNavigate("prev")
    }
  }, [pauseAllVideos, onNavigate])

  const handleNext = useCallback(() => {
    pauseAllVideos()
    if (swiperRef.current) {
      swiperRef.current.slideNext()
    } else {
      void onNavigate("next")
    }
  }, [pauseAllVideos, onNavigate])

  const handleClose = useCallback(() => {
    pauseAllVideos()
    onClose()
  }, [pauseAllVideos, onClose])

  // 键盘和触摸事件处理
  // 同步 Swiper 索引变化
  useEffect(() => {
    if (swiperRef.current && currentSlideIndex !== currentIndex) {
      // 验证currentIndex是否有效
      const validIndex = Math.min(Math.max(currentIndex, 0), allMedia.length - 1)
      swiperRef.current.slideTo(validIndex)
    }
  }, [currentIndex, currentSlideIndex, allMedia.length])

  // 初始预加载当前图片
  useEffect(() => {
    if (media.type === 'image') {
      const imageUrl = resolveApiUrl(media.resourceUrl || media.url || "/file.svg")

      if (!loadedImages.has(imageUrl)) {
        const img = new Image()
        img.onload = () => {
          setLoadedImages(prev => new Set(prev).add(imageUrl))
        }
        img.src = imageUrl
      }
    }
  }, [media, loadedImages])

  // 预加载图片
  useEffect(() => {
    allMedia.forEach((mediaItem, index) => {
      // 预加载当前项及前后各2项
      if (Math.abs(index - currentIndex) <= 2 && mediaItem.type === 'image') {
        const imageUrl = resolveApiUrl(mediaItem.resourceUrl || mediaItem.url || "/file.svg")

        if (!loadedImages.has(imageUrl)) {
          const img = new Image()
          img.onload = () => {
            setLoadedImages(prev => new Set(prev).add(imageUrl))
          }
          img.src = imageUrl
        }
      }
    })
  }, [allMedia, currentIndex, loadedImages])

  // 当媒体项变化时更新状态
  useEffect(() => {
    console.log('🔄 [MediaViewer useEffect] 媒体项变化')
    console.log('📸 当前media:', {
      id: media.id,
      mediaId: media.mediaId,
      filename: media.filename
    })
    console.log('📊 currentIndex:', currentIndex)
    console.log('📊 allMedia.length:', allMedia.length)

    // 验证传递的currentIndex是否与媒体匹配
    const actualIndex = allMedia.findIndex(item => item.mediaId === media.mediaId)
    console.log('🎯 MediaViewer中计算的actualIndex:', actualIndex)

    const validIndex = actualIndex >= 0 ? actualIndex : currentIndex
    console.log('✅ 使用的validIndex:', validIndex)

    setIsLiked(Boolean(media.liked))
    setIsFavorited(Boolean(media.favorited))
    // 切换媒体时不要出现“回弹旋转”的动画：先关掉 transition，归零后再恢复。
    setRotationTransitionEnabled(false)
    setRotation(0)
    queueMicrotask(() => setRotationTransitionEnabled(true))
    setLikeLoading(false)
    setFavoriteLoading(false)
    setIsDeleting(false)
    setShowDeleteDialog(false)
    setCurrentSlideIndex(validIndex)

    // 如果索引有修正，通知父组件
    if (actualIndex >= 0 && actualIndex !== currentIndex) {
      console.log('🔄 索引修正，通知父组件从', currentIndex, '到', actualIndex)
      onIndexChange(actualIndex)
    }

    // 如果当前是视频，自动播放
    if (media.type === 'video') {
      setTimeout(() => {
        playVideo(media.id)
      }, 300)
    }
  }, [media, currentIndex, allMedia, onIndexChange, playVideo])

  // 组件卸载时暂停所有视频并清理引用
  useEffect(() => {
    return () => {
      pauseAllVideos()
      // 强制清空所有视频引用，防止内存泄漏
      videoRefs.current = {}
      console.log('MediaViewer: 组件卸载，已清空所有视频引用')
    }
  }, [pauseAllVideos])

  // 监听页面可见性变化，暂停所有视频
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseAllVideos()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pauseAllVideos])

  // 定时清理机制：每2分钟检查并清理未使用的视频引用
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const ACTIVE_RANGE = 15 // 保留当前±15范围内的视频引用
      let cleanedCount = 0

      Object.keys(videoRefs.current).forEach(key => {
        const mediaIndex = allMedia.findIndex(item => item.id === key)
        if (mediaIndex === -1 || Math.abs(mediaIndex - currentSlideIndex) > ACTIVE_RANGE) {
          // 清理超出范围或不存在的视频引用
          videoRefs.current[key] = null
          delete videoRefs.current[key]
          cleanedCount++
        }
      })

      if (cleanedCount > 0) {
        console.log('MediaViewer: 定时清理完成，清理了', cleanedCount, '个视频引用')
      }
    }, 2 * 60 * 1000) // 2分钟执行一次

    return () => {
      clearInterval(cleanupInterval)
    }
  }, [allMedia, currentSlideIndex])


  const toggleLike = useCallback(async () => {
    if (likeLoading || isDeleting) return

    const target = !isLiked
    setLikeLoading(true)
    setIsLiked(target)

    try {
      await setLike(mediaId, target)
      onMediaUpdate(mediaId, { liked: target })
      toast({ title: target ? "已点赞" : "已取消点赞" })
    } catch (err) {
      // 避免 Next dev “Console Error”覆盖层打断操作体验：这里保留轻量日志即可。
      console.warn("[MediaViewer] setLike failed:", err)
      const message = err instanceof Error ? err.message : "操作失败，请稍后重试"
      setIsLiked(!target)
      toast({
        title: target ? "点赞失败" : "取消点赞失败",
        description: message,
      })
    } finally {
      setLikeLoading(false)
    }
  }, [isDeleting, isLiked, likeLoading, mediaId, onMediaUpdate, toast])

  const toggleFavorite = useCallback(async () => {
    if (favoriteLoading || isDeleting) return

    const target = !isFavorited
    setFavoriteLoading(true)
    setIsFavorited(target)

    try {
      await setFavorite(mediaId, target)
      onMediaUpdate(mediaId, { favorited: target })
      toast({ title: target ? "已收藏" : "已取消收藏" })
    } catch (err) {
      console.warn("[MediaViewer] setFavorite failed:", err)
      const message = err instanceof Error ? err.message : "操作失败，请稍后重试"
      setIsFavorited(!target)
      toast({
        title: target ? "收藏失败" : "取消收藏失败",
        description: message,
      })
    } finally {
      setFavoriteLoading(false)
    }
  }, [favoriteLoading, isDeleting, isFavorited, mediaId, onMediaUpdate, toast])

  // PC 端键盘快捷键：左右切图，下键点赞，Esc 关闭；移动端不触发
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isMobile) return

      if (e.key === "Escape") {
        e.preventDefault()
        handleClose()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        handlePrev()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        handleNext()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        void toggleLike()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleClose, handlePrev, handleNext, toggleLike, isMobile])

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

  const handleDoubleClick = useCallback(() => {
    void toggleLike()
  }, [toggleLike])

  const handleSlideChange = (swiper: any) => {
    const newIndex = swiper.activeIndex
    const prevIndex = currentSlideIndex

    // 暂停之前的视频
    if (allMedia[prevIndex] && allMedia[prevIndex].type === 'video') {
      const prevVideo = videoRefs.current[allMedia[prevIndex].id]
      if (prevVideo && !prevVideo.paused) {
        prevVideo.pause()
      }
    }

    setCurrentSlideIndex(newIndex)
    onIndexChange(newIndex)
    setRotationTransitionEnabled(false)
    setRotation(0)
    queueMicrotask(() => setRotationTransitionEnabled(true))

    // 更新当前媒体项
    if (allMedia[newIndex]) {
      const newMedia = allMedia[newIndex]
      setIsLiked(Boolean(newMedia.liked))
      setIsFavorited(Boolean(newMedia.favorited))

      // 播放当前视频
      if (newMedia.type === 'video') {
        setTimeout(() => {
          playVideo(newMedia.id)
        }, 300) // 延迟播放，确保动画完成
      }
    }

    // 视频引用清理机制：每滑动30次清理一次超出范围的视频引用
    if (newIndex > 0 && newIndex % 30 === 0) {
      const CLEANUP_RANGE = 10 // 保留当前±10范围内的视频引用

      Object.keys(videoRefs.current).forEach(key => {
        const mediaIndex = allMedia.findIndex(item => item.id === key)
        if (mediaIndex === -1 || Math.abs(mediaIndex - newIndex) > CLEANUP_RANGE) {
          // 清理超出范围或不存在的视频引用
          videoRefs.current[key] = null
          delete videoRefs.current[key]
        }
      })

      console.log('MediaViewer: 清理视频引用，当前索引:', newIndex, '保留范围:', CLEANUP_RANGE)
    }

    // 预加载机制：当接近列表末尾时，触发加载更多数据
    const PRELOAD_THRESHOLD = 5 // 预加载阈值：距离末尾5个媒体时开始加载
    const shouldPreload = newIndex >= allMedia.length - PRELOAD_THRESHOLD && hasMore && !isLoadingMore && onLoadMore

    if (shouldPreload) {
      console.log('MediaViewer: 触发预加载，当前索引:', newIndex, '总长度:', allMedia.length)
      onLoadMore().catch(err => {
        console.error('MediaViewer: 预加载失败:', err)
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[99999] bg-background flex flex-col animate-in fade-in duration-200"
      onClick={(e) => {
        // 移动端：点背景关闭（仅当点击到背景本身）
        if (isMobile && e.target === e.currentTarget) {
          handleClose()
        }
      }}
    >
      {/* Close & Delete Controls */}
      <div className="pointer-events-none absolute inset-0 flex justify-between items-start p-6 z-[99940]">
        <button
          type="button"
          onClick={handleClose}
          className="pointer-events-auto text-foreground/80 hover:text-foreground transition-colors"
        >
          <X className="w-7 h-7" />
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => setShowDeleteDialog(true)}
          className="pointer-events-auto text-foreground/80 hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-7 h-7" />
        </button>
      </div>

      {/* Swiper Container */}
      <div className="flex-1 relative min-h-0">
        <Swiper
          modules={[Keyboard]}
          initialSlide={Math.min(Math.max(currentIndex, 0), allMedia.length - 1)}
          onSwiper={(swiper) => { swiperRef.current = swiper }}
          onSlideChange={handleSlideChange}
          spaceBetween={0}
          slidesPerView={1}
          keyboard={{
            enabled: true,
            onlyInViewport: true,
          }}
          resistance={true}
          resistanceRatio={0.85}
          watchSlidesProgress={true}
          loop={false}
          // 桌面端缩短切换动画，移动端保持原速度
          speed={isMobile ? 300 : 140}
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
            <SwiperSlide key={`${mediaItem.id}-${index}`} className="flex items-center justify-center bg-background">
              <div
                className="w-full h-full flex items-center justify-center"
              >
                {mediaItem.type === "image" ? (
                  <>
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-background"
                      style={{
                        opacity: loadedImages.has(resolveApiUrl(mediaItem.resourceUrl || mediaItem.url || "/file.svg")) ? 0 : 1,
                        transition: 'opacity 0.3s ease-in-out'
                      }}
                    >
                      <div className="w-8 h-8 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin"></div>
                    </div>
                    <img
                      src={resolveApiUrl(mediaItem.resourceUrl || mediaItem.url || "/file.svg")}
                      alt="Media"
                      onDoubleClick={handleDoubleClick}
                      className={`transition-opacity duration-300 ${loadedImages.has(resolveApiUrl(mediaItem.resourceUrl || mediaItem.url || "/file.svg")) ? 'opacity-100' : 'opacity-0'
                        }`}
                      style={{
                        height: '100vh',
                        width: 'auto',
                        maxWidth: '100vw',
                        objectFit: 'contain',
                        minWidth: '1px',
                        minHeight: '1px',
                        transform: `rotate(${rotation}deg)`,
                        transitionProperty: "transform",
                        transitionDuration: `${rotationTransitionEnabled ? ROTATE_ANIMATION_MS : 0}ms`,
                        transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                      }}
                      onError={(e) => {
                        const target = e.currentTarget
                        if (!target.src.endsWith("/file.svg")) {
                          target.src = resolveApiUrl("/file.svg")
                          setLoadedImages(prev => new Set(prev).add(resolveApiUrl("/file.svg")))
                        }
                      }}
                      draggable={false}
                    />
                  </>
                ) : (
                  <video
                    ref={(el) => {
                      if (el) {
                        videoRefs.current[mediaItem.id] = el
                      }
                    }}
                    src={resolveApiUrl(mediaItem.resourceUrl || mediaItem.url)}
                    controls
                    className="object-contain"
                    onDoubleClick={handleDoubleClick}
                    style={{
                      maxWidth: '100vw',
                      height: '100vh',
                      objectFit: 'contain'
                    }}
                    playsInline
                    muted
                    loop
                    onPlay={(e) => {
                      // 确保只有一个视频在播放
                      const currentVideo = e.currentTarget
                      if (currentSlideIndex !== index) {
                        currentVideo.pause()
                      }
                    }}
                    onEnded={() => {
                      // 视频结束时自动切换到下一个
                      if (currentSlideIndex === index && currentSlideIndex < allMedia.length - 1) {
                        setTimeout(() => {
                          handleNext()
                        }, 500)
                      }
                    }}
                  />
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {!isMobile && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="absolute left-6 top-1/2 -translate-y-1/2 z-[99930] text-white/80 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
              <PrevIcon className="w-6 h-6" />
            </span>
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={currentIndex >= allMedia.length - 1}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-[99930] text-white/80 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
              <NextIcon className="w-6 h-6" />
            </span>
          </button>
        </>
      )}


      {/* Bottom Actions */}
      <div className="absolute bottom-20 sm:bottom-10 left-0 right-0 p-3 sm:p-6 flex items-center justify-center z-[99940]">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-2 sm:py-3 rounded-full bg-white/60 backdrop-blur-md shadow-lg shadow-black/10 border border-white/40">
            <ReactionButton
              kind="like"
              active={isLiked}
              loading={likeLoading}
              onClick={() => void toggleLike()}
              variant={PRIMARY_REACTION_VARIANT}
              speed={REACTION_ANIM_SPEED}
              className={isDeleting ? "pointer-events-none" : ""}
            />
            <ReactionButton
              kind="favorite"
              active={isFavorited}
              loading={favoriteLoading}
              onClick={() => void toggleFavorite()}
              variant={PRIMARY_REACTION_VARIANT}
              speed={REACTION_ANIM_SPEED}
              className={isDeleting ? "pointer-events-none" : ""}
            />
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setRotationTransitionEnabled(true)
                setRotation((prev) => prev + ROTATE_STEP_DEG)
              }}
              className="relative flex h-11 w-11 items-center justify-center text-slate-400 hover:text-slate-500 hover:scale-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCw className="w-8 h-8" />
            </button>
          </div>

          {SHOW_REACTION_VARIANTS_PREVIEW && (
            <div className="mt-2 w-full max-w-[min(46rem,calc(100vw-2rem))]">
              <div className="overflow-x-auto pb-1">
                <div className="flex gap-3 px-1">
                  {REACTION_VARIANTS_PREVIEW.map((item) => {
                    const likeKey = `like:${item.id}`
                    const favKey = `favorite:${item.id}`
                    return (
                      <div key={item.id} className="shrink-0 flex flex-col items-center gap-1">
                        <ReactionButton
                          kind="like"
                          active={Boolean(reactionPreviewActive[likeKey])}
                          loading={false}
                          onClick={() =>
                            setReactionPreviewActive((prev) => ({
                              ...prev,
                              [likeKey]: !prev[likeKey],
                            }))
                          }
                          variant={item.variant}
                          speed={item.speed}
                          sizeClassName="h-9 w-9"
                        />
                        <ReactionButton
                          kind="favorite"
                          active={Boolean(reactionPreviewActive[favKey])}
                          loading={false}
                          onClick={() =>
                            setReactionPreviewActive((prev) => ({
                              ...prev,
                              [favKey]: !prev[favKey],
                            }))
                          }
                          variant={item.variant}
                          speed={item.speed}
                          sizeClassName="h-9 w-9"
                        />
                        <div className="text-[10px] text-white/55">{item.label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="text-[10px] text-white/45 text-center">
                预览区仅用于挑选动画手感，不会影响真实点赞/收藏状态。
              </div>
            </div>
          )}
        </div>
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
