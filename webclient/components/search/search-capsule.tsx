"use client"

import * as React from "react"
import { Search as SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type SearchCapsuleInputProps = React.ComponentProps<"input">

// 标准搜索胶囊外壳样式（输入框 + 可选按钮共用）/ Search capsule shell style
export const searchCapsuleWrapperClass =
  "flex w-full items-center rounded-full border bg-card overflow-hidden shadow-inner border-[rgb(150_150_150)] focus-within:border-[rgb(90_90_90)]"

export function SearchCapsuleInput({ className, ...props }: SearchCapsuleInputProps) {
  return (
    <Input
      {...props}
      className={cn(
        "h-11 flex-1 border-none bg-transparent shadow-none rounded-none px-5 text-base placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:border-transparent",
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
    <button
      type={type}
      {...props}
      className={cn(
        baseButtonClass,
        "rounded-full border border-input",
        "hover:border-primary hover:bg-primary hover:text-primary-foreground",
        className,
        wrapperClassName,
      )}
    >
      {icon ?? <SearchIcon className="w-5 h-5" strokeWidth={2.4} />}
    </button>
  )
}
