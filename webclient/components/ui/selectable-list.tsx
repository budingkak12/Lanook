"use client"

import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

export function SelectableList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-[rgb(251_251_251)]", className)}>{children}</div>
}

export type SelectableListItemProps = {
  selected?: boolean
  onSelect?: () => void
  children: React.ReactNode
  className?: string
}

export function SelectableListItem({ selected = false, onSelect, children, className }: SelectableListItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between px-4 py-3 text-left text-sm text-[rgb(74_77_78)]",
        "active:bg-[rgb(240_242_244)] transition-colors",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {selected ? (
          <Check className="w-4 h-4 text-[#0eb83a]" style={{ strokeWidth: 3.2 }} />
        ) : (
          <span className="w-4 h-4" />
        )}
        {children}
      </div>
    </button>
  )
}
