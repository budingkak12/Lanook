"use client"

import { useEffect, useMemo, useState } from "react"
import { Heart, Loader2, Star } from "lucide-react"

type ReactionKind = "like" | "favorite"
export type ReactionVariant = "tiktok" | "youtube" | "spring" | "soft"

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
  tiktok: 220,
  youtube: 260,
  spring: 240,
  soft: 200,
}

const EASING: Record<ReactionVariant, string> = {
  tiktok: "cubic-bezier(0.2, 0.9, 0.2, 1)",
  youtube: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  spring: "cubic-bezier(0.16, 1, 0.3, 1)",
  soft: "cubic-bezier(0.2, 0.8, 0.2, 1)",
}

function Icon({ kind, active }: { kind: ReactionKind; active: boolean }) {
  if (kind === "like") {
    return <Heart className={`h-6 w-6 ${active ? "fill-current text-red-400" : "text-white"}`} />
  }
  return <Star className={`h-6 w-6 ${active ? "fill-current text-yellow-400" : "text-white"}`} />
}

export function ReactionButton({
  kind,
  active,
  loading = false,
  onClick,
  variant,
  speed = 1,
  sizeClassName = "h-11 w-11 sm:h-12 sm:w-12",
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
    if (variant === "soft") return active ? 1.06 : 1
    if (variant === "spring") return active ? 1.12 : 1
    if (variant === "youtube") return active ? 1.1 : 1
    return active ? 1.12 : 1
  })()

  const rootClass = [
    "relative flex items-center justify-center rounded-full bg-black/65 text-white disabled:opacity-40 disabled:cursor-not-allowed",
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
        transform: `scale(${scale})`,
        transitionProperty: "transform",
        transitionDuration: `${ms}ms`,
        transitionTimingFunction: easing,
      }}
      title={label || variant}
    >
      {/* YouTube burst */}
      {variant === "youtube" && active && (
        <span key={burstKey} className="absolute inset-0 pointer-events-none">
          <span className="rb-ring" />
          <span className="rb-burst rb-burst-1" />
          <span className="rb-burst rb-burst-2" />
          <span className="rb-burst rb-burst-3" />
          <span className="rb-burst rb-burst-4" />
          <span className="rb-burst rb-burst-5" />
          <span className="rb-burst rb-burst-6" />
        </span>
      )}

      <span key={animKey} className={`relative flex items-center justify-center ${variant === "tiktok" ? "rb-pop" : variant === "spring" ? "rb-spring" : variant === "youtube" ? "rb-bounce" : "rb-soft"}`}>
        <span style={{ opacity: loading ? 0.55 : 1, transition: `opacity ${ms}ms ${easing}` }}>
          <Icon kind={kind} active={active} />
        </span>
        {loading && <Loader2 className="absolute h-6 w-6 animate-spin text-white/90" />}
      </span>

      {label ? (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/70 whitespace-nowrap">
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

        .rb-ring {
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          border: 2px solid rgba(255, 255, 255, 0.38);
          animation: rb-ring ${Math.round(ms * 1.1)}ms ${easing};
          opacity: 0;
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

        .rb-burst {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 6px;
          height: 6px;
          background: rgba(255, 255, 255, 0.85);
          border-radius: 9999px;
          transform: translate(-50%, -50%);
          animation: rb-burst ${Math.round(ms * 1.1)}ms ${easing};
          opacity: 0;
        }
        @keyframes rb-burst {
          0% {
            transform: translate(-50%, -50%) scale(0.6);
            opacity: 0.8;
          }
          100% {
            transform: translate(var(--dx), var(--dy)) scale(0.9);
            opacity: 0;
          }
        }
        .rb-burst-1 {
          --dx: -28px;
          --dy: -12px;
        }
        .rb-burst-2 {
          --dx: -10px;
          --dy: -30px;
        }
        .rb-burst-3 {
          --dx: 12px;
          --dy: -28px;
        }
        .rb-burst-4 {
          --dx: 30px;
          --dy: -10px;
        }
        .rb-burst-5 {
          --dx: 20px;
          --dy: 24px;
        }
        .rb-burst-6 {
          --dx: -22px;
          --dy: 22px;
        }
      `}</style>
    </button>
  )
}

