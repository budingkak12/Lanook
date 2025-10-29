"use client"

import { useCallback } from "react"
import { toast as sonnerToast } from "sonner"

type ToastAction = {
  label: string
  onClick: () => void
}

type ToastOptions = {
  title?: string
  description?: string
  action?: ToastAction
}

export function useToast() {
  const toast = useCallback((options: ToastOptions) => {
    const { title = "", description, action } = options ?? {}

    return sonnerToast(title, {
      description,
      action,
    })
  }, [])

  return { toast }
}

export const toast = sonnerToast
