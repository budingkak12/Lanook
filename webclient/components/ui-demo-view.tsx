"use client"

import { useState } from "react"
import { Settings as SettingsIcon, Sparkles } from "lucide-react"

import { SettingsGroup, SettingsPanel } from "@/components/settings/list-ui"
import { SettingsSelectableSection } from "@/components/settings/selectable-section"
import { SettingsToggleRowCard } from "@/components/settings/toggle-row-card"
import {
  SearchCapsuleButton,
  SearchCapsuleInput,
  SearchStandaloneButton,
  SearchStandaloneInput,
} from "@/components/search/search-capsule"
import { Switch } from "@/components/ui/switch"
import { TabLikeButton } from "@/components/ui/tab-like-button"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"

const switchColorCandidates = [
  { id: "c1", label: "#0eb83a / rgb(14, 184, 58)", className: "data-[state=checked]:bg-[#0eb83a]" },
]

export function UiDemoView() {
  const [searchText, setSearchText] = useState("")
  const [autoSearch, setAutoSearch] = useState(true)
  const [instantSearchOpen, setInstantSearchOpen] = useState(true)
  const [thumbSizeTabLike, setThumbSizeTabLike] = useState<"large" | "small">("large")

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

      {/* 大图 / 小图 按钮切换 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">大图 / 小图 切换</h2>
        <div className="w-full lg:w-1/2">
          <div className="flex items-center gap-2">
            {/* Web 侧边栏四个 Tab（随机 / 相册 / 搜索 / 设置）风格的版本，仅保留这一组 */}
            <div className="flex items-center gap-2">
              <TabLikeButton
                active={thumbSizeTabLike === "large"}
                className="w-24"
                onClick={() => setThumbSizeTabLike("large")}
              >
                大图
              </TabLikeButton>

              <TabLikeButton
                active={thumbSizeTabLike === "small"}
                className="w-24"
                onClick={() => setThumbSizeTabLike("small")}
              >
                小图
              </TabLikeButton>
            </div>
          </div>
        </div>
      </section>

      {/* 设置块 + 开关 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">设置块与开关</h2>
        <div className="w-full lg:w-1/2">
          <SettingsGroup>
            <SettingsSelectableSection
              icon={<SettingsIcon className="w-5 h-5" />}
              title="即时搜索"
              description="输入文字后自动触发搜索示例"
              open={instantSearchOpen}
              onToggle={() => setInstantSearchOpen((prev) => !prev)}
              panelTop="这里演示“展开 → 单选勾选”的交互（与主题选择一致）。"
              options={[
                { id: "on", label: "开启（输入即搜索）", selected: autoSearch === true, onSelect: () => setAutoSearch(true) },
                { id: "off", label: "关闭（仅点击按钮搜索）", selected: autoSearch === false, onSelect: () => setAutoSearch(false) },
              ]}
              panelBottom={
                <SettingsToggleRowCard
                  label="Switch 独立展示（不放在“即时搜索”右侧）"
                  checked={autoSearch}
                  onCheckedChange={setAutoSearch}
                />
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
    </div>
  )
}
