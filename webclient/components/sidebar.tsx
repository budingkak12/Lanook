"use client"

import { cn } from "@/lib/utils"
import { Shuffle, FolderOpen, Search, Settings } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useState } from "react"

type SidebarProps = {
  activeView: "feed" | "albums" | "search" | "settings"
  onViewChange: (view: "feed" | "albums" | "search" | "settings") => void
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { t } = useTranslation()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const navItems = [
    { id: "feed" as const, label: t("sidebar.feed"), icon: Shuffle },
    { id: "albums" as const, label: t("sidebar.albums"), icon: FolderOpen },
    { id: "search" as const, label: t("sidebar.search"), icon: Search },
    { id: "settings" as const, label: t("sidebar.settings"), icon: Settings },
  ]

  return (
    <aside
      className={cn(
        "relative flex flex-col transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-48"
      )}
    >
      {/* Sidebar Background with blur effect */}
      <div className="absolute inset-0 bg-card/30 backdrop-blur-sm border-r border-border/50" />

      {/* Header */}
      <div className="relative z-10 border-b border-border/30">
        <div className="p-4 flex items-center justify-between">
          {!isCollapsed && (
            <h1 className="text-lg font-medium text-foreground">{t("app.title")}</h1>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="w-4 h-4 flex flex-col justify-center gap-0.5">
              <div className="h-0.5 bg-foreground rounded-full" />
              <div className="h-0.5 bg-foreground rounded-full" />
              <div className="h-0.5 bg-foreground rounded-full" />
            </div>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex-1 p-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeView === item.id

            return (
              <li key={item.id}>
                <button
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300",
                    isActive
                      ? "bg-primary/90 text-primary-foreground shadow-lg scale-[1.02]"
                      : "text-muted-foreground hover:bg-card/50 hover:text-foreground hover:shadow-md"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && (
                    <span className="truncate transition-all duration-300">
                      {item.label}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
