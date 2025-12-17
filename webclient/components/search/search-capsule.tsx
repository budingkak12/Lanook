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
}

export function SearchStandaloneButton({
  wrapperClassName,
  className,
  icon,
  type = "button",
  ...props
}: SearchStandaloneButtonProps) {
  return (
    <div
      className={cn(
        // 盒子线条与独立搜索框一致，宽度默认自适应内容
        searchCapsuleWrapperClass,
        "inline-flex w-auto items-center justify-center",
        wrapperClassName,
      )}
    >
      <button
        type={type}
        {...props}
        className={cn(
          // 小号按钮：高度与 SearchCapsuleInput 一致，背景透明，沿用外层胶囊的填充色；
          // 宽度默认较窄，调用方可通过 className/wrapperClassName 自行加宽。
          "flex h-11 px-3 w-auto min-w-[2.25rem] items-center justify-center rounded-none border-none bg-transparent shadow-none text-muted-foreground transition-colors",
          "hover:bg-primary hover:text-primary-foreground",
          className,
        )}
      >
        {icon ?? <SearchIcon className="w-5 h-5" strokeWidth={2.4} />}
      </button>
    </div>
  )
}
