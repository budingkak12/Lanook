"use client"

import { useEffect, useMemo, useState } from "react"
import type { MediaItem } from "@/app/(main)/types"
import { MediaGrid } from "@/components/media-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiFetch, getAllTags, type TagItem } from "@/lib/api"
import { AlertCircle, Loader2, Search, X } from "lucide-react"

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

const TagChip = ({ option }: { option: TagOption }) => (
  <div className="flex flex-col leading-tight text-left">
    {option.displayName && <span className="text-sm font-medium text-foreground">{option.displayName}</span>}
    <span className={`text-xs ${option.displayName ? "text-muted-foreground" : "text-foreground"}`}>{option.name}</span>
  </div>
)

export function SearchView({ onMediaClick }: SearchViewProps) {
  // 文本向量搜图（Chinese-CLIP）
  const [clipQuery, setClipQuery] = useState("")
  const [clipLoading, setClipLoading] = useState(false)
  const [clipError, setClipError] = useState<string | null>(null)
  const [clipResults, setClipResults] = useState<
    { mediaId: number; filename: string; thumbnailUrl?: string | null; resourceUrl: string; url?: string; score: number }[]
  >([])

  const [input, setInput] = useState("")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<TagOption[]>([])
  const [isLoadingTags, setIsLoadingTags] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  // 拉取并缓存全部标签（同安卓端逻辑：首次进来加载一次，后续复用）
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

  const suggestions = useMemo(() => {
    const kw = input.trim().toLowerCase()
    if (kw.length === 0) return allTags.slice(0, 12)
    return allTags.filter((t) => formatDisplayText(t).toLowerCase().includes(kw)).slice(0, 12)
  }, [allTags, input])

  const handleSearch = () => {
    const resolved = resolveInputToName(input, allTags)
    const trimmed = input.trim()
    setSelectedTag(resolved ?? (trimmed.length > 0 ? trimmed : null))
  }

  const handlePick = (tag: string) => {
    const opt = allTags.find((t) => t.name === tag)
    setInput(opt ? formatDisplayText(opt) : tag)
    setSelectedTag(tag)
  }

  const runClipSearch = async () => {
    const text = clipQuery.trim()
    if (!text) {
      setClipError("请输入要搜索的文字")
      return
    }
    setClipLoading(true)
    setClipError(null)
    try {
      const resp = await apiFetch("/search/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_text: text, top_k: 30, model: "chinese-clip" }),
      })
      if (!resp.ok) {
        const msg = await resp.text()
        throw new Error(msg || `搜索失败（${resp.status}）`)
      }
      const data = (await resp.json()) as {
        items: {
          mediaId: number
          filename: string
          mediaType: string
          createdAt: string
          url: string
          resourceUrl: string
          thumbnailUrl?: string | null
          score: number
        }[]
      }
      setClipResults(data.items || [])
    } catch (err: any) {
      setClipError(err?.message || "搜索失败")
      setClipResults([])
    } finally {
      setClipLoading(false)
    }
  }

  const selectedOption = selectedTag ? allTags.find((t) => t.name === selectedTag) : null

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-card p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">文本搜图（Chinese-CLIP）</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="输入描述，如：黑发女生 自拍 室内"
              value={clipQuery}
              onChange={(e) => setClipQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runClipSearch()}
              className="h-11 flex-1"
            />
            <Button className="h-11 min-w-[108px]" onClick={runClipSearch} disabled={clipLoading}>
              {clipLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              开始搜索
            </Button>
          </div>
          {clipError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span>{clipError}</span>
            </div>
          )}
          {clipResults.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3 sm:grid-cols-2">
              {clipResults.map((item) => (
                <figure
                  key={item.mediaId}
                  className="rounded-xl border border-border/60 overflow-hidden bg-muted/30 shadow-sm"
                >
                  <div className="relative aspect-[4/3] bg-background">
                    <img
                      src={item.thumbnailUrl || item.resourceUrl}
                      alt={item.filename}
                      className="w-full h-full object-cover cursor-pointer"
                      loading="lazy"
                      onClick={() =>
                        onMediaClick({
                          id: `${item.mediaId}`,
                          mediaId: item.mediaId,
                          type: "image",
                          url: item.url ?? item.resourceUrl,
                          resourceUrl: item.resourceUrl,
                          thumbnailUrl: item.thumbnailUrl,
                          filename: item.filename,
                          createdAt: "",
                        })
                      }
                    />
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                      {item.score.toFixed(3)}
                    </div>
                  </div>
                  <figcaption className="px-3 py-2 text-sm truncate">{item.filename}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="输入标签（如 like / favorite）"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10 pr-4 h-12"
              autoComplete="off"
            />
            {tagError && <div className="mt-2 text-sm text-destructive">{tagError}</div>}
            {isLoadingTags && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">加载标签...</span>
              </div>
            )}
          </div>

          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Badge
                  key={s.name}
                  variant={selectedTag === s.name ? "default" : "outline"}
                  className="cursor-pointer px-3 py-2"
                  onClick={() => handlePick(s.name)}
                >
                  <TagChip option={s} />
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSearch} className="flex-1">
              搜索
            </Button>
            {selectedTag && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedTag(null)
                  setInput("")
                }}
              >
                <X className="w-4 h-4 mr-1" />
                清空
              </Button>
            )}
          </div>

          {selectedTag && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>当前标签：</span>
              {selectedOption ? (
                <Badge variant="secondary" className="px-3 py-2">
                  <TagChip option={selectedOption} />
                </Badge>
              ) : (
                <Badge variant="secondary">{selectedTag}</Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedTag === null ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Search className="w-12 h-12 opacity-40" />
            <p>输入或点击上方标签即可开始搜索</p>
          </div>
        ) : (
          <MediaGrid tag={selectedTag} sessionId={null} onMediaClick={onMediaClick} />
        )}
      </div>
    </div>
  )
}
