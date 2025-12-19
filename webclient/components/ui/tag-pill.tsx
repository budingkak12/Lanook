"use client"

import type { ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export type TagPillVariant = "default" | "primary" | "destructive"
export type TagPillLayout = "inline" | "stacked"

export function TagPill({
  prefix,
  name,
  displayName,
  right,
  onRemove,
  variant = "default",
  layout = "inline",
  className,
}: {
  prefix?: string
  name: string
  displayName: string
  right?: ReactNode
  onRemove?: () => void
  variant?: TagPillVariant
  layout?: TagPillLayout
  className?: string
}) {
  const variantClassName =
    variant === "primary"
      ? "border-primary/25 bg-primary/10 text-foreground"
      : variant === "destructive"
        ? "border-destructive/25 bg-destructive/10 text-foreground"
        : "border-border/50 bg-muted/15 text-foreground"

  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 overflow-hidden items-center gap-1.5 rounded-full border px-2 py-1 whitespace-nowrap",
        variantClassName,
        className,
      )}
    >
      {layout === "stacked" ? (
        <span className="min-w-0 flex flex-col leading-none">
          <span className="truncate text-[11px] font-medium">
            {prefix ? <span className="mr-0.5 text-muted-foreground">{prefix}</span> : null}
            {displayName}
          </span>
          <span className="mt-0.5 truncate text-[10px] text-muted-foreground font-mono">{name}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 min-w-0">
          <span className="truncate text-xs font-medium leading-none">
            {prefix ? <span className="mr-0.5 text-muted-foreground">{prefix}</span> : null}
            {displayName}
          </span>
          <span className="text-[10px] text-muted-foreground/70">·</span>
          <span className="truncate text-[10px] text-muted-foreground font-mono leading-none">{name}</span>
        </span>
      )}
      {right ? <span className="shrink-0">{right}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 -mr-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/35 transition-colors"
          aria-label="移除标签"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  )
}
