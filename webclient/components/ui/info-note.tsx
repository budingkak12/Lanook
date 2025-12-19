"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type InfoNoteVariant = "default" | "warning" | "danger"

export function InfoNote({
  title,
  icon,
  variant = "default",
  className,
  children,
}: {
  title?: ReactNode
  icon?: ReactNode
  variant?: InfoNoteVariant
  className?: string
  children: ReactNode
}) {
  const variantClassName =
    variant === "danger"
      ? "border-red-200/60 bg-red-50/50 text-red-700"
      : variant === "warning"
        ? "border-amber-200/60 bg-amber-50/40 text-amber-800"
        : "border-border/50 bg-muted/10 text-muted-foreground"

  return (
    <div className={cn("rounded-xl border px-3 py-2", variantClassName, className)}>
      {title ? (
        <div className={cn("flex items-start gap-2", variant === "default" ? "text-foreground" : undefined)}>
          {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
          <div className="min-w-0">
            <div className="text-sm font-medium leading-snug">{title}</div>
            <div className={cn("mt-1 text-sm leading-snug", variant === "default" ? "text-muted-foreground" : undefined)}>
              {children}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm leading-snug">{children}</div>
      )}
    </div>
  )
}

