"use client"

import { useState } from "react"
import { ReactionButton, ReactionVariant } from "@/components/ui/reaction-button"

const VARIANTS: ReactionVariant[] = [
    "pulse_beat",
    "spin_bloom",
    "magic_dust",
    "jiggle",
    "youtube",
    "youtube_ripple",
    "youtube_spark",
    "youtube_glow",
    "youtube_soft",
    "tiktok",
    "tiktok_burst",
    "spring",
    "soft",
]

export default function ReactionTestPage() {
    // Store active state for specifically this demo page
    // We use a map so each button can be toggled independently
    const [activeStates, setActiveStates] = useState<Record<string, boolean>>({})

    const toggle = (key: string) => {
        setActiveStates((prev) => ({
            ...prev,
            [key]: !prev[key],
        }))
    }

    return (
        <div className="min-h-screen bg-white p-8 text-neutral-900">
            <div className="mx-auto max-w-4xl space-y-12">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-black">Reaction Button Gallery</h1>
                    <p className="text-neutral-600">
                        点击图标查看动画效果。挑选你最喜欢的一款。
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                    {VARIANTS.map((variant) => (
                        <div
                            key={variant}
                            className="flex flex-col items-center gap-6 rounded-2xl bg-neutral-100/50 p-6 ring-1 ring-neutral-200"
                        >
                            <h3 className="font-mono text-sm font-medium text-emerald-600">{variant}</h3>

                            <div className="flex items-center gap-8">
                                {/* Heart / Like Version */}
                                <div className="flex flex-col items-center gap-2">
                                    <ReactionButton
                                        kind="like"
                                        variant={variant}
                                        active={!!activeStates[`${variant}-like`]}
                                        onClick={() => toggle(`${variant}-like`)}
                                    />
                                    <span className="text-xs text-neutral-500">Like</span>
                                </div>

                                {/* Star / Favorite Version */}
                                <div className="flex flex-col items-center gap-2">
                                    <ReactionButton
                                        kind="favorite"
                                        variant={variant}
                                        active={!!activeStates[`${variant}-fav`]}
                                        onClick={() => toggle(`${variant}-fav`)}
                                    />
                                    <span className="text-xs text-neutral-500">Favorite</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
