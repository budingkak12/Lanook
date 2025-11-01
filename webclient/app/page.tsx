"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { StepNavigation } from "@/components/step-navigation"
import { StepContent } from "@/components/step-content"
import { Button } from "@/components/ui/button"
import { LanguageSelector } from "@/components/language-selector"
import { MediaSourceSelector } from "@/components/media-source-selector"

export default function Page() {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const steps = [
    {
      id: 1,
      title: t('init.selectLanguage'),
      content: {
        title: t('init.step1.title'),
        description: "",
        sections: [],
      },
    },
    {
      id: 2,
      title: t('init.step2.title'),
      content: {
        title: t('init.step2.title'),
        description: "",
        sections: [],
      },
    },
    {
      id: 3,
      title: "媒体路径清单",
      content: {
        title: t('init.step3.title'),
        description: "",
        sections: [],
      },
    },
    {
      id: 4,
      title: "开始浏览",
      content: {
        title: t('init.step4.title'),
        description: "",
        sections: [],
      },
    },
  ]

  const handleNextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const currentStepData = steps.find((step) => step.id === currentStep)

  // 设置固定的CSS变量值（基于你满意的版本）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = document.documentElement
      root.style.setProperty('--dynamic-muted-foreground', 'oklch(0.75 0 0)')
      root.style.setProperty('--dynamic-background', 'oklch(0.42 0.005 264)')
      root.style.setProperty('--dynamic-header-top', 'oklch(0.47 0 0)')
      root.style.setProperty('--dynamic-header-bottom', 'oklch(0.28 0 0)')
    }
  }, [])

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--dynamic-background, oklch(0.42 0.005 264))' }}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-[10000] border-b border-border/50 relative overflow-hidden" style={{ position: 'fixed', top: 0, left: 0, right: 0, transform: 'translateZ(0)' }}>
        {/* 上半部分 */}
        <div
          className="absolute inset-x-0 top-0 h-1/2 backdrop-blur-sm"
          style={{ backgroundColor: 'var(--dynamic-header-top, oklch(0.35 0 0))' }}
        />
        {/* 下半部分 */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 backdrop-blur-sm"
          style={{ backgroundColor: 'var(--dynamic-header-bottom, oklch(0.50 0 0))' }}
        />
        {/* 中间分割线 */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-border/70" />

        {/* 内容 */}
        <div className="relative z-10 bg-background/20 backdrop-blur-md">
          <div className="pr-4 pl-2 lg:pl-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 lg:gap-4">
              {/* 移动端菜单按钮 */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="lg:hidden hover:opacity-70 transition-opacity"
              >
                <div className="flex flex-col justify-center items-center w-5 h-5">
                  <div className="w-4 h-0.5 bg-foreground mb-1"></div>
                  <div className="w-4 h-0.5 bg-foreground mb-1"></div>
                  <div className="w-4 h-0.5 bg-foreground"></div>
                </div>
              </button>
              <h1 className="text-xl font-normal text-foreground ml-0 pl-0 lg:ml-0 lg:pl-0">{t('init.welcome')}</h1>
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

      <div className="flex py-2 pt-16">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar Navigation - Fixed */}
        <aside
          className={`
            fixed top-16 h-[calc(100vh-4rem)] z-[9999] transition-transform duration-300 ease-in-out overflow-y-auto
            lg:translate-x-0 lg:left-0 lg:ml-0 lg:pl-0
            ${isSidebarOpen ? 'translate-x-2 left-0' : '-translate-x-full'}
            w-44 bg-transparent
          `}
          style={{
            top: '4rem'
          }}
          onClick={(e) => e.stopPropagation()} // 阻止事件冒泡
        >
          <StepNavigation
            steps={steps}
            currentStep={currentStep}
            onStepClick={(stepId) => {
              setCurrentStep(stepId)
              setIsSidebarOpen(false) // 点击步骤后自动关闭侧边栏
            }}
          />
        </aside>

        {/* Main Content */}
        <main
          className="flex-1 lg:ml-44 ml-0 lg:pl-1 pl-1 pr-1 lg:pr-1 lg:relative"
          onClick={() => setIsSidebarOpen(false)} // 点击内容区域关闭侧边栏
        >
          <div className="max-w-2xl mx-auto">

            {/* Step Content */}
            {currentStepData && (
              <>
                {currentStep === 1 ? (
                  <LanguageSelector />
                ) : currentStep === 2 ? (
                  <>
                    {/* 页面顶部小标题 */}
                    <div className="text-center pb-4">
                      <h2 className="text-lg font-medium text-muted-foreground/80">{t('init.step2.title')}</h2>
                    </div>
                    <MediaSourceSelector />
                  </>
                ) : (
                  <StepContent content={currentStepData.content} isLastStep={currentStep === steps.length} />
                )}
              </>
            )}

          </div>
        </main>
      </div>

      {/* Fixed Bottom Navigation Button */}
      {currentStep < steps.length && (
        <div className="fixed bottom-8 right-4 z-[9999]">
          <Button
            onClick={handleNextStep}
            className="bg-white hover:bg-gray-100 text-black px-6 py-3 rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-300"
          >
            {t('init.nextStep')}
          </Button>
        </div>
      )}
    </div>
  )
}
