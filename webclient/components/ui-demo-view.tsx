"use client"

import { useState } from "react"
import { Check, Search as SearchIcon, Settings as SettingsIcon, Sparkles } from "lucide-react"

import { SettingsGroup, SettingsPageShell, SettingsTitle, SettingsRow, SettingsPanel } from "@/components/settings/list-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

const quickActions = [
  { id: "screenshot", label: "屏幕截图" },
  { id: "quick-shot", label: "快速拍照" },
  { id: "switch-app", label: "切换上一个应用" },
]

const switchColorCandidates = [
  { id: "c1", label: "#0eb83a / rgb(14, 184, 58)", className: "data-[state=checked]:bg-[#0eb83a]" },
]

export function UiDemoView() {
  const [searchText, setSearchText] = useState("")
  const [autoSearch, setAutoSearch] = useState(true)
  const [selectedActionId, setSelectedActionId] = useState<string>("screenshot")
  const [thumbSizeTabLike, setThumbSizeTabLike] = useState<"large" | "small">("large")

  return (
    <div className="w-full">
      <SettingsPageShell>
        <SettingsTitle>组件预览</SettingsTitle>

        <div className="space-y-4 sm:space-y-5">
          {/* 搜索框 + 搜索按钮 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">搜索相关</h2>
            <div className="space-y-2">
              <div className="w-full max-w-4xl">
                <div
                  className="flex w-full items-center rounded-full border border-[rgb(150_150_150)] bg-[rgb(252_252_252)] overflow-hidden focus-within:border-[rgb(90_90_90)]"
                >
                  <Input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="搜索"
                    className="h-11 flex-1 border-none bg-transparent shadow-none rounded-none px-5 text-base placeholder:text-[rgb(160_163_164)] focus-visible:ring-0 focus-visible:border-transparent"
                  />
                  <button
                    type="button"
                    className="flex h-11 w-14 items-center justify-center border-l border-[rgb(228_231_234)] bg-[rgb(252_252_252)] hover:bg-[rgb(245_245_245)]"
                  >
                    <SearchIcon className="w-5 h-5 text-[rgb(30_30_30)]" strokeWidth={2.4} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-[rgb(120_123_124)]">
                搜索框采用一体化的圆角胶囊样式，右侧为放大镜图标区域，整体与设置页白色主题保持一致。
              </p>
            </div>
          </section>

          {/* 大图 / 小图 按钮切换 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">大图 / 小图 切换</h2>
            <div className="w-full lg:w-1/2">
              <div className="flex items-center gap-2">
                {/* Web 侧边栏四个 Tab（随机 / 相册 / 搜索 / 设置）风格的版本，仅保留这一组 */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      // 完全复用 StepNavigation 中的样式，只是横向排布、居中
                      "flex items-center gap-2 rounded-xl text-left transition-colors duration-150 justify-center w-24 px-3 py-2",
                      thumbSizeTabLike === "large"
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "bg-card/30 backdrop-blur-sm hover:bg-card/50 shadow-sm hover:shadow-md",
                    )}
                    onClick={() => setThumbSizeTabLike("large")}
                  >
                    <span className="text-sm sm:text-base font-medium leading-relaxed">
                      大图
                    </span>
                  </button>

                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-2 rounded-xl text-left transition-colors duration-150 justify-center w-24 px-3 py-2",
                      thumbSizeTabLike === "small"
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "bg-card/30 backdrop-blur-sm hover:bg-card/50 shadow-sm hover:shadow-md",
                    )}
                    onClick={() => setThumbSizeTabLike("small")}
                  >
                    <span className="text-sm sm:text-base font-medium leading-relaxed">
                      小图
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 设置块 + 开关 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">设置块与开关</h2>
            <div className="w-full lg:w-1/2">
              <SettingsGroup>
                <SettingsRow
                  icon={<SettingsIcon className="w-5 h-5" />}
                  title="即时搜索"
                  description="输入文字后自动触发搜索示例"
                  expanded={false}
                  onClick={() => setAutoSearch((prev) => !prev)}
                  showChevron={false}
                  right={
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      <Switch checked={autoSearch} onCheckedChange={setAutoSearch} />
                    </div>
                  }
                />
                <SettingsPanel>
                  <div className="flex items-center gap-2 text-xs text-[rgb(120_123_124)]">
                    <Sparkles className="w-4 h-4 text-[rgb(190_150_90)]" />
                    <span>该区域展示了设置列表中的单行块样式，以及右侧的开关组件。</span>
                  </div>
                </SettingsPanel>
              </SettingsGroup>
            </div>
          </section>

          {/* 开关颜色候选 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">开关颜色候选</h2>
            <div className="flex flex-wrap gap-4">
              {switchColorCandidates.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm text-[rgb(74_77_78)]">
                  <Switch className={item.className} defaultChecked />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* 选中项目列表 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">选中项目示例</h2>
            <div className="w-full lg:w-1/2">
              <SettingsGroup>
                <div className="bg-[rgb(251_251_251)]">
                  {quickActions.map((action, index) => {
                    const isSelected = action.id === selectedActionId
                    return (
                      <button
                        key={action.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between px-4 py-3 text-left text-sm text-[rgb(74_77_78)]",
                          index !== quickActions.length - 1 && "border-b border-border/50",
                        )}
                        onClick={() => setSelectedActionId(action.id)}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected ? (
                            <Check className="w-4 h-4 text-[#0eb83a]" style={{ strokeWidth: 3.2 }} />
                          ) : (
                            <span className="w-4 h-4" />
                          )}
                          <span>{action.label}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </SettingsGroup>
            </div>
          </section>
        </div>
      </SettingsPageShell>
    </div>
  )
}
