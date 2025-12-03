"use client"

import { useEffect } from "react"
import { motion } from "framer-motion"

interface HomeEntryAnimatorProps {
  durationMs?: number
  onDone?: () => void
}

const tiles = [
  { key: "tl", className: "top-0 left-0", initial: { x: "-120%", y: "-120%", scale: 0.9 } },
  { key: "tr", className: "top-0 right-0", initial: { x: "120%", y: "-120%", scale: 0.9 } },
  { key: "bl", className: "bottom-0 left-0", initial: { x: "-120%", y: "120%", scale: 0.9 } },
  { key: "br", className: "bottom-0 right-0", initial: { x: "120%", y: "120%", scale: 0.9 } },
]

export function HomeEntryAnimator({ durationMs = 1100, onDone }: HomeEntryAnimatorProps) {
  useEffect(() => {
    if (!onDone) return
    const timer = setTimeout(onDone, durationMs)
    return () => clearTimeout(timer)
  }, [durationMs, onDone])

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.2 } }}
      className="fixed inset-0 z-[100000] pointer-events-none"
      style={{ backdropFilter: "blur(0px)" }}
    >
      {tiles.map((tile, index) => (
        <motion.div
          key={tile.key}
          className={`absolute w-1/2 h-1/2 ${tile.className}`}
          style={{
            background: "linear-gradient(135deg, rgba(120,120,255,0.08), rgba(120,255,200,0.08))",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          }}
          initial={{ ...tile.initial, opacity: 0 }}
          animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 0.65, ease: "easeOut", delay: index * 0.05 }}
        />
      ))}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="absolute inset-0 bg-background"
        style={{ opacity: 0.0 }}
      />
    </motion.div>
  )
}

