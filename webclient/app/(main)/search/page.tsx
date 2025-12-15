"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdvancedSearchView } from "@/components/advanced-search-view"
import { SearchIntentView } from "@/components/search-intent-view"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function SearchPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const derivedTab = useMemo<"basic" | "advanced">(() => {
    const tabParam = searchParams.get("tab")
    const advParam = searchParams.get("advanced")
    if (tabParam === "advanced" || advParam === "1") return "advanced"
    return "basic"
  }, [searchParams])

  const [activeTab, setActiveTab] = useState<"basic" | "advanced">(derivedTab)

  useEffect(() => {
    setActiveTab(derivedTab)
  }, [derivedTab])

  const switchTab = (tab: "basic" | "advanced") => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams.toString())
    if (tab === "advanced") {
      next.set("tab", "advanced")
      next.set("advanced", "1")
    } else {
      next.delete("tab")
      next.delete("advanced")
    }
    const qs = next.toString()
    router.replace(`/search${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border/60 bg-background/70 backdrop-blur-sm">
        <div className="px-4 h-12 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "rounded-full border border-transparent",
              activeTab === "basic"
                ? "bg-card text-foreground border-border shadow-xs hover:bg-card"
                : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => switchTab("basic")}
          >
            默认搜索
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "rounded-full border border-transparent",
              activeTab === "advanced"
                ? "bg-card text-foreground border-border shadow-xs hover:bg-card"
                : "bg-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => switchTab("advanced")}
          >
            高级面板
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {activeTab === "advanced" ? <AdvancedSearchView /> : <SearchIntentView variant="main" />}
      </div>
    </div>
  )
}
