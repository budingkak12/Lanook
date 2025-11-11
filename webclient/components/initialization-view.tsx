"use client"

import { useState } from "react"
import { HardDrive } from "lucide-react"
import { useTranslation } from "react-i18next"
import { StepNavigation } from "@/components/step-navigation"
import { StepContent } from "@/components/step-content"
import { Button } from "@/components/ui/button"
import { LanguageSelector } from "@/components/language-selector"
import { ThemeToggle } from "@/components/theme-toggle"
import { MediaSourceSelector } from "@/components/media-source-selector"
import { MediaPathList } from "@/components/media-path-list"
import { apiFetch } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface InitializationViewProps {
  onInitialized?: () => void
}

export function InitializationView({ onInitialized }: InitializationViewProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isStartingInitialization, setIsStartingInitialization] = useState(false)

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
      title: "完成",
      content: {
        title: t('init.step4.title'),
        description: "",
        sections: [],
      },
    },
  ]

  const handleNextStep = async () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    } else if (currentStep === steps.length && onInitialized) {
      // 在最后一步，调用后端API启动初始化
      setIsStartingInitialization(true)
      try {
        // 简化调用：不传 path，由后端自动选择已存在的第一个媒体来源；若无来源，将返回 404+提示
        const response = await apiFetch("/media-root", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({})
        })
        const data = await response.json().catch(() => (null as any))
        if (data && data.success === false && data.code === 'no_media_source') {
          toast({
            title: data.message || "没有媒体路径",
            description: "",
          })
          setIsStartingInitialization(false)
          return
        }
        // 200 且 body 为空也视为成功，避免空响应导致前端报错
        if (response.ok && (!data || data.success === true || data.success === undefined)) {
          onInitialized()
          return
        }
        // 其他情况作为错误提示
        console.error("启动媒体初始化失败:", data || {})
        toast({
          title: (data && (data.detail?.message || data.message)) || "启动媒体库失败",
          description: (data && (data.detail || data.error)) || `服务器错误 ${response.status}`,
        })
      } catch (error) {
        console.error("调用媒体初始化API失败:", error)
        // 显示错误通知，但不跳转页面
        toast({
          title: "初始化失败",
          description: error instanceof Error ? error.message : "无法连接到服务器",
        })
      } finally {
        setIsStartingInitialization(false)
      }
    }
  }

  const currentStepData = steps.find((step) => step.id === currentStep)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-[10000] border-b border-border/50 relative overflow-hidden" style={{ position: 'fixed', top: 0, left: 0, right: 0, transform: 'translateZ(0)' }}>
        {/* 上半部分 */}
        <div
          className="absolute inset-x-0 top-0 h-1/2 backdrop-blur-sm bg-card/50"
        />
        {/* 下半部分 */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 backdrop-blur-sm bg-muted/50"
        />
        {/* 中间分割线 */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-border/70" />

        {/* 内容 */}
        <div className="relative z-10 bg-card/20 backdrop-blur-md">
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

            {/* 主题切换按钮 */}
            <div className="flex items-center gap-2">
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
          className="flex-1 lg:ml-44 ml-0 lg:pl-1 pl-1 pr-1 lg:pr-1 lg:relative pb-24"
          onClick={() => setIsSidebarOpen(false)} // 点击内容区域关闭侧边栏
          style={{
            minHeight: 'calc(100vh - 6rem)',
            maxHeight: 'calc(100vh - 6rem)',
            overflowY: 'auto'
          }}
        >
          <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 h-full">

            {/* Step Content */}
            {currentStepData && (
              <>
                {currentStep === 1 ? (
                  <>
                    {/* 页面顶部小标题 */}
                    <div className="text-center pb-4">
                      <h2 className="text-lg font-medium text-muted-foreground/80">选择语言</h2>
                    </div>
                    <LanguageSelector />
                  </>
                ) : currentStep === 2 ? (
                  <>
                    {/* 页面顶部小标题 */}
                    <div className="text-center pb-4">
                      <h2 className="text-lg font-medium text-muted-foreground/80">{t('init.step2.title')}</h2>
                    </div>
                    <MediaSourceSelector />
                  </>
                ) : currentStep === 3 ? (
                  <>
                    {/* 页面顶部小标题 */}
                    <div className="text-center pb-4">
                      <h2 className="text-lg font-medium text-muted-foreground/80 text-center">媒体路径清单</h2>
                    </div>
                    <MediaPathList />
                  </>
                ) : currentStep === 4 ? (
                  <>
                    {/* 页面顶部小标题 */}
                    <div className="text-center pb-4">
                      <h2 className="text-lg font-medium text-muted-foreground/80 text-center">完成</h2>
                    </div>
                    <StepContent content={currentStepData.content} isLastStep={currentStep === steps.length} />
                  </>
                ) : (
                  <StepContent content={currentStepData.content} isLastStep={currentStep === steps.length} />
                )}
              </>
            )}

          </div>
        </main>
      </div>

    {/* Fixed Bottom Navigation Button - 使用React.memo优化重渲染 */}
    <div
      className="fixed bottom-8 right-4 z-[99999]"
      style={{
        transform: 'translateZ(0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        isolation: 'isolate' // 创建新的层叠上下文
      }}
    >
      <Button
        onClick={handleNextStep}
        disabled={isStartingInitialization}
        className="bg-primary hover:bg-primary/90 text-primary-foreground border border-border/50 px-6 py-3 rounded-xl font-medium shadow-lg hover:shadow-md transition-all duration-300 disabled:opacity-50"
        style={{
          transform: 'translateZ(0)',
          willChange: 'transform'
        }}
      >
        {isStartingInitialization
          ? '正在初始化...'
          : currentStep < steps.length
            ? t('init.nextStep')
            : '完成初始化'
        }
      </Button>
    </div>
    </div>
  )
}
