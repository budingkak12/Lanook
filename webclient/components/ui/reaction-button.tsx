"use client"

import { useEffect, useMemo, useState } from "react"
import { Heart, Loader2, Star } from "lucide-react"

type ReactionKind = "like" | "favorite"
export type ReactionVariant =
  | "youtube"
  | "youtube_ripple"
  | "youtube_spark"
  | "youtube_glow"
  | "youtube_soft"
  | "tiktok"
  | "tiktok_burst"
  | "spring"
  | "soft"
  | "pulse_beat"
  | "spin_bloom"
  | "magic_dust"
  | "jiggle"

type ReactionButtonProps = {
  kind: ReactionKind
  active: boolean
  loading?: boolean
  onClick: () => void
  variant: ReactionVariant
  /**
   * 动效速度倍率：>1 更慢，<1 更快
   */
  speed?: number
  sizeClassName?: string
  className?: string
  /**
   * 仅用于演示：不会影响逻辑。
   */
  label?: string
}

const BASE_MS: Record<ReactionVariant, number> = {
  youtube: 260,
  youtube_ripple: 290,
  youtube_spark: 290,
  youtube_glow: 310,
  youtube_soft: 320,
  tiktok: 220,
  tiktok_burst: 230,
  spring: 240,
  soft: 200,
  pulse_beat: 400,
  spin_bloom: 450,
  magic_dust: 500,
  jiggle: 300,
}

const EASING: Record<ReactionVariant, string> = {
  youtube: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  youtube_ripple: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  youtube_spark: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  youtube_glow: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  youtube_soft: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  tiktok: "cubic-bezier(0.2, 0.9, 0.2, 1)",
  tiktok_burst: "cubic-bezier(0.2, 0.9, 0.2, 1)",
  spring: "cubic-bezier(0.16, 1, 0.3, 1)",
  soft: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  pulse_beat: "cubic-bezier(0.25, 0.8, 0.25, 1)",
  spin_bloom: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  magic_dust: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  jiggle: "linear",
}

function Icon({ kind, active }: { kind: ReactionKind; active: boolean }) {
  if (kind === "like") {
    return <Heart className={`h-8 w-8 transition-colors ${active ? "fill-current text-red-500" : "text-slate-400 hover:text-slate-500"}`} />
  }
  return <Star className={`h-8 w-8 transition-colors ${active ? "fill-current text-yellow-500" : "text-slate-400 hover:text-slate-500"}`} />
}

export function ReactionButton({
  kind,
  active,
  loading = false,
  onClick,
  variant,
  speed = 1,
  sizeClassName = "h-11 w-11",
  className = "",
  label,
}: ReactionButtonProps) {
  const [animKey, setAnimKey] = useState(0)
  const [burstKey, setBurstKey] = useState(0)

  useEffect(() => {
    // 每次状态切换都重触发动效（YouTube 的 burst 仅在点亮时触发）
    setAnimKey((v) => v + 1)
    if (active) setBurstKey((v) => v + 1)
  }, [active])

  const ms = useMemo(() => Math.max(80, Math.round(BASE_MS[variant] * Math.max(speed, 0.2))), [speed, variant])
  const easing = EASING[variant]

  const scale = (() => {
    if (variant === "spring") return active ? 1.12 : 1
    if (variant === "soft") return active ? 1.06 : 1
    if (variant === "youtube_soft") return active ? 1.08 : 1
    if (variant === "youtube_glow") return active ? 1.1 : 1
    if (variant.startsWith("youtube")) return active ? 1.09 : 1
    if (variant.startsWith("tiktok")) return active ? 1.12 : 1
    if (variant === "pulse_beat") return active ? 1.15 : 1
    if (variant === "spin_bloom") return active ? 1.1 : 1
    if (variant === "jiggle") return active ? 1.05 : 1
    return active ? 1.1 : 1
  })()

  const accentRgb = kind === "like" ? "239, 68, 68" : "234, 179, 8"

  const rootClass = [
    "relative flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed",
    sizeClassName,
    className,
  ].join(" ")

  return (
    <button
      type="button"
      aria-busy={loading}
      onClick={onClick}
      className={rootClass}
      style={{
        // @ts-expect-error - css var
        "--rb-accent-rgb": accentRgb,
        transform: `scale(${scale})`,
        transitionProperty: "transform",
        transitionDuration: `${ms}ms`,
        transitionTimingFunction: easing,
      }}
      title={label || variant}
    >
      {/* Burst effects (only when toggling to active) */}
      {(variant === "youtube" ||
        variant === "youtube_spark" ||
        variant === "youtube_glow" ||
        variant === "youtube_ripple" ||
        variant === "youtube_soft" ||
        variant === "tiktok_burst" ||
        variant === "magic_dust" ||
        variant === "spin_bloom") &&
        active && (
          <span key={burstKey} className="absolute inset-0 pointer-events-none">
            {variant !== "tiktok_burst" && variant !== "magic_dust" && variant !== "spin_bloom" && (
              <span className={`rb-ring ${variant === "youtube_soft" ? "rb-ring--soft" : variant === "youtube_ripple" ? "rb-ring--ripple" : ""}`} />
            )}
            {variant === "youtube_glow" && <span className="rb-glow" />}
            {(variant === "youtube" || variant === "youtube_glow" || variant === "tiktok_burst") && (
              <>
                <span className="rb-dot rb-dot-1" />
                <span className="rb-dot rb-dot-2" />
                <span className="rb-dot rb-dot-3" />
                <span className="rb-dot rb-dot-4" />
                <span className="rb-dot rb-dot-5" />
                <span className="rb-dot rb-dot-6" />
              </>
            )}
            {variant === "youtube_spark" && (
              <>
                <span className="rb-spark rb-spark-1" />
                <span className="rb-spark rb-spark-2" />
                <span className="rb-spark rb-spark-3" />
                <span className="rb-spark rb-spark-4" />
                <span className="rb-spark rb-spark-5" />
                <span className="rb-spark rb-spark-6" />
              </>
            )}
            {variant === "tiktok_burst" && (
              <>
                <span className="rb-tt-glow" />
                <span className="rb-dot rb-dot-1" />
                <span className="rb-dot rb-dot-2" />
                <span className="rb-dot rb-dot-3" />
                <span className="rb-dot rb-dot-4" />
                <span className="rb-dot rb-dot-5" />
                <span className="rb-dot rb-dot-6" />
              </>
            )}
            {variant === "magic_dust" && (
              <>
                <span className="rb-dust rb-dust-1" />
                <span className="rb-dust rb-dust-2" />
                <span className="rb-dust rb-dust-3" />
                <span className="rb-dust rb-dust-4" />
                <span className="rb-dust rb-dust-5" />
                <span className="rb-dust rb-dust-6" />
              </>
            )}
            {variant === "spin_bloom" && (
              <span className="rb-bloom" />
            )}
          </span>
        )}

      <span
        key={animKey}
        className={`relative flex items-center justify-center ${variant.startsWith("tiktok")
            ? "rb-pop"
            : variant === "spring"
              ? "rb-spring"
              : variant.startsWith("youtube")
                ? variant === "youtube_soft"
                  ? "rb-yt-soft"
                  : "rb-bounce"
                : variant === "pulse_beat"
                  ? "rb-pulse-beat"
                  : variant === "spin_bloom"
                    ? "rb-spin-bloom"
                    : variant === "jiggle"
                      ? "rb-jiggle"
                      : "rb-soft"
          }`}
      >
        <span style={{ opacity: loading ? 0.55 : 1, transition: `opacity ${ms}ms ${easing}` }}>
          <Icon kind={kind} active={active} />
        </span>
        {loading && <Loader2 className="absolute h-6 w-6 animate-spin text-slate-400" />}
      </span>

      {label ? (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-neutral-400 whitespace-nowrap">
          {label}
        </span>
      ) : null}

      <style jsx>{`
        .rb-pop {
          animation: rb-pop ${ms}ms ${easing};
        }
        @keyframes rb-pop {
          0% {
            transform: scale(1);
          }
          35% {
            transform: scale(1.32);
          }
          70% {
            transform: scale(0.96);
          }
          100% {
            transform: scale(1);
          }
        }

        .rb-bounce {
          animation: rb-bounce ${ms}ms ${easing};
        }
        @keyframes rb-bounce {
          0% {
            transform: translateY(0) scale(1);
          }
          40% {
            transform: translateY(-2px) scale(1.18);
          }
          75% {
            transform: translateY(0) scale(0.98);
          }
          100% {
            transform: translateY(0) scale(1);
          }
        }

        .rb-spring {
          animation: rb-spring ${Math.round(ms * 1.15)}ms ${EASING.spring};
        }
        @keyframes rb-spring {
          0% {
            transform: scale(1);
          }
          55% {
            transform: scale(1.22);
          }
          80% {
            transform: scale(0.98);
          }
          100% {
            transform: scale(1);
          }
        }

        .rb-soft {
          animation: rb-soft ${Math.round(ms * 1.05)}ms ${easing};
        }
        @keyframes rb-soft {
          0% {
            transform: scale(1);
          }
          60% {
            transform: scale(1.12);
          }
          100% {
            transform: scale(1);
          }
        }

        .rb-pulse-beat {
          animation: rb-pulse-beat ${Math.round(ms * 1.5)}ms ${easing};
        }
        @keyframes rb-pulse-beat {
          0% { transform: scale(1); }
          14% { transform: scale(1.25); }
          28% { transform: scale(1); }
          42% { transform: scale(1.25); }
          70% { transform: scale(1); }
          100% { transform: scale(1); }
        }

        .rb-spin-bloom {
          animation: rb-spin-bloom ${Math.round(ms * 1.3)}ms ${easing};
        }
        @keyframes rb-spin-bloom {
          0% { transform: scale(0.8) rotate(0deg); }
          60% { transform: scale(1.2) rotate(100deg); }
          100% { transform: scale(1) rotate(0deg); }
        }

        .rb-jiggle {
          animation: rb-jiggle ${Math.round(ms * 1.2)}ms ${easing};
        }
        @keyframes rb-jiggle {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(-12deg); }
          50% { transform: rotate(12deg); }
          75% { transform: rotate(-6deg); }
          100% { transform: rotate(0deg); }
        }

        .rb-ring {
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          border: 2px solid rgba(var(--rb-accent-rgb), 0.45);
          box-shadow: 0 0 0 1px rgba(var(--rb-accent-rgb), 0.12) inset;
          animation: rb-ring ${Math.round(ms * 1.1)}ms ${easing};
          opacity: 0;
        }
        .rb-ring--soft {
          border-color: rgba(var(--rb-accent-rgb), 0.32);
        }
        .rb-ring--ripple {
          border-width: 2px;
          filter: blur(0.2px);
        }
        @keyframes rb-ring {
          0% {
            transform: scale(0.6);
            opacity: 0.65;
          }
          100% {
            transform: scale(1.35);
            opacity: 0;
          }
        }

        .rb-glow {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 70%;
          height: 70%;
          transform: translate(-50%, -50%);
          border-radius: 9999px;
          background: rgba(var(--rb-accent-rgb), 0.22);
          filter: blur(10px);
          opacity: 0;
          animation: rb-glow ${Math.round(ms * 1.2)}ms ${easing};
        }
        @keyframes rb-glow {
          0% {
            transform: translate(-50%, -50%) scale(0.7);
            opacity: 0.55;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0;
          }
        }

        .rb-bloom {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 90%;
          height: 90%;
          transform: translate(-50%, -50%);
          border-radius: 9999px;
          background: rgba(var(--rb-accent-rgb), 0.3);
          filter: blur(8px);
          opacity: 0;
          animation: rb-bloom-anim ${Math.round(ms * 1.1)}ms ${easing};
        }
        @keyframes rb-bloom-anim {
          0% { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
          40% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
        }

        .rb-tt-glow {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 70%;
          height: 70%;
          transform: translate(-50%, -50%);
          border-radius: 9999px;
          background: rgba(var(--rb-accent-rgb), 0.28);
          filter: blur(12px);
          opacity: 0;
          animation: rb-tt-glow ${Math.round(ms * 1.05)}ms ${easing};
        }
        @keyframes rb-tt-glow {
          0% {
            transform: translate(-50%, -50%) scale(0.55);
            opacity: 0.65;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.35);
            opacity: 0;
          }
        }

        .rb-dot {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 6px;
          height: 6px;
          background: rgba(var(--rb-accent-rgb), 0.92);
          border-radius: 9999px;
          transform: translate(-50%, -50%);
          animation: rb-dot ${Math.round(ms * 1.1)}ms ${easing};
          opacity: 0;
        }
        @keyframes rb-dot {
          0% {
            transform: translate(-50%, -50%) scale(0.6);
            opacity: 0.8;
          }
          100% {
            transform: translate(var(--dx), var(--dy)) scale(0.9);
            opacity: 0;
          }
        }
        .rb-dot-1 {
          --dx: -28px;
          --dy: -12px;
        }
        .rb-dot-2 {
          --dx: -10px;
          --dy: -30px;
        }
        .rb-dot-3 {
          --dx: 12px;
          --dy: -28px;
        }
        .rb-dot-4 {
          --dx: 30px;
          --dy: -10px;
        }
        .rb-dot-5 {
          --dx: 20px;
          --dy: 24px;
        }
        .rb-dot-6 {
          --dx: -22px;
          --dy: 22px;
        }

        .rb-spark {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 16px;
          height: 2px;
          border-radius: 9999px;
          background: rgba(var(--rb-accent-rgb), 0.95);
          transform: translate(-50%, -50%) rotate(var(--a)) translateX(0) scaleX(0.2);
          transform-origin: 50% 50%;
          opacity: 0;
          animation: rb-spark ${Math.round(ms * 1.05)}ms ${easing};
          filter: drop-shadow(0 0 2px rgba(var(--rb-accent-rgb), 0.25));
        }
        @keyframes rb-spark {
          0% {
            opacity: 0.85;
            transform: translate(-50%, -50%) rotate(var(--a)) translateX(0) scaleX(0.2);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--a)) translateX(18px) scaleX(1);
          }
        }
        .rb-spark-1 {
          --a: 0deg;
        }
        .rb-spark-2 {
          --a: 60deg;
        }
        .rb-spark-3 {
          --a: 120deg;
        }
        .rb-spark-4 {
          --a: 180deg;
        }
        .rb-spark-5 {
          --a: 240deg;
        }
        .rb-spark-6 {
          --a: 300deg;
        }

        .rb-dust {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 4px;
          height: 4px;
          background: rgba(var(--rb-accent-rgb), 0.85);
          border-radius: 9999px;
          transform: translate(-50%, -50%);
          opacity: 0;
          animation: rb-dust ${Math.round(ms * 1.4)}ms ${easing};
        }
        @keyframes rb-dust {
          0% { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
          20% { transform: translate(calc(-50% + var(--dx) * 0.3), calc(-50% + var(--dy) * 0.3)) scale(1); opacity: 0.9; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy) - 20px)) scale(0); opacity: 0; }
        }
        .rb-dust-1 { --dx: -15px; --dy: -15px; }
        .rb-dust-2 { --dx: 15px; --dy: -18px; }
        .rb-dust-3 { --dx: -10px; --dy: -25px; }
        .rb-dust-4 { --dx: 10px; --dy: -12px; }
        .rb-dust-5 { --dx: -18px; --dy: -8px; }
        .rb-dust-6 { --dx: 18px; --dy: -20px; }

        .rb-yt-soft {
          animation: rb-yt-soft ${Math.round(ms * 1.15)}ms ${easing};
        }
        @keyframes rb-yt-soft {
          0% {
            transform: scale(1);
          }
          55% {
            transform: scale(1.14);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </button>
  )
}
