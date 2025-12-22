"use client"

import { forwardRef, useMemo, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { Search, Hash, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { SearchCapsuleInput, searchCapsuleWrapperClass } from "@/components/search/search-capsule"
import { TagPill } from "@/components/ui/tag-pill"

export type TagOption = {
  name: string
  displayName?: string | null
}

export type TaggedCapsuleTone = "primary" | "destructive"
export type TaggedCapsulePreset = "capsule" | "soft" | "stacked" | "tray"

const formatDisplayText = (opt: TagOption) => (opt.displayName ? `${opt.displayName} · ${opt.name}` : opt.name)

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

export type TaggedCapsuleInputProps = {
  tone: TaggedCapsuleTone
  tags: string[]
  value: string
  onChange: (next: string) => void
  onTagsChange: (next: string[]) => void
  allTags: TagOption[]
  placeholder?: string
  /**
   * 多种视觉排布方案，用于快速试样式。
   * - capsule: 经典胶囊外壳 + wrap
   * - soft: 圆角矩形外壳 + wrap（更像输入框）
   * - stacked: 标签两行（译文/原文），更易排版
   * - tray: 标签区域 + 输入区域分行，更规整
   */
  preset?: TaggedCapsulePreset
  onSubmit?: () => void
}

export const TaggedCapsuleInput = forwardRef<HTMLInputElement, TaggedCapsuleInputProps>(
  function TaggedCapsuleInput(
    {
      tone,
      tags,
      value,
      onChange,
      onTagsChange,
      allTags,
      placeholder,
      preset = "soft",
      onSubmit,
    },
    ref,
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null)
    const inputRef = (ref as any) ?? innerRef
    const [open, setOpen] = useState(false)

    const lastToken = useMemo(() => getLastToken(value), [value])
    const suggestions = useMemo(() => {
      const key = lastToken.trim()
      // 如果没有输入 key，不显示下拉建议
      if (!key) return []

      const lowerKey = key.toLowerCase()

      // 1. 构造“文本搜索”选项 (始终作为第一项)
      // 使用 type 字段区分
      const textOption = {
        name: key,
        displayName: key,
        type: "text" as const,
      }

      // 2. 构造“标签匹配”选项
      const tagOptions = allTags
        .filter((t) => formatDisplayText(t).toLowerCase().includes(lowerKey))
        .slice(0, 10)
        .map((t) => ({ ...t, type: "tag" as const }))

      return [textOption, ...tagOptions]
    }, [allTags, lastToken])

    const handlePick = (item: { name: string; type: "text" | "tag" }) => {
      if (item.type === "text") {
        // 用户显式点击了“搜索文本”
        // 行为：确认保留这段文本在输入框中（不做 Tag 转换），并关闭下拉框
        // 这相当于用户告诉系统：“这就是我要的文字，不要把它当标签”
        setOpen(false)
        inputRef.current?.focus?.()
      } else {
        // 选中标签 -> 转为 Pill
        const tagName = item.name
        if (!tagName.trim()) return
        if (!tags.includes(tagName)) {
          onTagsChange([...tags, tagName])
        }
        onChange(removeLastToken(value))
        setOpen(false)
        inputRef.current?.focus?.()
      }
    }

    const handleRemoveAt = (idx: number) => {
      onTagsChange(tags.filter((_, i) => i !== idx))
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        if ((e.nativeEvent as any)?.isComposing) return
        e.preventDefault()
        onSubmit?.()
        return
      }
      if (e.key === "Backspace" && value.trim() === "" && tags.length > 0) {
        onTagsChange(tags.slice(0, -1))
        return
      }
      if (e.key === "Escape") {
        setOpen(false)
      }
    }

    const wrap = preset !== "tray"
    const shouldWrapChips = preset !== "capsule" ? true : true
    const containerRadius = preset === "capsule" ? "rounded-full" : "rounded-xl"
    const containerPadding = preset === "tray" ? "p-2" : wrap ? "px-2 py-2" : "px-2"
    const tagLayout = preset === "stacked" ? "stacked" : "inline"

    return (
      <div
        className={cn(
          "group relative w-full cursor-text",
          searchCapsuleWrapperClass,
          "block",
          // searchCapsuleWrapperClass 默认包含 overflow-hidden，会把下拉联想裁掉；这里必须允许溢出显示。
          "overflow-visible",
          "min-h-11",
          containerRadius,
          containerPadding,
        )}
        onClick={() => inputRef.current?.focus?.()}
      >
        {preset === "tray" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag, idx) => {
                const opt = allTags.find((t) => t.name === tag)
                const displayName = opt?.displayName ?? tag
                return (
                  <TagPill
                    key={`${tone}-${tag}-${idx}`}
                    prefix={tone === "destructive" ? "-" : undefined}
                    name={tag}
                    displayName={displayName}
                    variant={tone === "destructive" ? "destructive" : "primary"}
                    onRemove={() => handleRemoveAt(idx)}
                    layout={tagLayout}
                    className="max-w-full"
                  />
                )
              })}
            </div>
            <div className={tags.length > 0 ? "mt-2" : ""}>
              <SearchCapsuleInput
                ref={inputRef}
                value={value}
                onChange={(e) => {
                  onChange(e.target.value)
                  setOpen(true)
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={cn(
                  "w-full bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:border-transparent h-9 px-0",
                )}
                autoComplete="off"
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                onFocus={() => setOpen(true)}
              />
            </div>
          </>
        ) : (
          <div className={cn("flex items-center gap-2", shouldWrapChips ? "flex-wrap" : "flex-nowrap")}>
            {tags.map((tag, idx) => {
              const opt = allTags.find((t) => t.name === tag)
              const displayName = opt?.displayName ?? tag
              return (
                <TagPill
                  key={`${tone}-${tag}-${idx}`}
                  prefix={tone === "destructive" ? "-" : undefined}
                  name={tag}
                  displayName={displayName}
                  variant={tone === "destructive" ? "destructive" : "primary"}
                  onRemove={() => handleRemoveAt(idx)}
                  layout={tagLayout}
                  className="max-w-full"
                />
              )
            })}

            <SearchCapsuleInput
              ref={inputRef}
              value={value}
              onChange={(e) => {
                onChange(e.target.value)
                setOpen(true)
                const el = e.currentTarget
                requestAnimationFrame(() => {
                  el.scrollLeft = el.scrollWidth
                })
              }}
              onKeyDown={handleKeyDown}
              placeholder={tags.length > 0 ? "" : placeholder}
              className={cn(
                "flex-1 min-w-[80px] bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:border-transparent h-9 px-0",
                preset === "capsule" ? "min-w-[10rem]" : "",
              )}
              autoComplete="off"
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onFocus={() => setOpen(true)}
            />
          </div>
        )}

        {open && lastToken && suggestions.length > 0 ? (
          <div className="absolute left-0 right-0 top-full mt-2 z-20">
            {/* 外层负责圆角裁剪，避免滚动条在顶部/底部“顶出”圆角 */}
            <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden">
              <div
                className={cn(
                  "overscroll-contain overflow-y-auto",
                  // 根据视口高度尽可能展示更多联想项（避免永远固定 12rem 高度）。
                  // 仍保留上限，避免在超大屏下过长影响视线。
                  "max-h-[min(60dvh,32rem)]",
                  // 让滚动条不要贴边，看起来更“在框里”
                  "box-border pr-1",
                )}
                style={{ scrollbarGutter: "stable" }}
              >
                {suggestions.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors hover:bg-accent/60"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handlePick(s)}
                  >
                    {s.type === "text" ? (
                      <div className="flex items-center gap-2 text-foreground/80 w-full">
                        <div className="flex items-center justify-center w-5 h-5 bg-primary/10 rounded-full shrink-0">
                          <Search className="w-3 h-3 text-primary" />
                        </div>
                        <span className="truncate">
                          <span className="opacity-50 mr-1">搜索文本:</span>
                          <span className="font-medium text-primary/90">"{s.name}"</span>
                        </span>
                      </div>
                    ) : (
                      <TagPill
                        // icon={<Hash className="w-3 h-3 mr-1 opacity-50" />} // TagPill 内部可能已有样式，这里只传基本属性
                        prefix={tone === "destructive" ? "-" : undefined}
                        name={s.name}
                        displayName={s.displayName ?? s.name}
                        variant={tone === "destructive" ? "destructive" : "primary"}
                        className="w-full text-left justify-start font-normal"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  },
)
