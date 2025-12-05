export type TagSuggestion = { name: string; displayName?: string | null }
export type TagWeight = { name: string; weight: number }
export type ExcludeTag = { name: string }

export type WeightState = {
  randomWeight: number
  recencyBias: number // 0-100, 50 为中性
  videoTilt: number // 0-100, 50 中性
  lengthBias: number // 0-100, 0 偏短 100 偏长
  tagBoost: number
}

export type FilterState = {
  directories: string[]
  customDirectory: string
  includeImage: boolean
  includeVideo: boolean
  lengthBuckets: string[]
  timeRange: string
  limitLatest: boolean
}

export type PresetKey = "recommend" | "video" | "image" | "random" | "nostalgia"

export type PresetSetter = (partial: Partial<WeightState>) => void

export type PresetConfig = {
  label: string
  desc: string
  apply: (setter: PresetSetter) => void
}

export const DIRECTORY_OPTIONS = ["全部", "Camera", "Downloads", "Screenshots"]

export const LENGTH_BUCKETS: { label: string; value: string }[] = [
  { label: "0-15s", value: "0-15" },
  { label: "15-60s", value: "15-60" },
  { label: "60s+", value: "60+" },
]

export const TIME_OPTIONS: { label: string; value: string }[] = [
  { label: "全部时间", value: "all" },
  { label: "过去 24 小时", value: "24h" },
  { label: "最近一周", value: "7d" },
  { label: "最近 30 天", value: "30d" },
]

export const PRESET_CONFIG: Record<PresetKey, PresetConfig> = {
  recommend: {
    label: "推荐模式",
    desc: "轻偏新 · 视频稍高 · 中等随机",
    apply: (s) =>
      s({
        randomWeight: 55,
        recencyBias: 60,
        videoTilt: 65,
        lengthBias: 55,
      }),
  },
  video: {
    label: "视频优先",
    desc: "视频权重高 · 中等随机",
    apply: (s) =>
      s({
        randomWeight: 65,
        recencyBias: 50,
        videoTilt: 85,
        lengthBias: 60,
      }),
  },
  image: {
    label: "图片浏览",
    desc: "图片优先 · 随机适中",
    apply: (s) =>
      s({
        randomWeight: 45,
        recencyBias: 55,
        videoTilt: 30,
        lengthBias: 45,
      }),
  },
  random: {
    label: "混合随机",
    desc: "随机拉满 · 不偏新旧",
    apply: (s) =>
      s({
        randomWeight: 100,
        recencyBias: 50,
        videoTilt: 50,
        lengthBias: 50,
      }),
  },
  nostalgia: {
    label: "怀旧模式",
    desc: "偏旧 · 随机低",
    apply: (s) =>
      s({
        randomWeight: 25,
        recencyBias: 20,
        videoTilt: 45,
        lengthBias: 40,
      }),
  },
}
