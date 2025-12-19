"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { StepNavigation } from "@/components/step-navigation"
import { StepContent } from "@/components/step-content"
import { LanguageSelector } from "@/components/language-selector"
import { MediaSourceSelector } from "@/components/media-source-selector"
import { MediaPathList } from "@/components/media-path-list"
import { SettingsGroup, SettingsPanel } from "@/components/settings/list-ui"
import { InitializationFooterNav } from "@/components/init/initialization-footer-nav"
import { InitializationHeader } from "@/components/init/initialization-header"
import { InitializationStepTitle } from "@/components/init/initialization-step-title"
import { apiFetch } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface InitializationViewProps {
  onInitialized?: () => void
}

export function InitializationView({ onInitialized }: InitializationViewProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const router = useRouter()
  const isMockMode = useMemo(() => searchParams?.get("mock") === "1", [searchParams])

  const steps = useMemo(() => ([
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
      title: "媒体来源清单",
      content: {
        title: t('init.step3.title'),
        description: "",
        sections: [],
      },
    },
  ]), [t])

  const initialStep = useMemo(() => {
    const param = Number(searchParams?.get("initStep"))
    if (Number.isFinite(param) && param >= 1 && param <= steps.length) {
      return param
    }
    return 1
  }, [searchParams, steps.length])

  const [currentStep, setCurrentStep] = useState(initialStep)
  const [stepDirection, setStepDirection] = useState<1 | -1>(1)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isStartingInitialization, setIsStartingInitialization] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    setCurrentStep(initialStep)
  }, [initialStep])

  const stepSlideVariants = {
    enter: (direction: 1 | -1) => ({
      x: direction > 0 ? 28 : -28,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: 1 | -1) => ({
      x: direction > 0 ? -28 : 28,
      opacity: 0,
    }),
  }

  const handleEnterHome = () => {
    // 初始化结束后，清理 URL 中的 forceInit 参数并回到首页
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete("forceInit")
      url.searchParams.delete("initStep")
      window.history.replaceState({}, document.title, url.pathname + (url.search ? "?" + url.searchParams.toString() : "") + url.hash)
    } catch {
      // ignore
    }
    if (onInitialized) {
      onInitialized()
    } else {
      router.push("/")
    }
  }

  const handleNextStep = async () => {
    if (currentStep < steps.length) {
      setStepDirection(1)
      setCurrentStep(currentStep + 1)
    } else if (currentStep === steps.length && onInitialized) {
      // 在最后一步，调用后端API启动初始化；mock 模式下直接跳转以便调试动画
      if (isExiting) return
      setIsStartingInitialization(true)
      try {
        if (isMockMode) {
          setIsExiting(true)
          setTimeout(() => onInitialized(), 650)
          return
        }
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
          setIsExiting(true)
          setTimeout(() => onInitialized(), 650)
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

  const handlePrevStep = () => {
    if (isStartingInitialization || isExiting) return
    if (currentStep > 1) {
      setStepDirection(-1)
      setCurrentStep((step) => Math.max(1, step - 1))
    }
  }

  const currentStepData = steps.find((step) => step.id === currentStep)

  return (
    <div className="min-h-screen bg-background">
      <InitializationHeader
        title={t("init.welcome")}
        isExiting={isExiting}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
        showHelp={currentStep === 2 || currentStep === 3}
      />

      <div className="flex py-2 pt-16">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar Navigation - Fixed */}
        <motion.aside
          initial={{ x: 0, opacity: 1 }}
          animate={isExiting ? { x: "-120%", opacity: 0 } : { x: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
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
              if (isStartingInitialization || isExiting) return
              if (stepId === currentStep) {
                setIsSidebarOpen(false)
                return
              }
              setStepDirection(stepId > currentStep ? 1 : -1)
              setCurrentStep(stepId)
              setIsSidebarOpen(false) // 点击步骤后自动关闭侧边栏
            }}
          />
        </motion.aside>

        {/* Main Content */}
        <main
          // 底部预留更多空间，避免内容被右下角固定按钮遮挡
          className="flex-1 lg:ml-44 ml-0 lg:pl-1 pl-1 pr-1 lg:pr-1 lg:relative pb-40"
          onClick={() => setIsSidebarOpen(false)} // 点击内容区域关闭侧边栏
          style={{
            minHeight: 'calc(100vh - 6rem)',
            overflowY: 'auto'
          }}
        >
          <motion.div
            className="w-full max-w-2xl mx-auto px-2 sm:px-4 h-full"
            initial={{ scaleY: 1, opacity: 1, y: 0, transformOrigin: "top center" }}
            animate={isExiting ? { scaleY: 0, opacity: 0, y: -40 } : { scaleY: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            style={{ transformOrigin: "top center" }}
          >

            {/* Step Content */}
            {currentStepData && (
              <AnimatePresence mode="wait" initial={false} custom={stepDirection}>
                <motion.div
                  key={currentStep}
                  custom={stepDirection}
                  variants={stepSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  layout
                  className="w-full"
                >
                  {currentStep === 1 ? (
                    <>
                      <InitializationStepTitle>{t("init.stepHeading.language")}</InitializationStepTitle>
                      <SettingsGroup>
                        <SettingsPanel>
                          <LanguageSelector />
                        </SettingsPanel>
                      </SettingsGroup>
                    </>
                  ) : currentStep === 2 ? (
                    <>
                      <InitializationStepTitle>{t("init.stepHeading.addSource")}</InitializationStepTitle>
                      {/* 第二步：两个独立的大盒子（本机文件夹 / 局域网设备），由内部组件各自渲染 */}
                      <div className="space-y-3">
                        <MediaSourceSelector />
                      </div>
                    </>
                  ) : currentStep === 3 ? (
                    <>
                      <InitializationStepTitle>{t("init.stepHeading.pathList")}</InitializationStepTitle>
                      <SettingsGroup>
                        <SettingsPanel>
                          <MediaPathList />
                        </SettingsPanel>
                      </SettingsGroup>
                    </>
                  ) : currentStep === 4 ? (
                    <>
                      <InitializationStepTitle>完成</InitializationStepTitle>
                      <StepContent
                        content={currentStepData.content}
                        isLastStep={currentStep === steps.length}
                        onEnterHome={handleEnterHome}
                      />
                    </>
                  ) : (
                    <StepContent
                      content={currentStepData.content}
                      isLastStep={currentStep === steps.length}
                      onEnterHome={handleEnterHome}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}

          </motion.div>
        </main>
      </div>

      <InitializationFooterNav
        isLastStep={currentStep >= steps.length}
        isLoading={isStartingInitialization}
        disablePrev={isStartingInitialization || currentStep <= 1}
        onPrev={handlePrevStep}
        onNext={handleNextStep}
      />
    </div>
  )
}
