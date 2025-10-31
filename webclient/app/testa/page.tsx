"use client"

import { useState, useEffect } from "react"
import { StepNavigation } from "@/components/testa/step-navigation"
import { StepContent } from "@/components/testa/step-content"
import { Button } from "@/components/ui/button"

const steps = [
  {
    id: 1,
    title: "事前準備",
    content: {
      title: "1. 事前準備",
      description: "這個程式碼研究室會說明 Android Studio 的安裝事宜。",
      sections: [
        {
          heading: "必要條件",
          items: [
            "具備中級電腦技能、熟悉檔案和資料夾機制，會使用試算表、文書處理程式或相片編輯器等應用程式。",
            "能夠下載、安裝及更新軟體。",
          ],
        },
        {
          heading: "課程內容",
          items: [
            "本課程將說明如何下載並安裝 Android Studio。",
            "您將學習如何設定開發環境並開始建立 Android 應用程式。",
          ],
        },
      ],
    },
  },
  {
    id: 2,
    title: "Windows：驗證系統需求",
    content: {
      title: "2. Windows：驗證系統需求",
      description: "在安裝 Android Studio 之前，請確認您的系統符合最低需求。",
      sections: [
        {
          heading: "系統需求",
          items: [
            "Microsoft Windows 10/11（64 位元）",
            "至少 8 GB RAM（建議 16 GB）",
            "至少 8 GB 可用磁碟空間",
            "螢幕解析度至少 1280 x 800",
          ],
        },
      ],
    },
  },
  {
    id: 3,
    title: "Windows：下載並安裝 Android Studio",
    content: {
      title: "3. Windows：下載並安裝 Android Studio",
      description: "按照以下步驟在 Windows 上下載並安裝 Android Studio。",
      sections: [
        {
          heading: "安裝步驟",
          items: [
            "前往 Android Studio 官方網站",
            "點擊「Download Android Studio」按鈕",
            "執行下載的 .exe 檔案",
            "按照安裝精靈的指示完成安裝",
          ],
        },
      ],
    },
  },
  {
    id: 4,
    title: "macOS：驗證系統需求",
    content: {
      title: "4. macOS：驗證系統需求",
      description: "在 macOS 上安裝 Android Studio 之前，請確認系統需求。",
      sections: [
        {
          heading: "系統需求",
          items: [
            "macOS 10.14（Mojave）或更高版本",
            "至少 8 GB RAM（建議 16 GB）",
            "至少 8 GB 可用磁碟空間",
            "螢幕解析度至少 1280 x 800",
          ],
        },
      ],
    },
  },
  {
    id: 5,
    title: "macOS：下載並安裝 Android Studio",
    content: {
      title: "5. macOS：下載並安裝 Android Studio",
      description: "按照以下步驟在 macOS 上下載並安裝 Android Studio。",
      sections: [
        {
          heading: "安裝步驟",
          items: [
            "前往 Android Studio 官方網站",
            "下載 macOS 版本的 .dmg 檔案",
            "開啟 .dmg 檔案並將 Android Studio 拖曳到應用程式資料夾",
            "啟動 Android Studio 並完成設定",
          ],
        },
      ],
    },
  },
  {
    id: 6,
    title: "Linux：驗證系統需求",
    content: {
      title: "6. Linux：驗證系統需求",
      description: "在 Linux 上安裝 Android Studio 之前，請確認系統需求。",
      sections: [
        {
          heading: "系統需求",
          items: [
            "GNU/Linux 64 位元發行版",
            "至少 8 GB RAM（建議 16 GB）",
            "至少 8 GB 可用磁碟空間",
            "螢幕解析度至少 1280 x 800",
          ],
        },
      ],
    },
  },
  {
    id: 7,
    title: "Linux：下載並安裝 Android Studio",
    content: {
      title: "7. Linux：下載並安裝 Android Studio",
      description: "按照以下步驟在 Linux 上下載並安裝 Android Studio。",
      sections: [
        {
          heading: "安裝步驟",
          items: [
            "前往 Android Studio 官方網站",
            "下載 Linux 版本的 .tar.gz 檔案",
            "解壓縮檔案到適當的位置",
            "執行 studio.sh 腳本啟動 Android Studio",
          ],
        },
      ],
    },
  },
  {
    id: 8,
    title: "結語",
    content: {
      title: "8. 結語",
      description: "恭喜！您已成功完成 Android Studio 的安裝。",
      sections: [
        {
          heading: "後續步驟",
          items: [
            "探索 Android Studio 的介面和功能",
            "建立您的第一個 Android 專案",
            "學習 Kotlin 或 Java 程式語言",
            "開始開發您的 Android 應用程式",
          ],
        },
      ],
    },
  },
]

export default function Page() {
  const [currentStep, setCurrentStep] = useState(1)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

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
          <div className="container mx-auto px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* 移动端菜单按钮 */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="lg:hidden hover:opacity-70 transition-opacity"
              >
                <div className="flex flex-col justify-center items-center w-6 h-6">
                  <div className="w-5 h-0.5 bg-foreground mb-1.5"></div>
                  <div className="w-5 h-0.5 bg-foreground mb-1.5"></div>
                  <div className="w-5 h-0.5 bg-foreground"></div>
                </div>
              </button>
              <h1 className="text-xl font-normal text-foreground">下載並安裝 Android Studio</h1>
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
            <div className="mb-2">
              {/* Info Card */}
              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-6 mb-6 shadow-lg">
                <h3 className="text-xl font-normal text-foreground mb-4">程式碼研究室簡介</h3>
                <div className="space-y-3 text-sm" style={{ color: 'var(--dynamic-muted-foreground, oklch(0.75 0 0))' }}>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span>上次更新時間：4月 30, 2025</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <span>作者：Google Developers Training team</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step Content */}
            {currentStepData && (
              <StepContent content={currentStepData.content} isLastStep={currentStep === steps.length} />
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
            下一步
          </Button>
        </div>
      )}
    </div>
  )
}