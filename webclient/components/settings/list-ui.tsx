import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function SettingsPageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-[100dvh] w-full px-3 py-3 sm:px-5 sm:py-5">{children}</div>
}

export function SettingsTitle({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 -mx-3 sm:-mx-5 px-3 sm:px-5 py-3 bg-[rgb(212_215_218)]">
      <h1 className="text-center text-base sm:text-lg font-semibold text-[rgb(74_77_78)]">{children}</h1>
    </div>
  )
}

export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "bg-[rgb(251_251_251)] rounded-xl overflow-hidden border border-[rgb(228_231_234)] shadow-sm",
        className,
      )}
    >
      <div className="divide-y divide-[rgb(228_231_234)]">{children}</div>
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
      <div className="w-12 sm:w-14 flex items-center justify-center border-r border-[rgb(228_231_234)] text-[rgb(160_163_164)]">
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

