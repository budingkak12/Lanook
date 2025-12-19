"use client"

import type { ReactNode } from "react"

export function InitializationStepTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-center pb-4">
      <h2 className="text-lg font-medium text-muted-foreground/80">{children}</h2>
    </div>
  )
}

