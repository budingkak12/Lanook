"use client"

import { useEffect, useState } from "react"
import {
  SearchCapsuleButton,
  SearchCapsuleInput,
  SearchStandaloneButton,
  SearchStandaloneInput,
} from "@/components/search/search-capsule"
import { StorageSettingsBlockDemo } from "@/components/ui-demo-storage-tasks"
import { useTheme } from "next-themes"
import { Switch } from "@/components/ui/switch"
import { TabLikeButton } from "@/components/ui/tab-like-button"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"

const switchColorCandidates = [
  { id: "c1", label: "#0eb83a / rgb(14, 184, 58)", className: "data-[state=checked]:bg-[#0eb83a]" },
]

export function UiDemoView() {
  const [searchText, setSearchText] = useState("")
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = mounted ? theme : undefined

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* 搜索框 + 搜索按钮 */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">搜索相关</h2>
            <div className="space-y-2">
              <div className="text-xs text-[rgb(120_123_124)]">新增组件：独立搜索框 / 独立按钮（样式与当前组合搜索框一致）。</div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="space-y-2">
              <div className="text-xs font-medium text-[rgb(74_77_78)]">独立搜索框</div>
                <div className="w-full max-w-lg">
                    <SearchStandaloneInput
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="搜索"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-[rgb(74_77_78)]">独立按钮</div>
                  <div className="flex items-center gap-3">
                    <SearchStandaloneButton />
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-[rgb(74_77_78)]">开关颜色候选</div>
                    <div className="flex flex-wrap gap-3">
                      {switchColorCandidates.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm text-[rgb(74_77_78)]">
                          <Switch className={item.className} defaultChecked />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs font-medium text-[rgb(74_77_78)]">组合搜索框（Input + Button）</div>
              <div className="w-full max-w-4xl">
                <div className="flex w-full items-center rounded-full border border-[rgb(150_150_150)] bg-[rgb(252_252_252)] overflow-hidden focus-within:border-[rgb(90_90_90)]">
                  <SearchCapsuleInput
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="搜索"
                  />
                  <SearchCapsuleButton />
                </div>
              </div>
              <p className="text-xs text-[rgb(120_123_124)]">
                搜索框采用一体化的圆角胶囊样式，右侧为放大镜图标区域，整体与设置页白色主题保持一致。
              </p>
            </div>
          </section>

      {/* 主题预览切换 / Theme Preview Switch */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">主题预览切换 / Theme Preview</h2>
        <div className="w-full lg:w-1/2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <TabLikeButton
                active={currentTheme === "light"}
                className="w-28"
                onClick={() => setTheme("light")}
              >
                亮色 / Light
              </TabLikeButton>

              <TabLikeButton
                active={currentTheme === "warm"}
                className="w-28"
                onClick={() => setTheme("warm")}
              >
                暖色 / Warm
              </TabLikeButton>

              <TabLikeButton
                active={currentTheme === "dark"}
                className="w-28"
                onClick={() => setTheme("dark")}
              >
                暗色 / Dark
              </TabLikeButton>

              <TabLikeButton
                active={currentTheme === "system" || (!mounted && !currentTheme)}
                className="w-32"
                onClick={() => setTheme("system")}
              >
                跟随系统 / System
              </TabLikeButton>
            </div>
          </div>
        </div>
      </section>

      {/* 存储与任务示例 / Storage & Tasks demo */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">存储与任务 / Storage &amp; Tasks</h2>
        <p className="text-xs text-[rgb(120_123_124)]">
          演示“一级：存储与任务块 / 二级：文件索引服务卡片 / 三级：扫描模式与间隔”的层级结构。
        </p>
        <p className="text-xs text-[rgb(120_123_124)]">
          规则：有勾选的列表一律使用扁平选择列表 / Selectable List Card（组件名：SelectableListCard），只有细边框不带阴影；
          一级设置块盒子 / Settings Group（组件名：SettingsGroup）和二级功能卡片 / File Index Card（示例组件：StorageTasksSectionDemo）
          保留阴影，用来区分层级。
        </p>
        <div className="w-full lg:w-1/2">
          <StorageSettingsBlockDemo />
        </div>
      </section>

    </div>
  )
}
