"use client"

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Shuffle, FolderOpen, Search, Settings } from "lucide-react"

interface MobileBottomNavProps {
  activeView: "feed" | "albums" | "search" | "settings"
  onViewChange: (view: "feed" | "albums" | "search" | "settings") => void
}

export function MobileBottomNav({ activeView, onViewChange }: MobileBottomNavProps) {
  const { t } = useTranslation()

  const navItems = [
    { id: "feed" as const, label: t("sidebar.feed"), icon: Shuffle },
    { id: "albums" as const, label: t("sidebar.albums"), icon: FolderOpen },
    { id: "search" as const, label: t("sidebar.search"), icon: Search },
    { id: "settings" as const, label: t("sidebar.settings"), icon: Settings },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1000] lg:hidden border-0">
      {/* 底部导航背景 */}
      <div className="absolute inset-0 bg-card/80 backdrop-blur-lg border-0" />

      {/* 导航内容 */}
      <nav className="relative z-10 border-0">
        <div className="flex items-center justify-around py-1 border-0">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeView === item.id

            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-300 min-w-0 flex-1",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className={cn(
                  "p-1.5 rounded-lg transition-all duration-300",
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-muted/50"
                )}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium truncate max-w-full">
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      </div>
  )
}