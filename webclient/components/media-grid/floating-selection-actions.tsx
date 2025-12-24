"use client"

import { FolderPlus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

type FloatingSelectionActionsProps = {
  count: number
  onAddToCollection: () => void
  onDelete: () => void
}

export function FloatingSelectionActions({ count, onAddToCollection, onDelete }: FloatingSelectionActionsProps) {
  if (count <= 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <Button variant="outline" className="rounded-full shadow-lg" onClick={onAddToCollection}>
        <FolderPlus className="mr-2 h-4 w-4" />
        加入合集（{count}）
      </Button>
      <Button variant="destructive" className="rounded-full shadow-lg" onClick={onDelete}>
        <Trash2 className="mr-2 h-4 w-4" />
        删除（{count}）
      </Button>
    </div>
  )
}

