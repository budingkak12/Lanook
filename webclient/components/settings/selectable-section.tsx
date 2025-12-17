"use client"

import type { ReactNode } from "react"

import { SettingsExpand, SettingsPanel, SettingsRow } from "@/components/settings/list-ui"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"

export type SettingsSelectableOption = {
  id: string
  label: ReactNode
  selected: boolean
  onSelect: () => void
  className?: string
}

export function SettingsSelectableSection({
  icon,
  title,
  description,
  open,
  onToggle,
  options,
  panelTop,
  panelBottom,
  cardClassName,
  showChevron = false,
  rowRight,
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  open: boolean
  onToggle: () => void
  options: SettingsSelectableOption[]
  panelTop?: ReactNode
  panelBottom?: ReactNode
  cardClassName?: string
  showChevron?: boolean
  rowRight?: ReactNode
}) {
  return (
    <>
      <SettingsRow
        icon={icon}
        title={title}
        description={description}
        expanded={open}
        onClick={onToggle}
        showChevron={showChevron}
        right={rowRight}
      />
      <SettingsExpand open={open}>
        <SettingsPanel>
          <div className="space-y-3">
            {panelTop ? <div className="text-xs text-[rgb(120_123_124)]">{panelTop}</div> : null}
            <SelectableListCard className={cardClassName}>
              {options.map((opt) => (
                <SelectableListItem
                  key={opt.id}
                  selected={opt.selected}
                  onSelect={opt.onSelect}
                  className={opt.className}
                >
                  {opt.label}
                </SelectableListItem>
              ))}
            </SelectableListCard>
            {panelBottom}
          </div>
        </SettingsPanel>
      </SettingsExpand>
    </>
  )
}
