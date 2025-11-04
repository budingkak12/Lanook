"use client"

import { useState } from "react"
import type { MediaItem } from "@/app/page"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, X } from "lucide-react"

type SearchViewProps = {
  onMediaClick: (media: MediaItem) => void
}

const popularTags = ["风景", "旅行", "美食", "人物", "建筑", "自然", "动物", "城市"]
const recentSearches = ["海滩", "山脉", "日落"]

export function SearchView({ onMediaClick }: SearchViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleTagClick = (tag: string) => {
    if (activeTags.includes(tag)) {
      setActiveTags(activeTags.filter((t) => t !== tag))
    } else {
      setActiveTags([...activeTags, tag])
    }
  }

  const handleSearch = () => {
    console.log("Searching for:", searchQuery, activeTags)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-card p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="搜索标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10 pr-4 h-12"
            />

            {showSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg p-4 z-10">
                <div className="text-sm font-medium mb-2 text-popover-foreground">最近搜索</div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      onClick={() => setSearchQuery(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-medium mb-3 text-foreground">热门标签</div>
            <div className="flex flex-wrap gap-2">
              {popularTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={activeTags.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => handleTagClick(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {activeTags.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-foreground">已选择:</div>
              <div className="flex flex-wrap gap-2 flex-1">
                {activeTags.map((tag) => (
                  <Badge key={tag} variant="default" className="gap-1">
                    {tag}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => handleTagClick(tag)} />
                  </Badge>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveTags([])}>
                清空
              </Button>
            </div>
          )}

          <Button onClick={handleSearch} className="w-full">
            搜索
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          {activeTags.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p>选择标签或输入关键词开始搜索</p>
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground">
              <p>搜索结果将显示在这里</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
