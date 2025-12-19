"use client"

import { forwardRef, useMemo, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
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
      const key = lastToken.trim().toLowerCase()
      if (!key) return [] as TagOption[]
      return allTags
        .filter((t) => formatDisplayText(t).toLowerCase().includes(key))
        .slice(0, 10)
    }, [allTags, lastToken])

    const handlePick = (tagName: string) => {
      if (!tagName.trim()) return
      if (!tags.includes(tagName)) {
        onTagsChange([...tags, tagName])
      }
      onChange(removeLastToken(value))
      setOpen(false)
      inputRef.current?.focus?.()
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
          <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden max-h-48 overflow-y-auto z-20">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors hover:bg-accent/60"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handlePick(s.name)}
              >
                <TagPill
                  prefix={tone === "destructive" ? "-" : undefined}
                  name={s.name}
                  displayName={s.displayName ?? s.name}
                  variant={tone === "destructive" ? "destructive" : "primary"}
                  className="w-full"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  },
)
