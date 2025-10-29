"use client"

import { Toaster as SonnerToaster } from "sonner"

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        duration: 3000,
      }}
    />
  )
}
