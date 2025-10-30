"use client"

import { cn } from "@/lib/utils"
import { Shuffle, FolderOpen, Search, Settings } from "lucide-react"
import { useTranslation } from "react-i18next"

type SidebarProps = {
  activeView: "feed" | "albums" | "search" | "settings"
  onViewChange: (view: "feed" | "albums" | "search" | "settings") => void
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { t } = useTranslation()

  const navItems = [
    { id: "feed" as const, label: t("sidebar.feed"), icon: Shuffle },
    { id: "albums" as const, label: t("sidebar.albums"), icon: FolderOpen },
    { id: "search" as const, label: t("sidebar.search"), icon: Search },
    { id: "settings" as const, label: t("sidebar.settings"), icon: Settings },
  ]

  return (
    <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <h1 className="text-xl font-semibold text-sidebar-foreground">{t("app.title")}</h1>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.id}>
                <button
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    activeView === item.id
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
