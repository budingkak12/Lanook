"use client"

import { useEffect, useMemo, useState } from "react"
import type { MediaItem } from "@/app/(main)/types"
import { MediaGrid } from "@/components/media-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getAllTags, subscribeAllTags, type TagItem } from "@/lib/api"
import { Loader2, Search, X, Filter } from "lucide-react"

type SearchViewProps = {
  onMediaClick: (media: MediaItem) => void
}

type TagOption = {
  name: string
  displayName?: string | null
}

const formatDisplayText = (opt: TagOption) =>
  opt.displayName ? `${opt.displayName} · ${opt.name}` : opt.name

const resolveInputToName = (input: string, options: TagOption[]): string | null => {
  const trimmed = input.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  for (const opt of options) {
    const dn = opt.displayName?.toLowerCase()
    const combo = formatDisplayText(opt).toLowerCase()
    if (
      lower === opt.name.toLowerCase() ||
      (dn && lower === dn) ||
      lower === combo
    ) {
      return opt.name
    }
  }
  return null
}

export function SearchView({ onMediaClick }: SearchViewProps) {
  const fieldShellClass =
    "px-2 py-2 relative"

  const [textInput, setTextInput] = useState("")
  const [tagInput, setTagInput] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [appliedQuery, setAppliedQuery] = useState<string | null>(null)
  const [appliedTag, setAppliedTag] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<TagOption[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [includeAnyInput, setIncludeAnyInput] = useState("")
  const [excludeInput, setExcludeInput] = useState("")
  const [includeAnyTags, setIncludeAnyTags] = useState<string[]>([])
  const [excludeTags, setExcludeTags] = useState<string[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1)

  // 拉取并缓存全部标签（同安卓端逻辑：首次进来加载一次，后续复用）
  useEffect(() => {
    let mounted = true
    setIsLoadingTags(true)
    const unsubscribe = subscribeAllTags((tags) => {
      if (!mounted) return
      const mapped: TagOption[] = tags.map((tag: TagItem) => ({
        name: tag.name,
        displayName: tag.display_name ?? undefined,
      }))
      setAllTags(mapped)
      setTagError(null)
      setIsLoadingTags(false)
    })
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
      unsubscribe()
    }
  }, [])

  const filterSuggestions = useMemo(() => {
    return (kw: string) => {
      const key = kw.trim().toLowerCase()
      if (key.length === 0) return [] as TagOption[]
      return allTags.filter((t) => formatDisplayText(t).toLowerCase().includes(key)).slice(0, 12)
    }
  }, [allTags])

  const tagSuggestions = useMemo(() => filterSuggestions(tagInput), [filterSuggestions, tagInput])
  const includeAnySuggestions = useMemo(
    () => filterSuggestions(includeAnyInput),
    [filterSuggestions, includeAnyInput],
  )
  const excludeSuggestions = useMemo(
    () => filterSuggestions(excludeInput),
    [filterSuggestions, excludeInput],
  )

  const handleAddTag = (tagName: string) => {
    if (!tagName.trim()) return
    setSelectedTags((prev) => (prev.includes(tagName) ? prev : [...prev, tagName]))
    setTagInput("")
    setFormError(null)
  }

  const handleAddIncludeTag = (tagName: string) => {
    if (!tagName.trim()) return
    setIncludeAnyTags((prev) => (prev.includes(tagName) ? prev : [...prev, tagName]))
    setIncludeAnyInput("")
    setFormError(null)
  }

  const handleAddExcludeTag = (tagName: string) => {
    if (!tagName.trim()) return
    setExcludeTags((prev) => (prev.includes(tagName) ? prev : [...prev, tagName]))
    setExcludeInput("")
    setFormError(null)
  }

  const handleRemoveTag = (index: number) => {
    setSelectedTags((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRemoveIncludeTag = (index: number) => {
    setIncludeAnyTags((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRemoveExcludeTag = (index: number) => {
    setExcludeTags((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSearch = (options?: { tags?: string[]; text?: string; exclude?: string[] }) => {
    const searchText = options?.text ?? textInput
    const tags = options?.tags ?? selectedTags
    const exclude = options?.exclude ?? excludeTags

    const trimmedText = searchText.trim()
    const hasContent = trimmedText.length > 0 || tags.length > 0 || exclude.length > 0
    if (!hasContent) {
      setFormError("请输入搜索文字或选择标签")
      return
    }

    setFormError(null)
    // 将标签转译为文本查询词，保留一个可用的标签用于强过滤
    const chosenTag = tags.find((tagName) => allTags.some((t) => t.name === tagName)) ?? null
    const queryParts = [] as string[]
    if (trimmedText) queryParts.push(trimmedText)
    if (tags.length > 0) queryParts.push(tags.join(" "))
    if (exclude.length > 0) {
      queryParts.push(exclude.map((t) => `-${t}`).join(" "))
    }
    const composedQuery = queryParts.join(" ").trim()

    setAppliedTag(chosenTag)
    setAppliedQuery(composedQuery.length > 0 ? composedQuery : null)
    setRefreshVersion((prev) => prev + 1)
  }

  const handleSuggestionPick = (tagName: string) => {
    const nextTags = selectedTags.includes(tagName) ? selectedTags : [...selectedTags, tagName]
    setSelectedTags(nextTags)
    setTagInput("")
    // 自动执行搜索，追求 test.html 的"即时"体验
    setTimeout(() => handleSearch({ tags: nextTags, text: textInput, exclude: excludeTags }), 0)
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-2 py-3 space-y-3">
          <div className="grid md:grid-cols-[2fr_1fr] gap-3 md:gap-4 items-start">
            <div className="space-y-3">
            {/* 文字搜索框 */}
            <div className={fieldShellClass}>
              <div className="flex items-center gap-2 min-h-[36px]">
                <div className="flex-1">
                  <Input
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleSearch()
                      }
                    }}
                    placeholder="输入文字搜索..."
                    className="h-10 w-full rounded-xl border border-border bg-card/80 dark:bg-card/70 px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                    autoComplete="off"
                  />
                </div>
                {textInput && (
                  <button
                    type="button"
                    className="text-muted-foreground text-xs px-1 py-1 hover:text-destructive"
                    onClick={() => setTextInput("")}
                  >
                    清空
                  </button>
                )}
              </div>
            </div>

            {/* 标签搜索框 */}
            <div className={fieldShellClass}>
              <div className="flex flex-wrap items-center gap-2 min-h-[36px]">
                {selectedTags.map((tag, idx) => {
                  const opt = allTags.find((t) => t.name === tag)
                  const label = opt ? formatDisplayText(opt) : tag
                  return (
                    <span
                      key={`${tag}-${idx}`}
                      className="group inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-1 text-xs"
                    >
                      <span className="max-w-[100px] truncate" title={label}>
                        #{label}
                      </span>
                      <button
                        type="button"
                        aria-label="移除标签"
                        className="rounded-full p-0.5 text-blue-700/70 hover:bg-blue-100"
                        onClick={() => handleRemoveTag(idx)}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )
                })}

                <div className="flex-1 min-w-[100px] flex items-center gap-1">
                  <Input
                    value={tagInput}
                    onChange={(e) => {
                      setTagInput(e.target.value)
                      setSelectedSuggestionIndex(-1) // 重置选择索引
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && tagInput === "" && selectedTags.length > 0) {
                        handleRemoveTag(selectedTags.length - 1)
                        return
                      }

                      const suggestions = tagSuggestions
                      const hasNewTagOption = tagInput.trim() && !suggestions.some(s =>
                        s.name.toLowerCase() === tagInput.trim().toLowerCase() ||
                        s.displayName?.toLowerCase() === tagInput.trim().toLowerCase()
                      )
                      const totalOptions = suggestions.length + (hasNewTagOption ? 1 : 0)

                      if (e.key === "ArrowDown") {
                        e.preventDefault()
                        if (totalOptions > 0) {
                          setSelectedSuggestionIndex((prev) =>
                            prev < totalOptions - 1 ? prev + 1 : 0
                          )
                        }
                        return
                      }

                      if (e.key === "ArrowUp") {
                        e.preventDefault()
                        if (totalOptions > 0) {
                          setSelectedSuggestionIndex((prev) =>
                            prev > 0 ? prev - 1 : totalOptions - 1
                          )
                        }
                        return
                      }

                      if (e.key === "Enter") {
                        e.preventDefault()
                        // 如果有选中的建议，选择它
                        if (selectedSuggestionIndex >= 0) {
                          if (selectedSuggestionIndex < suggestions.length) {
                            handleSuggestionPick(suggestions[selectedSuggestionIndex].name)
                          } else if (hasNewTagOption) {
                            handleAddTag(tagInput.trim())
                          }
                          return
                        }
                        // 如果有建议但没有选中，Enter键不添加标签，让用户先选择
                        if (totalOptions > 0) {
                          return
                        }
                        // 只有在没有建议时才直接添加标签
                        const trimmed = tagInput.trim()
                        if (trimmed) {
                          const resolved = resolveInputToName(trimmed, allTags)
                          if (resolved) {
                            handleAddTag(resolved)
                          } else {
                            handleAddTag(trimmed)
                          }
                        }
                      }

                      if (e.key === "Escape") {
                        setSelectedSuggestionIndex(-1)
                        return
                      }
                    }}
                    placeholder="输入标签..."
                    className="h-10 w-full rounded-xl border border-border bg-card/80 dark:bg-card/70 px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                    autoComplete="off"
                  />
                  {tagInput && (
                    <button
                      type="button"
                      className="text-muted-foreground text-xs px-1 py-1 hover:text-destructive"
                      onClick={() => setTagInput("")}
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              {/* 标签建议下拉框 */}
              {tagInput.trim() && tagSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-border bg-popover shadow-lg overflow-hidden max-h-48 overflow-y-auto z-10">
                  {tagSuggestions.map((s, index) => (
                    <button
                      key={s.name}
                      type="button"
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                        selectedSuggestionIndex === index
                          ? 'bg-blue-50 border-r-2 border-blue-500'
                          : 'hover:bg-slate-50'
                      }`}
                      onClick={() => handleSuggestionPick(s.name)}
                    >
                      <span className="text-xs text-muted-foreground">#</span>
                      <div className="min-w-0 flex-1">
                        {s.displayName && <div className="font-medium text-foreground truncate">{s.displayName}</div>}
                        <div className="text-xs text-muted-foreground truncate">{s.name}</div>
                      </div>
                    </button>
                  ))}
                  {/* 如果输入的文本不在建议中，显示"创建新标签"选项 */}
                  {tagInput.trim() && !tagSuggestions.some(s =>
                    s.name.toLowerCase() === tagInput.trim().toLowerCase() ||
                    s.displayName?.toLowerCase() === tagInput.trim().toLowerCase()
                  ) && (
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm border-t border-slate-100 transition-colors ${
                        selectedSuggestionIndex === tagSuggestions.length
                          ? 'bg-blue-50 border-r-2 border-blue-500'
                          : 'hover:bg-slate-50'
                      }`}
                      onClick={() => handleAddTag(tagInput.trim())}
                    >
                      <span className="text-xs text-muted-foreground">+</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-blue-600 font-medium truncate">创建新标签: {tagInput.trim()}</div>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {isLoadingTags && (
                <div className="absolute right-4 top-2 text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>加载标签...</span>
                </div>
              )}
            </div>

            {/* 搜索按钮和筛选按钮 */}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleSearch()} className="flex-1 h-9 text-sm">
                搜索
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsFilterOpen((v) => !v)}
                className="h-9 px-4 md:hidden"
              >
                <Filter className="w-3 h-3 mr-1" />
                {isFilterOpen ? "收起" : "筛选"}
              </Button>
            </div>
          </div>

            {/* 右侧筛选面板（PC 常显） */}
            <div className="hidden md:block">
              <div className="rounded-xl border border-border bg-card shadow-sm p-3 space-y-4">
                <div className="space-y-2 relative">
                  <div className="text-sm font-medium text-foreground">包含任意标签</div>
                  <div className={fieldShellClass}>
                    <div className="flex flex-wrap items-center gap-2">
                      {includeAnyTags.map((tag, idx) => (
                        <span
                          key={`${tag}-inc-${idx}`}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-sm"
                        >
                          <span className="max-w-[150px] truncate" title={tag}>#{tag}</span>
                          <button className="p-1 hover:bg-blue-100 rounded-full" onClick={() => handleRemoveIncludeTag(idx)}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <Input
                        value={includeAnyInput}
                        onChange={(e) => setIncludeAnyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && includeAnyInput === "" && includeAnyTags.length > 0) {
                            handleRemoveIncludeTag(includeAnyTags.length - 1)
                          }
                          if (e.key === "Enter") {
                            e.preventDefault()
                            const resolved = resolveInputToName(includeAnyInput, allTags)
                            handleAddIncludeTag(resolved ?? includeAnyInput)
                          }
                        }}
                        placeholder="输入或选择标签（含其中任意一个即可）"
                        className="h-10 w-full rounded-xl border border-border bg-card/80 dark:bg-card/70 px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                        autoComplete="off"
                      />
                    </div>
                    {includeAnySuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-border bg-popover shadow-lg overflow-hidden max-h-56 overflow-y-auto z-20">
                        {includeAnySuggestions.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3"
                            onClick={() => handleAddIncludeTag(s.name)}
                          >
                            <span className="text-xs text-muted-foreground">#</span>
                            <div className="min-w-0 flex-1">
                              {s.displayName && <div className="text-sm font-medium text-foreground truncate">{s.displayName}</div>}
                              <div className="text-xs text-muted-foreground truncate">{s.name}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <div className="text-sm font-medium text-foreground">不看（排除标签）</div>
                  <div className={fieldShellClass}>
                    <div className="flex flex-wrap items-center gap-2">
                      {excludeTags.map((tag, idx) => (
                        <span
                          key={`${tag}-exc-${idx}`}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-200 text-slate-800 px-3 py-1 text-sm"
                        >
                          <span className="max-w-[150px] truncate" title={tag}>#{tag}</span>
                          <button className="p-1 hover:bg-slate-300 rounded-full" onClick={() => handleRemoveExcludeTag(idx)}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <Input
                        value={excludeInput}
                        onChange={(e) => setExcludeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && excludeInput === "" && excludeTags.length > 0) {
                            handleRemoveExcludeTag(excludeTags.length - 1)
                          }
                          if (e.key === "Enter") {
                            e.preventDefault()
                            const resolved = resolveInputToName(excludeInput, allTags)
                            handleAddExcludeTag(resolved ?? excludeInput)
                          }
                        }}
                        placeholder="不看：输入或选择要排除的标签"
                        className="h-10 w-full rounded-xl border border-border bg-card/80 dark:bg-card/70 px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                        autoComplete="off"
                      />
                    </div>
                    {excludeSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-border bg-popover shadow-lg overflow-hidden max-h-56 overflow-y-auto z-20">
                        {excludeSuggestions.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3"
                            onClick={() => handleAddExcludeTag(s.name)}
                          >
                            <span className="text-xs text-muted-foreground">#</span>
                            <div className="min-w-0 flex-1">
                              {s.displayName && <div className="text-sm font-medium text-foreground truncate">{s.displayName}</div>}
                              <div className="text-xs text-muted-foreground truncate">{s.name}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIncludeAnyTags([])
                      setExcludeTags([])
                      setIncludeAnyInput("")
                      setExcludeInput("")
                    }}
                  >
                    重置
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIncludeAnyTags([])
                        setExcludeTags([])
                        setIncludeAnyInput("")
                        setExcludeInput("")
                      }}
                    >
                      清空
                    </Button>
                    <Button
                      onClick={() => {
                        const mergedTags = Array.from(new Set([...selectedTags, ...includeAnyTags]))
                        setSelectedTags(mergedTags)
                        handleSearch({
                          tags: mergedTags,
                          text: textInput,
                          exclude: excludeTags,
                        })
                      }}
                    >
                      应用筛选
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {tagError && <span className="text-xs text-destructive">{tagError}</span>}
            {formError && <span className="text-xs text-destructive">{formError}</span>}
            {(selectedTags.length > 0 || textInput || tagInput || includeAnyTags.length > 0 || excludeTags.length > 0) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedTags([])
                  setIncludeAnyTags([])
                  setExcludeTags([])
                  setIncludeAnyInput("")
                  setExcludeInput("")
                  setTextInput("")
                  setTagInput("")
                  setAppliedQuery(null)
                  setAppliedTag(null)
                }}
              >
                <X className="w-4 h-4 mr-1" />
                清空全部
              </Button>
            )}
          </div>

          <div className="h-2" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 移动端：点击“筛选”按钮后显示的面板 */}
        {isFilterOpen && (
          <div className="mx-auto max-w-5xl px-2 mt-2 md:hidden">
            <div className="rounded-xl border border-border bg-card shadow-sm p-3 space-y-4">
              <div className="space-y-2 relative">
                <div className="text-sm font-medium text-foreground">包含任意标签</div>
                <div className={fieldShellClass}>
                  <div className="flex flex-wrap items-center gap-2">
                    {includeAnyTags.map((tag, idx) => (
                      <span
                        key={`${tag}-inc-${idx}`}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-sm"
                      >
                        <span className="max-w-[150px] truncate" title={tag}>#{tag}</span>
                        <button className="p-1 hover:bg-blue-100 rounded-full" onClick={() => handleRemoveIncludeTag(idx)}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <Input
                      value={includeAnyInput}
                      onChange={(e) => setIncludeAnyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && includeAnyInput === "" && includeAnyTags.length > 0) {
                          handleRemoveIncludeTag(includeAnyTags.length - 1)
                        }
                        if (e.key === "Enter") {
                          e.preventDefault()
                          const resolved = resolveInputToName(includeAnyInput, allTags)
                          handleAddIncludeTag(resolved ?? includeAnyInput)
                        }
                      }}
                      placeholder="输入或选择标签（含其中任意一个即可）"
                      className="h-10 w-full rounded-xl border border-border bg-card/80 dark:bg-card/70 px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                      autoComplete="off"
                    />
                  </div>
                  {includeAnySuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-border bg-popover shadow-lg overflow-hidden max-h-56 overflow-y-auto z-20">
                      {includeAnySuggestions.map((s) => (
                        <button
                          key={s.name}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3"
                          onClick={() => handleAddIncludeTag(s.name)}
                        >
                          <span className="text-xs text-muted-foreground">#</span>
                          <div className="min-w-0 flex-1">
                            {s.displayName && <div className="text-sm font-medium text-foreground truncate">{s.displayName}</div>}
                            <div className="text-xs text-muted-foreground truncate">{s.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 relative">
                <div className="text-sm font-medium text-foreground">不看（排除标签）</div>
                <div className={fieldShellClass}>
                  <div className="flex flex-wrap items-center gap-2">
                    {excludeTags.map((tag, idx) => (
                      <span
                        key={`${tag}-exc-${idx}`}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-200 text-slate-800 px-3 py-1 text-sm"
                      >
                        <span className="max-w-[150px] truncate" title={tag}>#{tag}</span>
                        <button className="p-1 hover:bg-slate-300 rounded-full" onClick={() => handleRemoveExcludeTag(idx)}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <Input
                      value={excludeInput}
                      onChange={(e) => setExcludeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && excludeInput === "" && excludeTags.length > 0) {
                          handleRemoveExcludeTag(excludeTags.length - 1)
                        }
                        if (e.key === "Enter") {
                          e.preventDefault()
                          const resolved = resolveInputToName(excludeInput, allTags)
                          handleAddExcludeTag(resolved ?? excludeInput)
                        }
                      }}
                      placeholder="不看：输入或选择要排除的标签"
                      className="h-10 w-full rounded-xl border border-border bg-card/80 dark:bg-card/70 px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
                      autoComplete="off"
                    />
                  </div>
                  {excludeSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-border bg-popover shadow-lg overflow-hidden max-h-56 overflow-y-auto z-20">
                      {excludeSuggestions.map((s) => (
                        <button
                          key={s.name}
                          type="button"
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3"
                          onClick={() => handleAddExcludeTag(s.name)}
                        >
                          <span className="text-xs text-muted-foreground">#</span>
                          <div className="min-w-0 flex-1">
                            {s.displayName && <div className="text-sm font-medium text-foreground truncate">{s.displayName}</div>}
                            <div className="text-xs text-muted-foreground truncate">{s.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIncludeAnyTags([])
                    setExcludeTags([])
                    setIncludeAnyInput("")
                    setExcludeInput("")
                  }}
                >
                  重置
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsFilterOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={() => {
                      const mergedTags = Array.from(new Set([...selectedTags, ...includeAnyTags]))
                      setSelectedTags(mergedTags)
                      handleSearch({
                        tags: mergedTags,
                        text: textInput,
                        exclude: excludeTags,
                      })
                      setIsFilterOpen(false)
                    }}
                  >
                    应用筛选
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {appliedTag === null && !appliedQuery ? null : (
          <MediaGrid
            key={refreshVersion}
            tag={appliedTag}
            queryText={appliedQuery}
            sessionId={null}
            selectionBehavior="desktop"
            deleteBehavior="backend"
            onMediaClick={onMediaClick}
          />
        )}
      </div>
    </div>
  )
}
