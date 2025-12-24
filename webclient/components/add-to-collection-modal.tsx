"use client"

import { useState, useEffect } from "react"
import { getCollections, addToCollection, Collection } from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FolderPlus, Check, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface AddToCollectionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    selectedMediaIds: number[]
    searchContext?: {
        queryText: string
        searchMode?: "or" | "and"
        tag?: string | null
    } | null
    onSuccess?: () => void
    customAdd?: (collectionId: number) => Promise<{ added_count?: number } | void>
}

export function AddToCollectionModal({
    open,
    onOpenChange,
    selectedMediaIds,
    searchContext,
    onSuccess,
    customAdd
}: AddToCollectionModalProps) {
    const [collections, setCollections] = useState<Collection[]>([])
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState<number | null>(null)
    const { toast } = useToast()

    useEffect(() => {
        if (open) {
            setLoading(true)
            getCollections().then(setCollections).finally(() => setLoading(false))
        }
    }, [open])

    const handleAdd = async (collectionId: number) => {
        setSubmitting(collectionId)
        try {
            if (customAdd) {
                const res = await customAdd(collectionId)
                const addedCount = res?.added_count
                toast({
                    title: "添加成功",
                    description:
                        typeof addedCount === "number"
                            ? `已添加 ${addedCount} 项到合集`
                            : "已添加到合集",
                })
            } else {
                const hasSelected = selectedMediaIds.length > 0
                const queryText = (searchContext?.queryText || "").trim()
                const payload: {
                    asset_ids?: number[]
                    from_search_result?: boolean
                    search_query?: string
                    search_mode?: "or" | "and"
                    tag?: string | null
                } = {}

                if (hasSelected) {
                    payload.asset_ids = selectedMediaIds
                } else if (queryText) {
                    payload.from_search_result = true
                    payload.search_query = queryText
                    payload.search_mode = searchContext?.searchMode
                    payload.tag = searchContext?.tag ?? null
                } else {
                    toast({
                        title: "无法添加",
                        description: "没有可添加的内容",
                    })
                    return
                }

                const res = await addToCollection(collectionId, payload)
                toast({
                    title: "添加成功",
                    description: `已添加 ${res.added_count} 项到合集`,
                })
            }
            onSuccess?.()
            onOpenChange(false)
        } catch (err) {
            console.error(err)
            toast({
                title: "添加失败",
                description: "请稍后重试",
            })
        } finally {
            setSubmitting(null)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-card border-border">
                <DialogHeader>
                    <DialogTitle>添加到合集</DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : collections.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            尚未创建任何合集
                        </div>
                    ) : (
                        collections.map(col => (
                            <button
                                key={col.id}
                                onClick={() => handleAdd(col.id)}
                                disabled={submitting !== null}
                                className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-primary/10 transition-colors group border border-transparent hover:border-primary/20"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                        <FolderPlus className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium">{col.name}</span>
                                </div>
                                {submitting === col.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                ) : (
                                    <Check className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                            </button>
                        ))
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
