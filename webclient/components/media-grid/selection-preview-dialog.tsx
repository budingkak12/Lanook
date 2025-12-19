"use client"

import type { MediaItem } from "@/app/(main)/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { resolveApiUrl } from "@/lib/api"

type SelectionPreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: MediaItem[]
}

export function SelectionPreviewDialog({ open, onOpenChange, items }: SelectionPreviewDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>将要删除（测试弹窗）</AlertDialogTitle>
        </AlertDialogHeader>

        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">当前没有选中任何项目。</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-[60dvh] overflow-auto rounded-xl border border-border p-2">
            {items.map((item) => (
              <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <img
                  src={
                    item.thumbnailUrl
                      ? resolveApiUrl(item.thumbnailUrl)
                      : item.resourceUrl
                        ? resolveApiUrl(item.resourceUrl)
                        : "/file.svg"
                  }
                  alt={item.filename || `媒体 ${item.id}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget
                    if (target.src.endsWith("/file.svg")) return
                    target.src = "/file.svg"
                  }}
                />
                {item.type === "video" && (
                  <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    视频
                  </div>
                )}
                <div className="absolute left-0 right-0 bottom-0 bg-black/55 px-1 py-1">
                  <div className="text-[10px] text-white/90 truncate">{item.filename || item.id}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>知道了</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

