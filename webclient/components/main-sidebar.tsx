"use client"

import { cn } from "@/lib/utils"
import { StepNavigation } from "@/components/step-navigation"
import { useTranslation } from "react-i18next"

interface MainSidebarProps {
  activeView: "feed" | "albums" | "search" | "settings"
  onViewChange: (view: "feed" | "albums" | "search" | "settings") => void
  isSidebarOpen: boolean
  onSidebarClose: () => void
}

export function MainSidebar({ activeView, onViewChange, isSidebarOpen, onSidebarClose }: MainSidebarProps) {
  const { t } = useTranslation()

  const steps = [
    {
      id: 1,
      title: t("sidebar.feed"),
      viewId: "feed" as const
    },
    {
      id: 2,
      title: t("sidebar.albums"),
      viewId: "albums" as const
    },
    {
      id: 3,
      title: t("sidebar.search"),
      viewId: "search" as const
    },
    {
      id: 4,
      title: t("sidebar.settings"),
      viewId: "settings" as const
    },
  ]

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
          w-44 bg-transparent
        `}
        onClick={(e) => e.stopPropagation()} // 阻止事件冒泡
      >
        <StepNavigation
          steps={steps}
          currentStep={getCurrentStepId()}
          onStepClick={handleStepClick}
        />
      </aside>
    </>
  )
}