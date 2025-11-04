"use client"

import { useTranslation } from "react-i18next"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

interface MainHeaderProps {
  activeView: "feed" | "albums" | "search" | "settings"
  isSidebarOpen: boolean
  onSidebarToggle: () => void
}

export function MainHeader({ activeView, isSidebarOpen, onSidebarToggle }: MainHeaderProps) {
  const { t } = useTranslation()

  const getViewTitle = () => {
    switch (activeView) {
      case "feed":
        return t("sidebar.feed")
      case "albums":
        return t("sidebar.albums")
      case "search":
        return t("sidebar.search")
      case "settings":
        return t("sidebar.settings")
      default:
        return t("app.title")
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-[10000] border-b border-border/50 relative overflow-hidden hidden lg:block">
      {/* 上半部分 */}
      <div className="absolute inset-x-0 top-0 h-1/2 backdrop-blur-sm bg-card/50" />
      {/* 下半部分 */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 backdrop-blur-sm bg-muted/50" />
      {/* 中间分割线 */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-border/70" />

      {/* 内容 */}
      <div className="relative z-10 bg-card/20 backdrop-blur-md">
        <div className="pr-4 pl-2 lg:pl-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-4">
            {/* 移动端菜单按钮 */}
            <button
              onClick={onSidebarToggle}
              className="lg:hidden hover:opacity-70 transition-opacity"
            >
              <div className="flex flex-col justify-center items-center w-5 h-5">
                <div className="w-4 h-0.5 bg-foreground mb-1"></div>
                <div className="w-4 h-0.5 bg-foreground mb-1"></div>
                <div className="w-4 h-0.5 bg-foreground"></div>
              </div>
            </button>
            <h1 className="text-xl font-normal text-foreground ml-0 pl-0 lg:ml-0 lg:pl-0">{getViewTitle()}</h1>
          </div>

          {/* 右侧工具栏 */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* 底部阴影 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, transparent 100%)'
        }}
      />
    </header>
  )
}