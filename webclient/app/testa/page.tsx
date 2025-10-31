"use client"

import { useState } from "react"
import { StepNavigation } from "@/components/testa/step-navigation"
import { StepContent } from "@/components/testa/step-content"
import { Button } from "@/components/ui/button"
import { ChevronRight } from "lucide-react"

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
  const [mutedForegroundLightness, setMutedForegroundLightness] = useState(75) // 初始值为 75%
  const [backgroundLightness, setBackgroundLightness] = useState(42) // 初始值为 42% (深灰色)
  const [headerTopLightness, setHeaderTopLightness] = useState(35) // Header 上半部分亮度
  const [headerBottomLightness, setHeaderBottomLightness] = useState(50) // Header 下半部分亮度
  const [showColorPanel, setShowColorPanel] = useState(false)

  const handleNextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const currentStepData = steps.find((step) => step.id === currentStep)

  // 生成动态颜色值
  const generateColorValue = (lightness: number) => {
    return `oklch(${lightness / 100} 0 0)`
  }

  // 更新CSS变量
  const updateCSSVariables = (textLightness: number, bgLightness: number, headerTop: number, headerBottom: number) => {
    const root = document.documentElement
    root.style.setProperty('--dynamic-muted-foreground', generateColorValue(textLightness))
    root.style.setProperty('--dynamic-background', generateColorValue(bgLightness))
    root.style.setProperty('--dynamic-header-top', generateColorValue(headerTop))
    root.style.setProperty('--dynamic-header-bottom', generateColorValue(headerBottom))
  }

  // 当滑块值改变时更新CSS变量
  const handleTextColorChange = (value: number) => {
    setMutedForegroundLightness(value)
    updateCSSVariables(value, backgroundLightness, headerTopLightness, headerBottomLightness)
  }

  const handleBackgroundColorChange = (value: number) => {
    setBackgroundLightness(value)
    updateCSSVariables(mutedForegroundLightness, value, headerTopLightness, headerBottomLightness)
  }

  const handleHeaderTopColorChange = (value: number) => {
    setHeaderTopLightness(value)
    updateCSSVariables(mutedForegroundLightness, backgroundLightness, value, headerBottomLightness)
  }

  const handleHeaderBottomColorChange = (value: number) => {
    setHeaderBottomLightness(value)
    updateCSSVariables(mutedForegroundLightness, backgroundLightness, headerTopLightness, value)
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--dynamic-background, oklch(0.42 0.005 264))' }}
    >
      {/* 颜色调节面板 */}
      <div className="fixed top-4 right-4 z-50 bg-card/90 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-xl w-80">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground">颜色调节面板</h3>
          <button
            onClick={() => setShowColorPanel(!showColorPanel)}
            className="text-xs"
            style={{ color: 'var(--dynamic-muted-foreground, oklch(0.75 0 0))' }}
          >
            {showColorPanel ? '收起' : '展开'}
          </button>
        </div>

        {showColorPanel && (
          <div className="space-y-6">
            {/* Header 颜色调节 */}
            <div className="space-y-4">
              <div className="text-sm font-medium text-foreground">Header 顶部颜色</div>

              <div>
                <label className="text-xs text-foreground block mb-2">
                  Header 上半部分: {headerTopLightness}%
                </label>
                <input
                  type="range"
                  min="5"
                  max="95"
                  value={headerTopLightness}
                  onChange={(e) => handleHeaderTopColorChange(Number(e.target.value))}
                  className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right,
                      oklch(0.05 0 0) 0%,
                      oklch(${headerTopLightness / 100} 0 0) ${(headerTopLightness - 5) * 100 / 90}%,
                      oklch(0.95 0 0) 100%)`
                  }}
                />
                <div className="mt-1 text-xs font-mono text-foreground">
                  {generateColorValue(headerTopLightness)}
                </div>
              </div>

              <div>
                <label className="text-xs text-foreground block mb-2">
                  Header 下半部分: {headerBottomLightness}%
                </label>
                <input
                  type="range"
                  min="5"
                  max="95"
                  value={headerBottomLightness}
                  onChange={(e) => handleHeaderBottomColorChange(Number(e.target.value))}
                  className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right,
                      oklch(0.05 0 0) 0%,
                      oklch(${headerBottomLightness / 100} 0 0) ${(headerBottomLightness - 5) * 100 / 90}%,
                      oklch(0.95 0 0) 100%)`
                  }}
                />
                <div className="mt-1 text-xs font-mono text-foreground">
                  {generateColorValue(headerBottomLightness)}
                </div>
              </div>
            </div>

            {/* 背景颜色调节 */}
            <div>
              <label className="text-xs text-foreground block mb-2">
                背景颜色亮度: {backgroundLightness}%
              </label>
              <input
                type="range"
                min="5"
                max="95"
                value={backgroundLightness}
                onChange={(e) => handleBackgroundColorChange(Number(e.target.value))}
                className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right,
                    oklch(0.05 0 0) 0%,
                    oklch(${backgroundLightness / 100} 0 0) ${(backgroundLightness - 5) * 100 / 90}%,
                    oklch(0.95 0 0) 100%)`
                }}
              />
              <div className="mt-2 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--dynamic-muted-foreground, oklch(0.75 0 0))' }}>当前背景色:</span>
                  <span className="font-mono text-foreground">
                    {generateColorValue(backgroundLightness)}
                  </span>
                </div>
              </div>
            </div>

            {/* 字体颜色调节 */}
            <div>
              <label className="text-xs text-foreground block mb-2">
                静音文本亮度: {mutedForegroundLightness}%
              </label>
              <input
                type="range"
                min="10"
                max="95"
                value={mutedForegroundLightness}
                onChange={(e) => handleTextColorChange(Number(e.target.value))}
                className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right,
                    oklch(0.10 0 0) 0%,
                    oklch(${mutedForegroundLightness / 100} 0 0) ${(mutedForegroundLightness - 10) * 100 / 85}%,
                    oklch(0.95 0 0) 100%)`
                }}
              />
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span style={{ color: 'var(--dynamic-muted-foreground, oklch(0.75 0 0))' }}>当前文本色:</span>
                <span className="font-mono text-foreground">
                  {generateColorValue(mutedForegroundLightness)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--dynamic-muted-foreground, oklch(0.75 0 0))' }}>预览效果:</span>
                <span
                  style={{
                    color: generateColorValue(mutedForegroundLightness),
                    fontWeight: '500'
                  }}
                >
                  这是预览文本
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-border/50">
              <div className="text-xs space-y-1" style={{ color: 'var(--dynamic-muted-foreground, oklch(0.75 0 0))' }}>
                <p>• Header 上半滑块：调节顶部上半部分颜色</p>
                <p>• Header 下半滑块：调节顶部下半部分颜色</p>
                <p>• 背景色滑块：调节页面整体背景</p>
                <p>• 文本色滑块：调节静音文本颜色</p>
                <p>• 实时预览颜色变化效果</p>
                <p>• Header 中间有一条分割线</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 relative overflow-hidden">
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
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-xl font-normal text-foreground">下載並安裝 Android Studio</h1>
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

      <div className="container mx-auto flex gap-8 px-4 py-8">
        {/* Sidebar Navigation */}
        <aside className="w-64 shrink-0">
          <StepNavigation steps={steps} currentStep={currentStep} onStepClick={setCurrentStep} />
        </aside>

        {/* Main Content */}
        <main className="flex-1 max-w-4xl">
          <div className="mb-8">
            <h2 className="text-4xl font-normal text-foreground mb-8 text-balance">下載並安裝 Android Studio</h2>

            {/* Info Card */}
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-6 mb-8 shadow-lg">
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

          {/* Navigation Button */}
          {currentStep < steps.length && (
            <div className="flex justify-end mt-8">
              <Button
                onClick={handleNextStep}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-xl font-medium shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
              >
                下一步
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: var(--primary);
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid var(--background);
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: var(--primary);
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid var(--background);
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  )
}