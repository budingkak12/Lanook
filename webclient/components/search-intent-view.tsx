"use client"

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, useRef } from "react"
import { Eye, EyeOff, Search as SearchIcon, X, RotateCcw } from "lucide-react"

import type { MediaItem } from "@/app/(main)/types"
import { MediaGrid } from "@/components/media-grid"
import { getAllTags, type TagItem } from "@/lib/api"
import {
  SearchCapsuleInput,
  SearchStandaloneButton,
  searchCapsuleWrapperClass,
} from "@/components/search/search-capsule"
import { cn } from "@/lib/utils"

// --- 类型定义 ---
type TagOption = {
  name: string
  displayName?: string | null
}

type SearchIntentViewProps = {
  variant?: "main" | "demo"
}

const formatDisplayText = (opt: TagOption) =>
  opt.displayName ? `${opt.displayName} · ${opt.name}` : opt.name

const getLastToken = (value: string): string => {
  const parts = value.split(/\s+/).map((t) => t.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? ""
}

const removeLastToken = (value: string): string => {
  const parts = value.split(/\s+/).map((t) => t.trim()).filter(Boolean)
  if (parts.length === 0) return ""
  parts.pop()
  return parts.join(" ")
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

  // 用于点击容器聚焦 Input
  const wantInputRef = useRef<HTMLInputElement>(null)
  const notWantInputRef = useRef<HTMLInputElement>(null)

  const handleSearchMediaClick = useCallback((media: MediaItem) => {
    console.log("[search] media click", media.mediaId)
  }, [])

  // 输入时始终让光标附近内容可见（处理长文本在部分浏览器中不自动滚动的问题）
  const handleWantInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setWantInput(e.target.value)
    const el = e.currentTarget
    // 下一帧再设置 scrollLeft，避免与浏览器默认行为冲突
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth
    })
  }, [])

  const handleNotWantInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNotWantInput(e.target.value)
    const el = e.currentTarget
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth
    })
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

  const filterSuggestions = useMemo(() => {
    return (kw: string) => {
      const key = kw.trim().toLowerCase()
      if (key.length === 0) return [] as TagOption[]
      return allTags
        .filter((t) => formatDisplayText(t).toLowerCase().includes(key))
        .slice(0, 10)
    }
  }, [allTags])

  const wantLastToken = useMemo(() => getLastToken(wantInput), [wantInput])
  const notWantLastToken = useMemo(() => getLastToken(notWantInput), [notWantInput])

  const wantSuggestions = useMemo(
    () => filterSuggestions(wantLastToken),
    [filterSuggestions, wantLastToken],
  )
  const notWantSuggestions = useMemo(
    () => filterSuggestions(notWantLastToken),
    [filterSuggestions, notWantLastToken],
  )

  const handlePickTag = useCallback(
    (field: "want" | "notWant", tagName: string) => {
      if (!tagName.trim()) return
      if (field === "want") {
        setWantTags((prev) => (prev.includes(tagName) ? prev : [...prev, tagName]))
        setWantInput((prev) => removeLastToken(prev))
        wantInputRef.current?.focus()
      } else {
        setNotWantTags((prev) => (prev.includes(tagName) ? prev : [...prev, tagName]))
        setNotWantInput((prev) => removeLastToken(prev))
        notWantInputRef.current?.focus()
      }
    },
    [],
  )

  const handleRemoveTag = useCallback((field: "want" | "notWant", index: number) => {
    if (field === "want") {
      setWantTags((prev) => prev.filter((_, i) => i !== index))
    } else {
      setNotWantTags((prev) => prev.filter((_, i) => i !== index))
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

  // 统一的键盘事件处理：支持 Enter 搜索，支持 Backspace 删除标签
  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>, field: "want" | "notWant", inputValue: string) => {
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      // 如果有联想词，Enter 可能会选词，这里简化为直接搜索
      // 实际场景通常需要判断是否正在选词
      handleRunSearch()
    } else if (e.key === "Backspace" && inputValue === "") {
      // 当输入框为空时按退格，删除最后一个标签
      if (field === "want" && wantTags.length > 0) {
        setWantTags(prev => prev.slice(0, -1))
      } else if (field === "notWant" && notWantTags.length > 0) {
        setNotWantTags(prev => prev.slice(0, -1))
      }
    }
  }

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
          
          {/* --- 想看 (Want) --- */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">想看</span>
            </div>

            <div
              className={cn(
                "group relative min-h-[44px] w-full px-2 py-1.5 cursor-text",
                searchCapsuleWrapperClass,
                // 覆盖胶囊默认的 flex 布局，避免影响内部 input 的宽度计算
                "block",
                // 不在输入时高亮边框/阴影，保持静态视觉
                "focus-within:border-[rgb(150_150_150)] focus-within:ring-0",
              )}
              onClick={() => wantInputRef.current?.focus()}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {/* 标签 (Chips) - 使用 Primary 色 */}
                {wantTags.map((tag, idx) => {
                  const opt = allTags.find((t) => t.name === tag)
                  const label = opt ? formatDisplayText(opt) : tag
                  return (
                    <span
                      key={`want-${idx}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium animate-in fade-in zoom-in duration-200"
                    >
                      <span className="max-w-[120px] truncate">{label}</span>
                      <button
                        type="button"
                        className="rounded-full hover:bg-primary/20 p-0.5 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveTag("want", idx)
                        }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )
                })}
                
                {/* 输入框 */}
                <SearchCapsuleInput
                  ref={wantInputRef}
                  value={wantInput}
                  onChange={handleWantInputChange}
                  onKeyDown={(e) => handleInputKeyDown(e, "want", wantInput)}
                  placeholder={wantTags.length > 0 ? "" : "描述画面，例：夕阳 海边"}
                  className="flex-1 min-w-[80px] bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:border-transparent h-9 px-0"
                  autoComplete="off"
                />
              </div>

              {/* 联想下拉菜单 */}
              {wantLastToken && wantSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden max-h-48 overflow-y-auto z-20">
                  {wantSuggestions.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={() => handlePickTag("want", s.name)}
                    >
                      <span className="text-xs text-muted-foreground">#</span>
                      <div className="min-w-0 flex-1">
                        {s.displayName && <div className="font-medium truncate">{s.displayName}</div>}
                        <div className="text-xs text-muted-foreground truncate">{s.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* --- 不想看 (Not Want) --- */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <EyeOff className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">不想看</span>
            </div>

            <div
              className={cn(
                "group relative min-h-[44px] w-full px-2 py-1.5 cursor-text",
                searchCapsuleWrapperClass,
                "block",
                "focus-within:border-[rgb(150_150_150)] focus-within:ring-0",
              )}
              onClick={() => notWantInputRef.current?.focus()}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {/* 标签 (Chips) - 使用 Destructive 色 (红/警示) 表示排除 */}
                {notWantTags.map((tag, idx) => {
                  const opt = allTags.find((t) => t.name === tag)
                  const label = opt ? formatDisplayText(opt) : tag
                  return (
                    <span
                      key={`notWant-${idx}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium animate-in fade-in zoom-in duration-200"
                    >
                      <span className="max-w-[120px] truncate">-{label}</span>
                      <button
                        type="button"
                        className="rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveTag("notWant", idx)
                        }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )
                })}
                
                {/* 输入框 */}
                <SearchCapsuleInput
                  ref={notWantInputRef}
                  value={notWantInput}
                  onChange={handleNotWantInputChange}
                  onKeyDown={(e) => handleInputKeyDown(e, "notWant", notWantInput)}
                  placeholder={notWantTags.length > 0 ? "" : "排除内容，例：#nsfw"}
                  className="flex-1 min-w-[80px] bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:border-transparent h-9 px-0"
                  autoComplete="off"
                />
              </div>

              {/* 联想下拉菜单 */}
              {notWantLastToken && notWantSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden max-h-48 overflow-y-auto z-20">
                  {notWantSuggestions.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={() => handlePickTag("notWant", s.name)}
                    >
                      <span className="text-xs text-muted-foreground">#</span>
                      <div className="min-w-0 flex-1">
                        {s.displayName && <div className="font-medium truncate">{s.displayName}</div>}
                        <div className="text-xs text-muted-foreground truncate">{s.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
