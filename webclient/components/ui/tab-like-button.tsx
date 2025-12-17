"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export type TabLikeButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  active?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
}

export const TabLikeButton = React.forwardRef<HTMLButtonElement, TabLikeButtonProps>(function TabLikeButton(
  { active = false, icon, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        // 与 /ui-demo “大图/小图” 同款盒子样式
        "flex items-center gap-2 rounded-xl text-left transition-colors duration-150 justify-center px-3 py-2",
        active
          ? "bg-primary text-primary-foreground shadow-lg"
          : "bg-card/30 backdrop-blur-sm hover:bg-card/50 shadow-sm hover:shadow-md",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="text-sm sm:text-base font-medium leading-relaxed">{children}</span>
    </button>
  )
})

TabLikeButton.displayName = "TabLikeButton"

