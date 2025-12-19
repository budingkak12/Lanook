"use client"

import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

type FloatingDeleteButtonProps = {
  count: number
  onClick: () => void
}

export function FloatingDeleteButton({ count, onClick }: FloatingDeleteButtonProps) {
  if (count <= 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button variant="destructive" className="rounded-full shadow-lg" onClick={onClick}>
        <Trash2 className="mr-2 h-4 w-4" />
        删除（{count}）
      </Button>
    </div>
  )
}

