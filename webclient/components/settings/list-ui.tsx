import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "framer-motion"

export function SettingsPageShell({ children }: { children: ReactNode }) {
  // 顶部预留：safe-area + 固定标题栏高度（3rem）
  return (
    <div className="min-h-[100dvh] w-full px-3 sm:px-5 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+4.5rem)]">
      {children}
    </div>
  )
}

export function SettingsTitle({ children }: { children: ReactNode }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 bg-background pt-safe">
      <div className="h-12 px-3 sm:px-5 flex items-center gap-2">
        <div className="w-10 shrink-0" />
        <h1 className="flex-1 text-center text-base sm:text-lg font-semibold text-[rgb(74_77_78)]">{children}</h1>
        <div className="w-10 shrink-0" />
      </div>
    </div>
  )
}

export function SettingsTitleBar({
  title,
  left,
  right,
}: {
  title: ReactNode
  left?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 bg-background pt-safe">
      <div className="h-12 px-3 sm:px-5 flex items-center gap-2">
        <div className="w-10 shrink-0 flex items-center">{left}</div>
        <h1 className="flex-1 text-center text-base sm:text-lg font-semibold text-[rgb(74_77_78)]">{title}</h1>
        <div className="w-10 shrink-0 flex items-center justify-end">{right}</div>
      </div>
    </div>
  )
}

// 统一的盒子内核：控制圆角 / 阴影 / 边框 / 背景
function SettingsBoxBase({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // 统一样式：现在不再区分“一级 / 二级 / 三级”，所有盒子共享这一套基础视觉。
        // 一级盒子保留原来的 shadow-lg（偏底部），作为整体“板块”的默认效果。
        "bg-card rounded-xl overflow-hidden shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  )
}

// 一级盒子：用于设置页的大块（内部带 divide-y）
export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <SettingsBoxBase className={className}>
      <div className="divide-y divide-border/50">{children}</div>
    </SettingsBoxBase>
  )
}

// 功能卡片盒子：用于 Demo / 初始化中的主功能卡片（不自动 divide-y）
// 视觉上与 SettingsGroup 完全一致，只是语义和使用场景不同。
// 默认在垂直方向略微“浮起”一点，并使用包裹整个外围的环绕阴影，
// 让二级卡片在一级盒子内部的顶部也能清晰地“脱离出来”。
export function SettingsSecondaryCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <SettingsBoxBase
      className={cn(
        "mt-3",
        // 覆盖基础的 shadow-lg：保持接近一级底部阴影的强度，但改为环绕型阴影，包裹二级卡片的全部外围。
        "shadow-[0_0_28px_rgba(15,23,42,0.16)]",
        className,
      )}
    >
      {children}
    </SettingsBoxBase>
  )
}

type SettingsRowProps = {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  onClick?: () => void
  right?: ReactNode
  showChevron?: boolean
  expanded?: boolean
}

export function SettingsRow({
  icon,
  title,
  description,
  onClick,
  right,
  showChevron = true,
  expanded,
}: SettingsRowProps) {
  const clickable = Boolean(onClick)
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        "w-full text-left flex items-stretch",
        "text-foreground bg-card",
        "active:bg-muted transition-colors",
        clickable && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
      )}
      aria-expanded={expanded}
    >
      {/* 左侧图标栏底色：0.972 ~= 248/255；右侧内容区保持 0.983 ~= 251/255 */}
      <div className="w-12 sm:w-14 flex items-center justify-center border-r border-border/50 bg-muted text-[rgb(130_133_134)]">
        {icon}
      </div>
      <div className="flex-1 px-3 py-3 sm:px-4 sm:py-4 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-foreground text-sm sm:text-base font-medium truncate">{title}</div>
            {description ? (
              <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">{description}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {right}
            {showChevron ? <ChevronRight className="w-4 h-4 text-[rgb(160_163_164)]" /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SettingsPanel({ children }: { children: ReactNode }) {
  return <div className="px-3 py-3 sm:px-4 sm:py-4 bg-card">{children}</div>
}

export function SettingsExpand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="settings-expand"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
