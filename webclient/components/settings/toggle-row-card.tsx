"use client"

import type { ReactNode } from "react"

import { Switch } from "@/components/ui/switch"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"

export function SettingsToggleRowCard({
  label,
  checked,
  onCheckedChange,
  cardClassName,
  itemClassName,
  switchClassName,
}: {
  label: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  cardClassName?: string
  itemClassName?: string
  switchClassName?: string
}) {
  return (
    <SelectableListCard className={cardClassName}>
      <SelectableListItem
        showCheck={false}
        onSelect={() => onCheckedChange(!checked)}
        className={itemClassName}
        right={
          <Switch
            className={switchClassName}
            checked={checked}
            onCheckedChange={onCheckedChange}
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        {label}
      </SelectableListItem>
    </SelectableListCard>
  )
}

