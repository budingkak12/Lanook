"use client"

import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { Eye, EyeOff, Search as SearchIcon, RotateCcw } from "lucide-react"

import type { MediaItem } from "@/app/(main)/types"
import { MediaGrid } from "@/components/media-grid"
import { getAllTags, type TagItem } from "@/lib/api"
import {
  SearchStandaloneButton,
} from "@/components/search/search-capsule"
import { TaggedCapsuleInput, type TagOption } from "@/components/search/tagged-capsule-input"
import { TabLikeButton } from "@/components/ui/tab-like-button"

// --- 类型定义 ---
type SearchIntentViewProps = {
  variant?: "main" | "demo"
}

export function SearchIntentView({ variant = "main" }: SearchIntentViewProps) {
  // --- 状态逻辑 ---
  const [wantInput, setWantInput] = useState("")
  const [wantTags, setWantTags] = useState<string[]>([])
  
  const [notWantInput, setNotWantInput] = useState("")
  const [notWantTags, setNotWantTags] = useState<string[]>([])

  const [appliedQuery, setAppliedQuery] = useState<string | null>(null)
  const [appliedTag, setAppliedTag] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [allTags, setAllTags] = useState<TagOption[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const [preset, setPreset] = useState<"capsule" | "soft" | "stacked" | "tray">("soft")

  // 用于点击容器聚焦 Input
  const wantInputRef = useRef<HTMLInputElement>(null)
  const notWantInputRef = useRef<HTMLInputElement>(null)

  const handleSearchMediaClick = useCallback((media: MediaItem) => {
    console.log("[search] media click", media.mediaId)
  }, [])

  useEffect(() => {
    let mounted = true
    setIsLoadingTags(true)
    getAllTags()
      .then((tags) => {
        if (!mounted) return
        const mapped: TagOption[] = tags.map((tag: TagItem) => ({
          name: tag.name,
          displayName: tag.display_name ?? undefined,
        }))
        setAllTags(mapped)
        setTagError(null)
      })
      .catch((err) => {
        if (!mounted) return
        setTagError(err instanceof Error ? err.message : "标签获取失败")
      })
      .finally(() => {
        if (mounted) setIsLoadingTags(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const handleRunSearch = useCallback(() => {
    const wantTokens = wantInput.split(/\s+/).map((t) => t.trim()).filter(Boolean)
    const notWantTokens = notWantInput.split(/\s+/).map((t) => t.trim()).filter(Boolean)

    const hasContent =
      wantTokens.length > 0 ||
      wantTags.length > 0 ||
      notWantTokens.length > 0 ||
      notWantTags.length > 0

    if (!hasContent) {
      return
    }

    const queryParts: string[] = []
    const positiveText = wantTokens.join(" ")
    if (positiveText) queryParts.push(positiveText)
    if (wantTags.length > 0) queryParts.push(wantTags.join(" "))

    const negativeTokens = [...notWantTokens, ...notWantTags].map((t) =>
      t.startsWith("#") ? t.slice(1) : t,
    )
    if (negativeTokens.length > 0) {
      queryParts.push(negativeTokens.map((t) => `-${t}`).join(" "))
    }

    const composedQuery = queryParts.join(" ").trim()
    const firstPositiveTag = wantTags[0] ?? null

    setAppliedTag(firstPositiveTag)
    setAppliedQuery(composedQuery.length > 0 ? composedQuery : null)
    setRefreshVersion((prev) => prev + 1)
  }, [wantInput, notWantInput, wantTags, notWantTags])

  const hasActiveQuery = useMemo(
    () => (appliedTag === null && !appliedQuery ? false : true),
    [appliedTag, appliedQuery],
  )

  return (
    <div className="h-full flex bg-background font-sans">
      {/* ===========================================
        左侧：搜索控制区
        =========================================== 
      */}
      <div className="w-full max-w-sm flex flex-col bg-transparent">
        
        {/* 状态提示 */}
        <div className="px-4 pt-2">
            {(isLoadingTags || tagError) && (
              <div className="flex items-center gap-2 h-4">
                {isLoadingTags && <span className="text-[10px] text-muted-foreground">数据同步中…</span>}
                {tagError && <span className="text-[10px] text-destructive">{tagError}</span>}
              </div>
            )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

          {/* 样式试验区：方便你在同一页对比挑选 */}
          <section className="space-y-2">
            <div className="text-xs text-muted-foreground">标签输入样式预设（用于挑选最协调的一种）</div>
            <div className="flex flex-wrap gap-2">
              <TabLikeButton active={preset === "soft"} className="h-8 px-3" onClick={() => setPreset("soft")}>
                柔和输入框
              </TabLikeButton>
              <TabLikeButton active={preset === "capsule"} className="h-8 px-3" onClick={() => setPreset("capsule")}>
                胶囊经典
              </TabLikeButton>
              <TabLikeButton active={preset === "stacked"} className="h-8 px-3" onClick={() => setPreset("stacked")}>
                两行标签
              </TabLikeButton>
              <TabLikeButton active={preset === "tray"} className="h-8 px-3" onClick={() => setPreset("tray")}>
                标签区+输入区
              </TabLikeButton>
            </div>
          </section>
          
          {/* --- 想看 (Want) --- */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">想看</span>
            </div>
            <TaggedCapsuleInput
              ref={wantInputRef}
              tone="primary"
              tags={wantTags}
              value={wantInput}
              onChange={setWantInput}
              onTagsChange={setWantTags}
              allTags={allTags}
              placeholder="描述画面，例：夕阳 海边"
              preset={preset}
              onSubmit={handleRunSearch}
            />
          </section>

          {/* --- 不想看 (Not Want) --- */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <EyeOff className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">不想看</span>
            </div>
            <TaggedCapsuleInput
              ref={notWantInputRef}
              tone="destructive"
              tags={notWantTags}
              value={notWantInput}
              onChange={setNotWantInput}
              onTagsChange={setNotWantTags}
              allTags={allTags}
              placeholder="排除内容，例：#nsfw"
              preset={preset}
              onSubmit={handleRunSearch}
            />
          </section>

          {/* 按钮区域：使用统一的独立按钮组件（默认小号，宽度可通过 className 控制） */}
          <div className="flex gap-3 pt-4">
            <SearchStandaloneButton
              icon={<SearchIcon className="w-5 h-5" />}
              className="shadow-lg shadow-primary/20 w-16"
              onClick={handleRunSearch}
            />
            <SearchStandaloneButton
              icon={<RotateCcw className="w-4 h-4" />}
              className="w-16"
              onClick={() => {
                setWantInput("")
                setWantTags([])
                setNotWantInput("")
                setNotWantTags([])
                setAppliedQuery(null)
                setAppliedTag(null)
              }}
            />
          </div>
        </div>
      </div>

      {/* ===========================================
        右侧：搜索结果展示区域
        =========================================== 
      */}
      <div className="flex-1 min-w-0 flex flex-col bg-background">
        <div className="flex-1 overflow-y-auto">
          {hasActiveQuery ? (
            <div className="p-0 h-full">
                <MediaGrid
                  key={refreshVersion}
                  tag={appliedTag}
                  queryText={appliedQuery}
                  sessionId={null}
                  onMediaClick={handleSearchMediaClick}
                />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-4">
               <SearchIcon className="w-16 h-16 stroke-1" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
