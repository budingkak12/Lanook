"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type InsetCardVariant = "muted" | "surface"

export function InsetCard({
  title,
  description,
  icon,
  variant = "muted",
  className,
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  variant?: InsetCardVariant
  className?: string
  children?: ReactNode
}) {
  const variantClassName =
    variant === "surface" ? "bg-card/60 border-border/50" : "bg-muted/10 border-border/50"

  return (
    <div className={cn("rounded-xl border p-3", variantClassName, className)}>
      {title ? (
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
          <span>{title}</span>
        </div>
      ) : null}
      {description ? <div className="mt-1 text-xs text-muted-foreground">{description}</div> : null}
      {children ? <div className={cn(title || description ? "mt-3" : undefined)}>{children}</div> : null}
    </div>
  )
}

