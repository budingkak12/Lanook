// 搜索胶囊 + 独立按钮组件。
// 高度、圆角等规格可以在 design-tokens/ui.json 的 "SearchCapsule" / "SearchStandaloneButton" 中找到。
"use client"

import * as React from "react"
import { Search as SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type SearchCapsuleInputProps = React.ComponentProps<"input">

// 标准搜索胶囊外壳样式（输入框 + 可选按钮共用）/ Search capsule shell style
export const searchCapsuleWrapperClass =
  "flex w-full items-center rounded-full border bg-card overflow-hidden shadow-inner border-[rgb(150_150_150)] focus-within:border-[rgb(90_90_90)] dark:border-[rgb(120_120_120)] dark:bg-[rgb(56_56_56)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)]"

export function SearchCapsuleInput({ className, ...props }: SearchCapsuleInputProps) {
  return (
    <Input
      {...props}
      className={cn(
        // 透明背景，使用外层胶囊的填充色；重置 selection 样式，避免暗色模式下出现奇怪的高亮块
        "h-11 flex-1 border-none bg-transparent shadow-none rounded-none px-5 text-base placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:border-transparent selection:bg-transparent selection:text-inherit",
        className,
      )}
    />
  )
}

export type SearchCapsuleButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode
}

const baseButtonClass =
  "flex h-11 w-14 items-center justify-center bg-card text-foreground transition-colors"

export function SearchCapsuleButton({ className, icon, type = "button", ...props }: SearchCapsuleButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        baseButtonClass,
        // 默认底色比输入框区域略深一点，形成“分区”层次
        "bg-muted",
        "border-l border-border",
        "hover:border-primary hover:bg-primary hover:text-primary-foreground",
        className,
      )}
      {...props}
    >
      {icon ?? <SearchIcon className="w-5 h-5" strokeWidth={2.4} />}
    </button>
  )
}

export type SearchStandaloneInputProps = SearchCapsuleInputProps & {
  wrapperClassName?: string
}

export function SearchStandaloneInput({ wrapperClassName, className, ...props }: SearchStandaloneInputProps) {
  return (
    <div
      className={cn(
        searchCapsuleWrapperClass,
        wrapperClassName,
      )}
    >
      <SearchCapsuleInput {...props} className={className} />
    </div>
  )
}

/**
 * 独立按钮：盒子样式与独立搜索框一致，内部默认是放大镜图标。
 * - 默认是“小号”尺寸：较窄、适合表单操作区（`h-9 px-3`）。
 * - 宽度由调用方控制：可通过 `className` / `wrapperClassName` 传入 `w-20` 等类名加宽。
 * - 可通过 `icon` 属性替换内部图标（例如传入其他 Lucide 图标）。
 */
export type SearchStandaloneButtonProps = SearchCapsuleButtonProps & {
  wrapperClassName?: string
  size?: "default" | "compact"
}

export function SearchStandaloneButton({
  wrapperClassName,
  className,
  icon,
  type = "button",
  size = "default",
  ...props
}: SearchStandaloneButtonProps) {
  const hasIcon = icon !== undefined && icon !== null
  const heightClass = size === "compact" ? "h-8 text-xs" : "h-11"
  const paddingClass = size === "compact" ? "px-2" : "px-3"

  return (
    <div
      className={cn(
        // 盒子线条与独立搜索框一致（圆角 + 边框），宽度默认根据内容自适应。
        searchCapsuleWrapperClass,
        "inline-flex w-auto items-center justify-center bg-transparent shadow-none",
        wrapperClassName,
      )}
    >
      <button
        type={type}
        {...props}
        className={cn(
          // 小号按钮：高度与 SearchCapsuleInput 一致；宽度填满外层胶囊，
          // 由外层 wrapperClassName 控制整体宽度（例如 w-full / w-20）。
          "flex w-full items-center justify-center rounded-full border-none bg-card text-muted-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          heightClass,
          paddingClass,
          "hover:bg-primary hover:text-primary-foreground",
          className,
        )}
      >
        {hasIcon ? icon : null}
        {props.children ? (
          <span className={cn("text-sm font-medium leading-none", hasIcon ? "ml-2" : "")}>
            {props.children}
          </span>
        ) : null}
      </button>
    </div>
  )
}
