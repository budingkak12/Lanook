"use client"

import { cn } from "@/lib/utils"
import { StepNavigation } from "@/components/step-navigation"
import { useTranslation } from "react-i18next"
import { PanelLeftClose, PanelLeftOpen, Search, Shuffle, FolderOpen, Settings } from "lucide-react"
import { useMemo } from "react"

interface MainSidebarProps {
  activeView: "feed" | "albums" | "search" | "settings"
  onViewChange: (view: "feed" | "albums" | "search" | "settings") => void
  isSidebarOpen: boolean
  onSidebarClose: () => void
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}

export function MainSidebar({
  activeView,
  onViewChange,
  isSidebarOpen,
  onSidebarClose,
  collapsed,
  onCollapsedChange,
}: MainSidebarProps) {
  const { t } = useTranslation()

  const steps = useMemo(() => ([
    {
      id: 1,
      title: t("sidebar.feed"),
      viewId: "feed" as const,
      icon: <Shuffle className="w-4 h-4" />,
    },
    {
      id: 2,
      title: t("sidebar.albums"),
      viewId: "albums" as const,
      icon: <FolderOpen className="w-4 h-4" />,
    },
    {
      id: 3,
      title: t("sidebar.search"),
      viewId: "search" as const,
      icon: <Search className="w-4 h-4" />,
    },
    {
      id: 4,
      title: t("sidebar.settings"),
      viewId: "settings" as const,
      icon: <Settings className="w-4 h-4" />,
    },
  ]), [t])

  const getCurrentStepId = () => {
    const currentStep = steps.find(step => step.viewId === activeView)
    return currentStep?.id || 1
  }

  const handleStepClick = (stepId: number) => {
    const step = steps.find(s => s.id === stepId)
    if (step) {
      onViewChange(step.viewId)
      onSidebarClose() // 点击步骤后自动关闭侧边栏
    }
  }

  return (
    <>
      {/* 折叠后的左侧热区，点击可展开 */}
      {collapsed && (
        <div
          className="hidden lg:block fixed top-0 left-0 h-screen w-3 z-[9998]"
          style={{ cursor: "e-resize" }}
          title={t("sidebar.expand") ?? "展开"}
          onClick={() => onCollapsedChange(false)}
        />
      )}

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] lg:hidden"
          onClick={onSidebarClose}
        />
      )}

      {/* Sidebar Navigation - Fixed */}
      <aside
        className={`
          fixed top-0 h-screen z-[9999] transition-transform duration-300 ease-in-out overflow-y-auto
          lg:translate-x-0 lg:left-0 lg:ml-0 lg:pl-0 lg:border-r lg:border-border/30
          ${isSidebarOpen ? 'translate-x-2 left-0' : '-translate-x-full'}
          bg-transparent
        `}
        style={{ width: collapsed ? "48px" : "11rem" }}
        onClick={(e) => e.stopPropagation()} // 阻止事件冒泡
      >
        <StepNavigation
          steps={steps}
          currentStep={getCurrentStepId()}
          onStepClick={handleStepClick}
          collapsed={collapsed}
        />

        {/* 折叠/展开按钮（PC） */}
        <button
          type="button"
          className="hidden lg:flex absolute right-0.5 bottom-4 h-7 w-7 items-center justify-center rounded-full border border-border bg-card/90 shadow-sm hover:bg-muted transition z-50"
          onClick={() => onCollapsedChange(!collapsed)}
          title={collapsed ? (t("sidebar.expand") ?? "展开") : (t("sidebar.collapse") ?? "收起")}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </aside>
    </>
  )
}
