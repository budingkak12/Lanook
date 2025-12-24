"use client"

import { useEffect, useState, useCallback } from "react"
import { listFolderContents, getCommonFolders, CommonFolderEntry, FolderItem } from "@/lib/api"
import { Folder, File, ChevronRight, Home, ChevronLeft, HardDrive, Search, FolderPlus, MoreVertical } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { AddToCollectionModal } from "@/components/add-to-collection-modal"
import { useTranslation } from "react-i18next"
import { addToCollection } from "@/lib/api"

export function FoldersView() {
    const { t } = useTranslation()
    const [currentPath, setCurrentPath] = useState<string>("")
    const [items, setItems] = useState<FolderItem[]>([])
    const [commonFolders, setCommonFolders] = useState<CommonFolderEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [history, setHistory] = useState<string[]>([])
    const [addingPath, setAddingPath] = useState<string | null>(null)
    const [showAddModal, setShowAddModal] = useState(false)

    const fetchFolders = useCallback(async (path: string) => {
        setLoading(true)
        try {
            if (!path) {
                // Show common folders if no path is selected
                const common = await getCommonFolders()
                setCommonFolders(common)
                setItems([])
            } else {
                const data = await listFolderContents(path)
                setItems(data)
                setCommonFolders([])
            }
            setCurrentPath(path)
        } catch (err) {
            console.error("Failed to list folder contents:", err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchFolders("")
    }, [fetchFolders])

    const navigateTo = (path: string) => {
        if (path === currentPath) return
        setHistory(prev => [...prev, currentPath])
        fetchFolders(path)
    }

    const goBack = () => {
        if (history.length === 0) return
        const prev = history[history.length - 1]
        setHistory(prev => prev.slice(0, -1))
        fetchFolders(prev)
    }

    const breadcrumbs = currentPath.split("/").filter(Boolean)

    return (
        <div className="h-full flex flex-col pt-2">
            {/* Header / Breadcrumbs */}
            <div className="flex items-center gap-2 mb-4 bg-card/30 p-2 rounded-2xl border border-border/40 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <button
                    onClick={() => {
                        setHistory([])
                        fetchFolders("")
                    }}
                    className={cn(
                        "p-2 rounded-xl transition-all flex items-center gap-2",
                        !currentPath ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-muted text-muted-foreground"
                    )}
                >
                    <Home className="w-4 h-4" />
                    <span className="text-sm font-medium">根目录</span>
                </button>

                {history.length > 0 && (
                    <button
                        onClick={goBack}
                        className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-all"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                )}

                {breadcrumbs.map((crumb, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                        <button
                            onClick={() => {
                                const path = "/" + breadcrumbs.slice(0, idx + 1).join("/")
                                navigateTo(path)
                            }}
                            className="px-3 py-1.5 hover:bg-muted rounded-xl text-sm font-medium transition-all"
                        >
                            {crumb}
                        </button>
                    </div>
                ))}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto px-1">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        <AnimatePresence mode="popLayout">
                            {/* Common Folders (Root) */}
                            {!currentPath && commonFolders.map((folder) => (
                                <motion.button
                                    key={folder.path}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    onClick={() => navigateTo(folder.path)}
                                    className="flex items-center gap-4 p-4 bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl hover:bg-muted/40 hover:border-primary/30 transition-all text-left group shadow-sm"
                                >
                                    <div className="p-3 bg-primary/10 rounded-xl text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                                        <HardDrive className="w-6 h-6" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold text-sm truncate uppercase tracking-tight">{folder.name}</div>
                                        <div className="text-[10px] text-muted-foreground truncate opacity-60 font-mono">{folder.path}</div>
                                    </div>
                                </motion.button>
                            ))}

                            {/* Folder Items */}
                            {items.map((item) => (
                                <motion.div
                                    key={item.path}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="relative group h-[100px]"
                                >
                                    <button
                                        onClick={() => item.type === "folder" && navigateTo(item.path)}
                                        className="flex items-center gap-4 p-4 w-full h-full bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl hover:bg-muted/40 hover:border-primary/30 transition-all text-left shadow-sm"
                                    >
                                        <div className={cn(
                                            "p-3 rounded-xl transition-all",
                                            item.type === "folder"
                                                ? "bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white"
                                                : "bg-muted text-muted-foreground"
                                        )}>
                                            {item.type === "folder" ? <Folder className="w-5 h-5 fill-current" /> : <File className="w-5 h-5" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-bold text-sm truncate leading-tight">{item.name}</div>
                                            <div className="text-[10px] text-muted-foreground truncate opacity-60 font-mono">{item.modified || "---"}</div>
                                        </div>
                                    </button>

                                    {item.type === "folder" && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setAddingPath(item.path)
                                                setShowAddModal(true)
                                            }}
                                            className="absolute right-3 top-3 p-1.5 opacity-0 group-hover:opacity-100 bg-background/80 hover:bg-primary hover:text-white rounded-lg transition-all shadow-sm border border-border"
                                            title="添加到合集"
                                        >
                                            <FolderPlus className="w-4 h-4" />
                                        </button>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {!loading && items.length === 0 && commonFolders.length === 0 && (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center opacity-40">
                                <Search className="w-12 h-12 mb-3" />
                                <p>空空如也</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <AddToCollectionModal
                open={showAddModal}
                onOpenChange={setShowAddModal}
                selectedMediaIds={[]} // Not adding by IDs
                onSuccess={() => setAddingPath(null)}
                // We need to pass the custom add logic here
                customAdd={async (collectionId) => {
                    if (!addingPath) return
                    return addToCollection(collectionId, { scan_paths: [addingPath] })
                }}
            />
        </div>
    )
}
