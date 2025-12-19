"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import {
  SearchCapsuleButton,
  SearchCapsuleInput,
  SearchStandaloneButton,
  SearchStandaloneInput,
  searchCapsuleWrapperClass,
} from "@/components/search/search-capsule"
import { StorageSettingsBlockDemo } from "@/components/ui-demo-storage-tasks"
import { useTheme } from "next-themes"
import { Switch } from "@/components/ui/switch"
import { TabLikeButton } from "@/components/ui/tab-like-button"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"
import { InfoNote } from "@/components/ui/info-note"
import { InsetCard } from "@/components/ui/inset-card"
import { TagPill } from "@/components/ui/tag-pill"
import { cn } from "@/lib/utils"

const switchColorCandidates = [
  { id: "c1", label: "#0eb83a / rgb(14, 184, 58)", className: "data-[state=checked]:bg-[#0eb83a]" },
]

export function UiDemoView() {
  const [searchText, setSearchText] = useState("")
  const [tagInputText, setTagInputText] = useState("")
  const [tagInputTextWrap, setTagInputTextWrap] = useState("")
  const [demoTags, setDemoTags] = useState<Array<{ name: string; display_name: string }>>([
    { name: "1girl", display_name: "1个女孩" },
    { name: "solo", display_name: "单人" },
    { name: "school_uniform", display_name: "校服" },
  ])
  const [demoTagsWrap, setDemoTagsWrap] = useState<Array<{ name: string; display_name: string }>>([
    { name: "1girl", display_name: "1个女孩" },
    { name: "solo", display_name: "单人" },
    { name: "school_uniform", display_name: "校服" },
    { name: "black_hair", display_name: "黑发" },
    { name: "smile", display_name: "微笑" },
    { name: "outdoors", display_name: "户外" },
    { name: "blue_sky", display_name: "蓝天" },
    { name: "full_body", display_name: "全身" },
    { name: "long_hair", display_name: "长发" },
  ])
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)
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
                  <div className="text-xs font-medium text-[rgb(74_77_78)]">
                    独立按钮（默认小号，可通过 icon 替换图标，className 自行加宽）
                  </div>
                  {/* 不可点击状态：虚线描边版本 */}
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <SearchStandaloneButton
                        disabled
                        wrapperClassName="bg-transparent border border-dashed border-border/70"
                      />
                      <span className="text-[10px] text-[rgb(120_123_124)]">disabled · 虚线描边</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <SearchStandaloneButton
                        disabled
                        icon={null}
                        wrapperClassName="bg-transparent border border-dashed border-border/70"
                      >
                        不可点击
                      </SearchStandaloneButton>
                      <span className="text-[10px] text-[rgb(120_123_124)]">disabled · 文字示例</span>
                    </div>
                  </div>
                  {/* 普通 + loading 示例 */}
                  <div className="flex items-center gap-3 pt-2">
                    <SearchStandaloneButton className="w-20" icon={<ArrowRight className="w-4 h-4" />} />
                    <SearchStandaloneButton
                      className="w-20"
                      icon={
                        demoLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4" />
                        )
                      }
                      disabled={demoLoading}
                      onClick={() => {
                        if (demoLoading) return
                        setDemoError(null)
                        setDemoLoading(true)
                        setTimeout(() => {
                          setDemoLoading(false)
                          setDemoError("暂时不可加载")
                        }, 2000)
                      }}
                    />
                  </div>
                  {demoError && (
                    <p className="text-xs text-destructive mt-1">错误：{demoError}</p>
                  )}
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
                <div className={searchCapsuleWrapperClass}>
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

      {/* 标签输入框 / Tagged input demo */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">标签输入框 / Tagged Input</h2>
        <p className="text-xs text-[rgb(120_123_124)]">
          展示“输入框内的标签（原文+译文）”的视觉效果：TagPill + SearchCapsuleInput 组合。
        </p>

        <div className="w-full max-w-3xl space-y-3">
          <InsetCard title="单行（可删除，横向挤压）" description="适合标签数量不多的场景">
            <div className={cn(searchCapsuleWrapperClass, "h-11 px-2 gap-2")}>
              {demoTags.map((tag) => (
                <TagPill
                  key={tag.name}
                  name={tag.name}
                  displayName={tag.display_name}
                  onRemove={() => setDemoTags((prev) => prev.filter((t) => t.name !== tag.name))}
                />
              ))}
              <SearchCapsuleInput
                value={tagInputText}
                onChange={(e) => setTagInputText(e.target.value)}
                placeholder="输入更多标签…"
                className="px-2 min-w-[8rem]"
              />
            </div>
          </InsetCard>

          <InsetCard title="多标签可换行（可删除）" description="更适合标签很多时的可读性">
            <div
              className={cn(
                searchCapsuleWrapperClass,
                "h-auto min-h-11 px-2 py-2 gap-2 flex-wrap items-start overflow-visible rounded-xl",
              )}
            >
              {demoTagsWrap.map((tag) => (
                <TagPill
                  key={tag.name}
                  name={tag.name}
                  displayName={tag.display_name}
                  onRemove={() => setDemoTagsWrap((prev) => prev.filter((t) => t.name !== tag.name))}
                />
              ))}
              <SearchCapsuleInput
                value={tagInputTextWrap}
                onChange={(e) => setTagInputTextWrap(e.target.value)}
                placeholder="输入更多标签…"
                className="px-2 h-7 min-w-[10rem] flex-1"
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              标签里：左侧展示译文（更醒目），右侧展示原文（等宽+更淡）；点击标签右侧 × 可删除。
            </div>
          </InsetCard>
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
          这里演示“外层设置块 + 内部功能卡片 + 扁平列表”的结构：视觉上只有一套盒子皮肤，区别只是用法不同。
        </p>
        <p className="text-xs text-[rgb(120_123_124)]">
          使用约定：外层设置块一律使用 SettingsGroup；内部需要单独凸显的功能卡片使用 SettingsSecondaryCard；
          两者底层都是同一个盒子组件（圆角、背景、阴影保持一致），只是在布局和间距上不同。带勾选的选项行统一使用
          SelectableListCard + SelectableListItem 作为“元素级”扁平列表。
        </p>
        <p className="text-xs text-[rgb(120_123_124)]">
          跨端说明：iOS / Android 可以直接参照 /design-tokens/ui.json 中的 radius / shadow / spacing 数值，
          以及本页面的展示效果，实现同名组件（SettingsGroup、SettingsSecondaryCard、SelectableListItem 等），即可得到一致的 UI。
        </p>
        <div className="w-full lg:w-1/2">
          <StorageSettingsBlockDemo />
        </div>
      </section>

      {/* 备注提示块 / Notes */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">备注提示块 / Info Note</h2>
        <p className="text-xs text-[rgb(120_123_124)]">
          用于“说明/提示/注意事项”这类文本，避免零散手写 border/bg，保证跨页面一致。
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <InfoNote>
            这是默认提示块：适合放在 SettingsSecondaryCard 内，作为补充说明（例如“不会移动/删除你的文件”）。
          </InfoNote>
          <InfoNote title="注意" variant="warning">
            这是 warning：用于提醒用户有行为影响，但不至于危险（例如“仅在局域网内可访问”）。
          </InfoNote>
          <InfoNote title="危险操作" variant="danger">
            这是 danger：用于高风险操作提示（例如“重置会清空数据库信息”）。
          </InfoNote>
        </div>
      </section>

      {/* 内嵌小块 / Inset Card */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[rgb(74_77_78)]">内嵌小块 / Inset Card</h2>
        <p className="text-xs text-[rgb(120_123_124)]">
          用于内层盒子（SettingsSecondaryCard）里继续分组，典型场景：任务与进度、资产处理进度小块。
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <InsetCard title="媒体索引进度" description="muted 背景，用于分组容器">
            <div className="text-xs text-muted-foreground">这里放一些统计项（例如已入库/总发现/剩余）。</div>
          </InsetCard>
          <InsetCard title="缩略图" variant="surface" description="surface 背景，用于更“卡片感”的小块">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>已完成 120</span>
              <span>排队 30</span>
              <span>处理中 2</span>
            </div>
          </InsetCard>
        </div>
      </section>

    </div>
  )
}
