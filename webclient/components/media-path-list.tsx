'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { getMediaSources, deleteMediaSource, type MediaSource } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface MediaPathListProps {
  mode?: 'init' | 'settings'  // 使用模式
  onRefresh?: () => void     // 刷新回调
}

export function MediaPathList({ mode = 'init', onRefresh }: MediaPathListProps = {}) {
  const [mediaSources, setMediaSources] = useState<MediaSource[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [selectedSource, setSelectedSource] = useState<MediaSource | null>(null)
  const { toast } = useToast()

  const hasLoadedRef = useRef(false)

  // 加载媒体路径清单
  useEffect(() => {
    if (hasLoadedRef.current) {
      return
    }
    hasLoadedRef.current = true

    const loadMediaSources = async () => {
      try {
        setIsLoading(true)
        console.log('正在加载媒体路径清单...')
        // 只加载活跃的媒体源，已停用的不会显示
        const sources = await getMediaSources(false, { force: true })
        console.log('成功加载媒体路径清单:', sources)
        setMediaSources(sources)
      } catch (error) {
        console.error('加载媒体路径清单失败:', error)
        toast({
          title: "加载失败",
          description: error instanceof Error ? error.message : "无法连接到服务器",
        })
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
      await deleteMediaSource(id) // 使用默认的软删除
      setMediaSources(prev => prev.filter(source => source.id !== id))

      // 设置模式下提供用户反馈
      if (mode === 'settings') {
        toast({
          title: "删除成功",
          description: "媒体路径已标记为删除，媒体列表将立即更新"
        })
      }

      // 调用刷新回调
      onRefresh?.()
    } catch (error) {
      console.error('删除媒体路径失败:', error)
      if (mode === 'settings') {
        toast({
          title: "删除失败",
          description: error instanceof Error ? error.message : "未知错误"
        })
      }
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
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-lg space-y-2 w-full" style={{ maxHeight: '500px' }}>
  
          {/* 路径列表 */}
          <div className="space-y-1 flex flex-col">
            <div className="overflow-y-auto space-y-2 justify-start max-h-[400px]">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">正在加载媒体路径清单...</div>
                </div>
              ) : mediaSources.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">
                    {mode === 'settings' ? '暂无媒体路径' : '暂无媒体路径，请返回上一步添加'}
                  </div>
                </div>
              ) : (
                mediaSources.map((source, index) => (
                  <motion.div
                    key={source.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="flex items-center justify-between p-2 sm:p-3 w-full bg-background/80 border border-border/40 rounded-lg hover:bg-accent/50 hover:border-border/60 transition-all duration-200 group cursor-pointer"
                    onClick={() => setSelectedSource(source)}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="w-6 h-6 bg-primary/20 rounded flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
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
                        {/* 设置模式下显示最后扫描时间 */}
                        {mode === 'settings' && source.lastScanAt && (
                          <div className="text-xs text-muted-foreground mt-1">
                            最后扫描: {new Date(source.lastScanAt).toLocaleString('zh-CN', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <div className="text-xs px-2 py-1 bg-primary/20 text-primary rounded border border-primary/30">
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
            <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground/70">
              <div>
                共 {mediaSources.length} 个媒体路径
              </div>
              {mediaSources.length === 0 && (
                <div>
                  需要至少添加一个媒体路径才能继续
                </div>
              )}
              {mediaSources.length > 0 && (
                <div>
                  可以返回上一步继续添加更多路径
                </div>
              )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">类型</div>
                  <div className="text-sm font-medium">
                    <span className="px-2 py-1 bg-primary/20 text-primary rounded border border-primary/30">
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
                {/* 设置模式下显示最后扫描时间 */}
                {mode === 'settings' && selectedSource.lastScanAt && (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">最后扫描</div>
                    <div className="text-sm font-medium text-muted-foreground">
                      {new Date(selectedSource.lastScanAt).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                )}
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
