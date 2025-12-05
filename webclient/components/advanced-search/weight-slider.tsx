"use client"

type WeightSliderProps = {
  label: string
  value: number
  min?: number
  max?: number
  helper?: string
  onChange: (v: number) => void
}

export function WeightSlider({ label, value, onChange, min = 0, max = 100, helper }: WeightSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary cursor-pointer"
      />
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  )
}
