import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "framer-motion"

export function SettingsPageShell({ children }: { children: ReactNode }) {
  // 顶部预留：safe-area + 固定标题栏高度（3rem）
  return (
    <div className="min-h-[100dvh] w-full px-3 sm:px-5 pb-4 pt-[calc(env(safe-area-inset-top)+3rem)]">
      {children}
    </div>
  )
}

export function SettingsTitle({ children }: { children: ReactNode }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 bg-background pt-safe">
      <div className="h-12 px-3 sm:px-5 flex items-center justify-center">
        <h1 className="text-center text-base sm:text-lg font-semibold text-[rgb(74_77_78)]">{children}</h1>
      </div>
    </div>
  )
}

export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // 阴影与顶部 tab 按钮保持一致（shadow-xs），避免明显描边
        "bg-[rgb(251_251_251)] rounded-xl overflow-hidden shadow-lg",
        className,
      )}
    >
      <div className="divide-y divide-border/50">{children}</div>
    </div>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-stretch",
        "text-[rgb(74_77_78)] bg-[rgb(251_251_251)]",
        "active:bg-[rgb(240_242_244)] transition-colors",
      )}
      aria-expanded={expanded}
    >
      {/* 左侧图标栏底色：0.972 ~= 248/255；右侧内容区保持 0.983 ~= 251/255 */}
      <div className="w-12 sm:w-14 flex items-center justify-center border-r border-border/50 bg-[rgb(248_248_248)] text-[rgb(130_133_134)]">
        {icon}
      </div>
      <div className="flex-1 px-3 py-3 sm:px-4 sm:py-4 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[rgb(74_77_78)] text-sm sm:text-base font-medium truncate">{title}</div>
            {description ? (
              <div className="text-xs sm:text-sm text-[rgb(120_123_124)] mt-0.5 truncate">{description}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {right}
            {showChevron ? <ChevronRight className="w-4 h-4 text-[rgb(160_163_164)]" /> : null}
          </div>
        </div>
      </div>
    </button>
  )
}

export function SettingsPanel({ children }: { children: ReactNode }) {
  return <div className="px-3 py-3 sm:px-4 sm:py-4 bg-[rgb(251_251_251)]">{children}</div>
}

export function SettingsExpand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="settings-expand"
          initial={{ height: 0, opacity: 0, y: -4 }}
          animate={{ height: "auto", opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
