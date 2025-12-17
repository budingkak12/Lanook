"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AdvancedSearchView } from "@/components/advanced-search-view"
import { SearchIntentView } from "@/components/search-intent-view"
import { TabLikeButton } from "@/components/ui/tab-like-button"

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
      <div className="bg-background/70 backdrop-blur-sm">
        <div className="px-4 h-14 flex items-center gap-2">
          <TabLikeButton
            active={activeTab === "basic"}
            className="h-9 px-3"
            onClick={() => switchTab("basic")}
          >
            默认搜索
          </TabLikeButton>
          <TabLikeButton
            active={activeTab === "advanced"}
            className="h-9 px-3"
            onClick={() => switchTab("advanced")}
          >
            高级面板
          </TabLikeButton>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {activeTab === "advanced" ? <AdvancedSearchView /> : <SearchIntentView variant="main" />}
      </div>
    </div>
  )
}
