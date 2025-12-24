"use client"

import { useEffect, useState } from "react"
import { getCollections, createCollection, deleteCollection, Collection } from "@/lib/api"
import { FolderOpen, Plus, Trash2, Calendar, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { motion, AnimatePresence } from "framer-motion"
import { MediaCollectionView, type MediaCollectionHandle } from "@/components/media-collection-view"
import { MediaGrid } from "@/components/media-grid"
import { useRef } from "react"
import { ArrowLeft } from "lucide-react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

export function CollectionsView() {
    const [collections, setCollections] = useState<Collection[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const collectionRef = useRef<MediaCollectionHandle | null>(null)
    const { t } = useTranslation()
    const { toast } = useToast()

    const [createOpen, setCreateOpen] = useState(false)
    const [createName, setCreateName] = useState("")
    const [createDescription, setCreateDescription] = useState("")
    const [isCreating, setIsCreating] = useState(false)

    const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const fetchCollections = async () => {
        try {
            const data = await getCollections()
            setCollections(data)
        } catch (err) {
            console.error("Failed to fetch collections:", err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchCollections()
    }, [])

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation()
        const target = collections.find(c => c.id === id) ?? null
        setDeleteTarget(target)
    }

    const handleCreate = () => {
        setCreateName("")
        setCreateDescription("")
        setCreateOpen(true)
    }

    const handleConfirmCreate = async () => {
        const name = createName.trim()
        if (!name) return
        setIsCreating(true)
        try {
            await createCollection(name, createDescription.trim() || undefined)
            setCreateOpen(false)
            fetchCollections()
        } catch (err) {
            console.error("Failed to create collection:", err)
            toast({
                title: "创建失败",
                description: err instanceof Error ? err.message : "请稍后重试",
            })
        } finally {
            setIsCreating(false)
        }
    }

    const handleConfirmDelete = async () => {
        const target = deleteTarget
        if (!target) return

        setIsDeleting(true)
        try {
            await deleteCollection(target.id)
            if (selectedId === target.id) setSelectedId(null)
            setDeleteTarget(null)
            fetchCollections()
        } catch (err) {
            console.error("Failed to delete collection:", err)
            toast({
                title: "删除失败",
                description: err instanceof Error ? err.message : "请稍后重试",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (selectedId !== null) {
        const activeCol = collections.find(c => c.id === selectedId)
        return (
            <div className="h-full flex flex-col pt-2">
                <div className="flex items-center gap-3 mb-4">
                    <button
                        onClick={() => setSelectedId(null)}
                        className="p-2 hover:bg-muted rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold">{activeCol?.name || "合集内容"}</h2>
                        <p className="text-xs text-muted-foreground">{activeCol?.description ?? "浏览合集中的媒体"}</p>
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <MediaCollectionView
                        collectionRef={collectionRef}
                        className="h-full"
                        renderList={({ listRef, onMediaClick, onItemsChange }) => (
                            <MediaGrid
                                ref={listRef}
                                collectionId={selectedId}
                                onMediaClick={onMediaClick}
                                onItemsChange={onItemsChange}
                            />
                        )}
                    />
                </div>
            </div>
        )
    }

    return (
        <>
            <div className="h-full overflow-y-auto pt-2">
            <div className="flex justify-between items-center mb-6">
                <div className="space-y-1">
                    <h2 className="text-xl font-bold">{t("collections.title") ?? "合集库"}</h2>
                    <p className="text-sm text-muted-foreground">{t("collections.subtitle") ?? "管理您的个性化媒体资产集"}</p>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:scale-105 active:scale-95 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    {t("collections.new") ?? "新建合集"}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <AnimatePresence>
                    {collections.map((col) => (
                        <motion.div
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                            key={col.id}
                            onClick={() => setSelectedId(col.id)}
                            className="group relative flex flex-col bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl overflow-hidden hover:border-primary/50 hover:bg-card/60 transition-all cursor-pointer shadow-sm hover:shadow-md"
                        >
                            <div className="p-5 flex flex-col h-full space-y-3">
                                <div className="flex items-start justify-between">
                                    <div className="p-3 bg-primary/10 rounded-xl text-primary">
                                        <FolderOpen className="w-6 h-6" />
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(col.id, e)}
                                        className="p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-1 flex-1">
                                    <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-1">
                                        {col.name}
                                    </h3>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {col.description || (t("collections.noDescription") ?? "在这个合集中珍藏精彩瞬间")}
                                    </p>
                                </div>

                                <div className="pt-3 flex items-center justify-between border-t border-border/40">
                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(col.created_at).toLocaleDateString()}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {collections.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center space-y-4 text-center">
                        <FolderOpen className="w-12 h-12 text-muted-foreground/20" />
                        <div className="space-y-1">
                            <h3 className="text-lg font-medium text-muted-foreground">
                                {t("collections.emptyTitle") ?? "空空如也"}
                            </h3>
                            <p className="text-sm text-muted-foreground/50">
                                {t("collections.emptyDesc") ?? "快来创建您的第一个合集吧"}
                            </p>
                        </div>
                    </div>
                )}
            </div>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>新建合集</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-foreground">名称</div>
                            <Input
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                placeholder="例如：旅行、宠物、工作资料"
                                disabled={isCreating}
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-foreground">描述（可选）</div>
                            <Input
                                value={createDescription}
                                onChange={(e) => setCreateDescription(e.target.value)}
                                placeholder="一句话说明这个合集"
                                disabled={isCreating}
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setCreateOpen(false)}
                            disabled={isCreating}
                            className="sm:order-1"
                        >
                            取消
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleConfirmCreate()}
                            disabled={!createName.trim() || isCreating}
                            className="sm:order-2"
                        >
                            {isCreating ? "创建中..." : "创建"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认删除</AlertDialogTitle>
                        <AlertDialogDescription>
                            将删除合集「{deleteTarget?.name ?? ""}」及其关联（不影响原始媒体文件）。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                        <AlertDialogCancel disabled={isDeleting} className="sm:order-1">取消</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            onClick={() => void handleConfirmDelete()}
                            className="sm:order-2"
                        >
                            {isDeleting ? "删除中..." : "删除"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
