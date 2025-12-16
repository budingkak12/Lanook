"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { SettingsPageShell, SettingsTitleBar } from "@/components/settings/list-ui"

type StandardSettingsPageProps = {
  title: ReactNode
  children: ReactNode
  left?: ReactNode
  right?: ReactNode
  className?: string
  scroll?: boolean
}

export function StandardSettingsPage({ title, children, left, right, className, scroll = true }: StandardSettingsPageProps) {
  return (
    <div className={cn("h-full min-h-[100dvh] bg-background", scroll ? "overflow-y-auto" : "overflow-y-visible", className)}>
      <SettingsPageShell>
        <SettingsTitleBar title={title} left={left} right={right} />
        {children}
      </SettingsPageShell>
    </div>
  )
}
