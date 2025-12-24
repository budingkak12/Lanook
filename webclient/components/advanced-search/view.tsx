"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Filter, PanelsTopLeft, Percent, Rocket, Shuffle, Sparkles } from "lucide-react"

import { MediaGrid } from "@/components/media-grid"
import { MediaCollectionView } from "@/components/media-collection-view"
import { Button } from "@/components/ui/button"
import { getAllTags, subscribeAllTags, type TagItem } from "@/lib/api"
import {
  DIRECTORY_OPTIONS,
  LENGTH_BUCKETS,
  PRESET_CONFIG,
  TIME_OPTIONS,
  type ExcludeTag,
  type FilterState,
  type PresetKey,
  type TagSuggestion,
  type TagWeight,
  type WeightState,
} from "./config"
import { FilterPanel } from "./filter-panel"
import { PresetPanel } from "./preset-panel"
import { TagPanel } from "./tag-panel"
import { WeightSlider } from "./weight-slider"

const defaultFilterState: FilterState = {
  directories: ["全部"],
  customDirectory: "",
  includeImage: true,
  includeVideo: true,
  lengthBuckets: ["0-15", "15-60", "60+"],
  timeRange: "all",
  limitLatest: false,
}

const defaultWeightState: WeightState = {
  randomWeight: 50,
  recencyBias: 55,
  videoTilt: 60,
  lengthBias: 55,
  tagBoost: 70,
}

export function AdvancedSearchView() {
  const [filterState, setFilterState] = useState<FilterState>(defaultFilterState)
  const [weights, setWeights] = useState<WeightState>(defaultWeightState)

  const [tagInput, setTagInput] = useState("")
  const [excludeInput, setExcludeInput] = useState("")
  const [tagWeights, setTagWeights] = useState<TagWeight[]>([])
  const [excludeTags, setExcludeTags] = useState<ExcludeTag[]>([])
  const [allTags, setAllTags] = useState<TagSuggestion[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(false)

  const [appliedQuery, setAppliedQuery] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)

  // --- 标签获取 ---
  useEffect(() => {
    let mounted = true
    setIsLoadingTags(true)
    const unsubscribe = subscribeAllTags((tags) => {
      if (!mounted) return
      setAllTags(
        tags.map((t: TagItem) => ({
          name: t.name,
          displayName: t.display_name,
        })),
      )
      setIsLoadingTags(false)
    })
    getAllTags()
      .then((tags) => {
        if (!mounted) return
        setAllTags(
          tags.map((t: TagItem) => ({
            name: t.name,
            displayName: t.display_name,
          })),
        )
      })
      .finally(() => {
        if (mounted) setIsLoadingTags(false)
      })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const tagSuggestions = useMemo(() => {
    const key = tagInput.trim().toLowerCase()
    if (!key) return []
    return allTags
      .filter((t) => (t.displayName ? `${t.displayName} ${t.name}` : t.name).toLowerCase().includes(key))
      .slice(0, 8)
  }, [allTags, tagInput])

  const excludeSuggestions = useMemo(() => {
    const key = excludeInput.trim().toLowerCase()
    if (!key) return []
    return allTags
      .filter((t) => (t.displayName ? `${t.displayName} ${t.name}` : t.name).toLowerCase().includes(key))
      .slice(0, 8)
  }, [allTags, excludeInput])

  const addIncludeTag = (name: string) => {
    if (!name.trim()) return
    setTagWeights((prev) => {
      if (prev.some((t) => t.name === name)) return prev
      return [...prev, { name, weight: 80 }]
    })
    setTagInput("")
  }

  const addExcludeTag = (name: string) => {
    if (!name.trim()) return
    setExcludeTags((prev) => {
      if (prev.some((t) => t.name === name)) return prev
      return [...prev, { name }]
    })
    setExcludeInput("")
  }

  const removeIncludeTag = (name: string) => setTagWeights((prev) => prev.filter((t) => t.name !== name))
  const removeExcludeTag = (name: string) => setExcludeTags((prev) => prev.filter((t) => t.name !== name))

  const applyPreset = useCallback((key: PresetKey) => {
    PRESET_CONFIG[key].apply((partial) => setWeights((prev) => ({ ...prev, ...partial })))
  }, [])

  const resetAll = () => {
    setFilterState(defaultFilterState)
    setWeights(defaultWeightState)
    setTagWeights([])
    setExcludeTags([])
    setAppliedQuery(null)
  }

  const buildQuery = useCallback(() => {
    const parts: string[] = []
    if (!(filterState.directories.length === 1 && filterState.directories[0] === "全部")) {
      parts.push(`dir:${filterState.directories.join("|")}`)
    }
    if (filterState.customDirectory.trim()) {
      parts.push(`dir:${filterState.customDirectory.trim()}`)
    }
    if (!(filterState.includeImage && filterState.includeVideo)) {
      const types: string[] = []
      if (filterState.includeImage) types.push("image")
      if (filterState.includeVideo) types.push("video")
      if (types.length > 0) parts.push(`type:${types.join("|")}`)
    }
    if (filterState.lengthBuckets.length > 0 && filterState.includeVideo) {
      parts.push(`duration:${filterState.lengthBuckets.join("|")}`)
    }
    if (filterState.timeRange !== "all") {
      parts.push(`time:${filterState.timeRange}`)
    }
    if (filterState.limitLatest) {
      parts.push("latest:200")
    }
    if (tagWeights.length > 0) {
      const tagStr = tagWeights.map((t) => `#${t.name}^${(t.weight / 100).toFixed(2)}`).join(",")
      parts.push(`tags:${tagStr}`)
    }
    if (excludeTags.length > 0) {
      const excludeStr = excludeTags.map((t) => `-${t.name}`).join(",")
      parts.push(`tags:${excludeStr}`)
    }
    parts.push(`w_random:${weights.randomWeight}`)
    parts.push(`w_recency:${weights.recencyBias}`)
    parts.push(`w_video:${weights.videoTilt}`)
    parts.push(`w_length:${weights.lengthBias}`)
    parts.push(`w_tag:${weights.tagBoost}`)
    return parts.join(" | ")
  }, [excludeTags, filterState, tagWeights, weights])

  const handleApply = () => {
    const query = buildQuery()
    setAppliedQuery(query.length > 0 ? query : null)
    setRefreshVersion((v) => v + 1)
  }

  const selectionSummary = useMemo(() => {
    const filters: string[] = []
    if (!(filterState.directories.length === 1 && filterState.directories[0] === "全部")) {
      filters.push(`目录: ${filterState.directories.join(" / ")}`)
    }
    if (filterState.customDirectory.trim()) {
      filters.push(`自定义: ${filterState.customDirectory.trim()}`)
    }
    if (!(filterState.includeImage && filterState.includeVideo)) {
      const types = [
        filterState.includeImage ? "图片" : null,
        filterState.includeVideo ? "视频" : null,
      ].filter(Boolean)
      filters.push(`类型: ${types.join(" + ")}`)
    }
    if (
      filterState.includeVideo &&
      filterState.lengthBuckets.length &&
      filterState.lengthBuckets.length < LENGTH_BUCKETS.length
    ) {
      filters.push(`时长: ${filterState.lengthBuckets.join(" / ")}`)
    }
    if (filterState.timeRange !== "all") {
      const timeLabel = TIME_OPTIONS.find((t) => t.value === filterState.timeRange)?.label ?? filterState.timeRange
      filters.push(`时间: ${timeLabel}`)
    }
    if (tagWeights.length > 0) {
      filters.push(`标签: ${tagWeights.map((t) => `${t.name}(${t.weight})`).join(", ")}`)
    }
    if (excludeTags.length > 0) {
      filters.push(`排除: ${excludeTags.map((t) => t.name).join(", ")}`)
    }
    return filters.join(" · ")
  }, [excludeTags, filterState, tagWeights])

  const hasActiveQuery = appliedQuery !== null

  return (
    <div className="h-full flex bg-background font-sans">
      {/* 左侧控制区 */}
      <div className="w-full max-w-xl border-r border-border/60 flex flex-col bg-muted/10">
        <div className="px-4 pb-3 pt-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <PanelsTopLeft className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">高级搜索面板</p>
              <p className="text-xs text-muted-foreground">筛选 + 权重 + 预设</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          <FilterPanel state={filterState} onStateChange={(updater) => setFilterState((prev) => updater(prev))} />

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="w-4 h-4 text-primary" />
              标签与排除
            </div>
            <TagPanel
              isLoadingTags={isLoadingTags}
              tagInput={tagInput}
              excludeInput={excludeInput}
              tagWeights={tagWeights}
              excludeTags={excludeTags}
              suggestions={tagSuggestions}
              excludeSuggestions={excludeSuggestions}
              onTagInputChange={setTagInput}
              onExcludeInputChange={setExcludeInput}
              onAddTag={addIncludeTag}
              onAddExclude={addExcludeTag}
              onRemoveTag={removeIncludeTag}
              onRemoveExclude={removeExcludeTag}
              onTagWeightChange={(name, weight) =>
                setTagWeights((prev) => prev.map((t) => (t.name === name ? { ...t, weight } : t)))
              }
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Percent className="w-4 h-4 text-primary" />
              排序与权重
            </div>
            <div className="grid grid-cols-2 gap-4">
              <WeightSlider
                label="随机度"
                value={weights.randomWeight}
                onChange={(v) => setWeights((prev) => ({ ...prev, randomWeight: v }))}
                helper="高随机更像“抽卡”，低随机遵循排序"
              />
              <WeightSlider
                label="新旧偏好"
                value={weights.recencyBias}
                onChange={(v) => setWeights((prev) => ({ ...prev, recencyBias: v }))}
                helper="0=偏旧 50=中性 100=偏新"
              />
              <WeightSlider
                label="视频权重"
                value={weights.videoTilt}
                onChange={(v) => setWeights((prev) => ({ ...prev, videoTilt: v }))}
                helper="提升后视频更容易出现"
              />
              <WeightSlider
                label="时长偏好"
                value={weights.lengthBias}
                onChange={(v) => setWeights((prev) => ({ ...prev, lengthBias: v }))}
                helper="0=偏短 50=中性 100=偏长"
              />
              <WeightSlider
                label="标签总体加权"
                value={weights.tagBoost}
                onChange={(v) => setWeights((prev) => ({ ...prev, tagBoost: v }))}
                helper="放大“想要标签”的影响力"
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Rocket className="w-4 h-4 text-primary" />
              预设模式
            </div>
            <PresetPanel onApply={applyPreset} />
          </section>
        </div>

        <div className="border-t border-border/60 px-4 py-3 flex flex-col gap-3">
          {selectionSummary && (
            <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{selectionSummary}</div>
          )}
          <div className="flex gap-3">
            <Button className="flex-1 rounded-xl" onClick={handleApply}>
              <Filter className="w-4 h-4 mr-1" />
              应用并搜索
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={resetAll}>
              重置
            </Button>
          </div>
        </div>
      </div>

      {/* 右侧结果区 */}
      <div className="flex-1 min-w-0 flex flex-col bg-background/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 text-sm text-muted-foreground">
          <Shuffle className="w-4 h-4" />
          {hasActiveQuery ? "根据权重生成的结果" : "准备好后点击“应用并搜索”"}
        </div>
        <div className="flex-1 overflow-y-auto">
          {hasActiveQuery ? (
            <MediaCollectionView
              className="h-full"
              renderList={({ listRef, onMediaClick, onItemsChange }) => (
                <MediaGrid
                  ref={listRef}
                  key={refreshVersion}
                  queryText={appliedQuery}
                  tag={null}
                  sessionId={null}
                  selectionBehavior="desktop"
                  deleteBehavior="backend"
                  onMediaClick={onMediaClick}
                  onItemsChange={onItemsChange}
                />
              )}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-3">
              <Filter className="w-12 h-12 stroke-1" />
              <div className="text-xs text-muted-foreground">组合筛选 + 权重后开始浏览</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
