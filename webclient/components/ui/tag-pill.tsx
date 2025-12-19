"use client"

import type { ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export function TagPill({
  name,
  displayName,
  right,
  onRemove,
  className,
}: {
  name: string
  displayName: string
  right?: ReactNode
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-foreground",
        className,
      )}
    >
      <span className="inline-flex items-baseline gap-2 min-w-0">
        <span className="text-sm font-medium truncate">{displayName}</span>
        <span className="text-[11px] text-muted-foreground font-mono truncate">{name}</span>
      </span>
      {right ? <span className="shrink-0">{right}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          aria-label="移除标签"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </span>
  )
}

