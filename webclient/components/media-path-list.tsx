'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { getMediaSources, deleteMediaSource, type MediaSource } from '@/lib/api'

export function MediaPathList() {
  const [mediaSources, setMediaSources] = useState<MediaSource[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [selectedSource, setSelectedSource] = useState<MediaSource | null>(null)

  // 加载媒体路径清单
  useEffect(() => {
    const loadMediaSources = async () => {
      try {
        setIsLoading(true)
        const sources = await getMediaSources()
        setMediaSources(sources)
      } catch (error) {
        console.error('加载媒体路径清单失败:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadMediaSources()
  }, [])

  // 删除媒体路径
  const handleDeleteSource = async (id: number) => {
    try {
      setDeletingId(id)
      await deleteMediaSource(id)
      // 从列表中移除
      setMediaSources(prev => prev.filter(source => source.id !== id))
    } catch (error) {
      console.error('删除媒体路径失败:', error)
    } finally {
      setDeletingId(null)
    }
  }

  
  return (
    <div className="space-y-3 w-full">
      {/* 媒体路径清单框架 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-lg space-y-2 w-full" style={{ minHeight: '300px', maxHeight: '500px' }}>
  
          {/* 路径列表 */}
          <div className="space-y-1 flex-1 flex flex-col min-h-0">
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2 justify-start">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">正在加载媒体路径清单...</div>
                </div>
              ) : mediaSources.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">暂无媒体路径，请返回上一步添加</div>
                </div>
              ) : (
                mediaSources.map((source, index) => (
                  <motion.div
                    key={source.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="flex items-center justify-between p-2 sm:p-3 w-full bg-background/80 border border-border/40 rounded-lg hover:bg-white/30 hover:shadow-xl hover:border-white/50 transition-all duration-200 group cursor-pointer"
                    onClick={() => setSelectedSource(source)}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="text-sm font-medium text-foreground truncate">
                          {source.displayName || '未命名路径'}
                        </div>
                        <div className="text-xs text-muted-foreground/80 truncate" title={source.rootPath}>
                          {source.rootPath}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                        {source.type === 'local' ? '本地' : source.type}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteSource(source.id)
                        }}
                        disabled={deletingId === source.id}
                        className="h-8 w-8 p-0 hover:bg-red-500/20 hover:text-red-400 text-muted-foreground group-hover:text-foreground flex-shrink-0"
                      >
                        {deletingId === source.id ? (
                          <div className="w-4 h-4 animate-spin border border-current border-t-transparent rounded-full" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* 底部统计信息 */}
          <div className="pt-3 border-t border-border/20 mt-auto">
            <div className="flex items-center justify-center text-xs text-muted-foreground/70">
              <div>
                共 {mediaSources.length} 个媒体路径
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 详情弹窗 */}
      {selectedSource && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setSelectedSource(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-background/95 border border-border/50 rounded-xl p-6 shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-medium text-foreground">媒体路径详情</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSource(null)}
                className="h-8 w-8 p-0 hover:bg-background/80"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">路径名称</div>
                <div className="text-base font-medium text-foreground break-all">
                  {selectedSource.displayName || '未命名路径'}
                </div>
              </div>

              {/* 完整路径 */}
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">完整路径</div>
                <div className="p-3 bg-background/50 border border-border/30 rounded-lg">
                  <code className="text-sm text-foreground break-all font-mono">
                    {selectedSource.rootPath}
                  </code>
                </div>
              </div>

              {/* 其他信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">类型</div>
                  <div className="text-sm font-medium">
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                      {selectedSource.type === 'local' ? '本地' : selectedSource.type}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">ID</div>
                  <div className="text-sm font-medium text-muted-foreground">
                    #{selectedSource.id}
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-4 border-t border-border/20">
                <Button
                  variant="outline"
                  onClick={() => setSelectedSource(null)}
                  className="flex-1"
                >
                  关闭
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    handleDeleteSource(selectedSource.id)
                    setSelectedSource(null)
                  }}
                  disabled={deletingId === selectedSource.id}
                  className="px-4"
                >
                  {deletingId === selectedSource.id ? (
                    <div className="w-4 h-4 animate-spin border border-current border-t-transparent rounded-full" />
                  ) : (
                    '删除'
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}