'use client'

import { useEffect } from 'react'
import '@/lib/i18n'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // i18n 已经在 lib/i18n.ts 中初始化
  }, [])

  return <>{children}</>
}