"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WeightSlider } from "./weight-slider"
import type { ExcludeTag, TagSuggestion, TagWeight } from "./config"

type TagPanelProps = {
  isLoadingTags: boolean
  tagInput: string
  excludeInput: string
  tagWeights: TagWeight[]
  excludeTags: ExcludeTag[]
  suggestions: TagSuggestion[]
  excludeSuggestions: TagSuggestion[]
  onTagInputChange: (v: string) => void
  onExcludeInputChange: (v: string) => void
  onAddTag: (name: string) => void
  onAddExclude: (name: string) => void
  onRemoveTag: (name: string) => void
  onRemoveExclude: (name: string) => void
  onTagWeightChange: (name: string, weight: number) => void
}

export function TagPanel({
  isLoadingTags,
  tagInput,
  excludeInput,
  tagWeights,
  excludeTags,
  suggestions,
  excludeSuggestions,
  onTagInputChange,
  onExcludeInputChange,
  onAddTag,
  onAddExclude,
  onRemoveTag,
  onRemoveExclude,
  onTagWeightChange,
}: TagPanelProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">偏好标签（可设置权重）</Label>
        <div className="flex items-center gap-2">
          <Input
            placeholder={isLoadingTags ? "标签加载中..." : "输入标签后回车 / 选择"}
            value={tagInput}
            onChange={(e) => onTagInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onAddTag(tagInput.trim())
              }
            }}
            className="h-9"
            disabled={isLoadingTags}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddTag(tagInput.trim())}
            disabled={!tagInput.trim()}
          >
            添加
          </Button>
        </div>

        {suggestions.length > 0 && (
          <div className="rounded-lg border border-border bg-popover shadow-sm divide-y">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                onClick={() => onAddTag(s.name)}
              >
                <div className="font-medium">{s.displayName ?? s.name}</div>
                {s.displayName && <div className="text-xs text-muted-foreground">#{s.name}</div>}
              </button>
            ))}
          </div>
        )}

        {tagWeights.length > 0 && (
          <div className="space-y-2">
            {tagWeights.map((tag) => (
              <div key={tag.name} className="rounded-lg border border-border/70 px-3 py-2 space-y-1 bg-background">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground truncate max-w-[200px]">
                    #{tag.name}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => onRemoveTag(tag.name)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <WeightSlider
                  label="权重"
                  value={tag.weight}
                  onChange={(v) => onTagWeightChange(tag.name, v)}
                  helper="影响标签在排序中的强度"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">排除标签</Label>
        <div className="flex items-center gap-2">
          <Input
            placeholder="输入排除标签"
            value={excludeInput}
            onChange={(e) => onExcludeInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onAddExclude(excludeInput.trim())
              }
            }}
            className="h-9"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddExclude(excludeInput.trim())}
            disabled={!excludeInput.trim()}
          >
            添加
          </Button>
        </div>

        {excludeSuggestions.length > 0 && (
          <div className="rounded-lg border border-border bg-popover shadow-sm divide-y">
            {excludeSuggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                onClick={() => onAddExclude(s.name)}
              >
                <div className="font-medium">{s.displayName ?? s.name}</div>
                {s.displayName && <div className="text-xs text-muted-foreground">#{s.name}</div>}
              </button>
            ))}
          </div>
        )}

        {excludeTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {excludeTags.map((tag) => (
              <span
                key={tag.name}
                className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-1 text-xs border border-destructive/30"
              >
                -{tag.name}
                <button onClick={() => onRemoveExclude(tag.name)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
