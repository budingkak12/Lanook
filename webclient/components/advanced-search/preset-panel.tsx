"use client"

import { PRESET_CONFIG, type PresetKey } from "./config"

type PresetPanelProps = {
  onApply: (key: PresetKey) => void
}

export function PresetPanel({ onApply }: PresetPanelProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(PRESET_CONFIG).map(([key, cfg]) => (
        <button
          key={key}
          type="button"
          onClick={() => onApply(key as PresetKey)}
          className="rounded-lg border border-border px-3 py-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <div className="text-sm font-semibold text-foreground">{cfg.label}</div>
          <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{cfg.desc}</div>
        </button>
      ))}
    </div>
  )
}
