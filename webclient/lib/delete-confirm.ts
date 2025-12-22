"use client"

const SEEN_KEY = "lanook.delete_confirm_seen.v1"

function safeGet(key: string): string | null {
  try {
    if (typeof window === "undefined") return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

export function hasSeenDeleteConfirm(): boolean {
  return safeGet(SEEN_KEY) === "1"
}

export function markSeenDeleteConfirm(): void {
  safeSet(SEEN_KEY, "1")
}
