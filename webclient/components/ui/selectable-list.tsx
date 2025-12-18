// 扁平选择列表组件（有勾选的小行列表）。
// 视觉规格对应 design-tokens/ui.json 中的 "SelectableListItem"。
"use client"

import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

export function SelectableList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-card divide-y divide-border/50", className)}>{children}</div>
}

export function SelectableListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl overflow-hidden bg-card", className)}>
      <SelectableList>{children}</SelectableList>
    </div>
  )
}

export type SelectableListItemProps = {
  selected?: boolean
  onSelect?: () => void
  children: React.ReactNode
  className?: string
  right?: React.ReactNode
  showCheck?: boolean
}

export function SelectableListItem({
  selected = false,
  onSelect,
  children,
  className,
  right,
  showCheck = true,
}: SelectableListItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between px-4 py-3 text-left text-sm text-foreground",
        "active:bg-muted transition-colors",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {showCheck && selected ? (
          <Check className="w-4 h-4 text-[#0eb83a]" style={{ strokeWidth: 3.2 }} />
        ) : (
          <span className="w-4 h-4" />
        )}
        <div className="min-w-0">{children}</div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </button>
  )
}
