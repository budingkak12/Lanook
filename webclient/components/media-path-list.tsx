'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { getMediaSources, deleteMediaSource, type MediaSource, type SourceType } from '@/lib/api'
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

  const resolveSourceType = (source: MediaSource | null | undefined): SourceType | string => {
    if (!source) return 'unknown'
    return source.sourceType ?? source.type
  }

  const renderSourceTypeLabel = (source: MediaSource): string => {
    const type = resolveSourceType(source)
    if (type === 'local') return '本地'
    if (type === 'smb') return 'SMB'
    if (type === 'webdav') return 'WebDAV'
    return typeof type === 'string' && type ? type : '未知'
  }

  const renderScanStrategyLabel = (source: MediaSource): string => {
    const strategy = source.scanStrategy ?? (resolveSourceType(source) === 'local' ? 'realtime' : 'scheduled')
    switch (strategy) {
      case 'realtime':
        return '实时监控'
      case 'scheduled':
        return '定时扫描'
      case 'manual':
        return '手动触发'
      case 'disabled':
        return '已禁用'
      default:
        return '未知'
    }
  }

  const formatInterval = (seconds?: number | null): string => {
    if (!seconds || seconds <= 0) return '系统默认'
    if (seconds % 3600 === 0) {
      const hours = seconds / 3600
      return `${hours} 小时`
    }
    if (seconds % 60 === 0) {
      const minutes = seconds / 60
      return `${minutes} 分钟`
    }
    return `${seconds} 秒`
  }

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
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('media-sources-changed'))
        }
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

  
  const containerClassName =
    mode === 'settings'
      ? 'bg-white border border-gray-200 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-lg space-y-2 w-full'
      : 'p-3 sm:p-4 space-y-2 w-full'

  return (
    <div className="space-y-3 w-full">
      {/* 媒体路径清单框架：初始化模式下只作为一级盒子内部元素，不再自带外层大盒子样式 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className={containerClassName} style={{ maxHeight: '500px' }}>
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
                    className="flex items-center justify-between p-2 sm:p-3 w-full bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all duration-200 group cursor-pointer"
                    onClick={() => setSelectedSource(source)}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="text-sm font-medium text-black truncate">
                          {source.displayName || '未命名路径'}
                        </div>
                        <div className="text-xs text-gray-600 truncate" title={source.rootPath}>
                          {source.rootPath}
                        </div>
                        {/* 设置模式下显示最后扫描时间 */}
                        {mode === 'settings' && source.lastScanAt && (
                          <div className="text-xs text-gray-500 mt-1">
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
                      <div className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded border border-gray-200">
                        {renderSourceTypeLabel(source)}
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
              <h3 className="text-xl font-medium text-black">媒体路径详情</h3>
              <button
                onClick={() => setSelectedSource(null)}
                className="h-8 w-8 p-0 rounded-full border border-[rgb(150_150_150)] bg-[rgb(252_252_252)] text-black hover:border-[rgb(90_90_90)] hover:bg-[rgb(245_245_245)] transition-colors flex items-center justify-center"
              >
                ⟵
              </button>
            </div>

            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="space-y-2">
                <div className="text-sm text-gray-600">路径名称</div>
                <div className="text-base font-medium text-black break-all">
                  {selectedSource.displayName || '未命名路径'}
                </div>
              </div>

              {/* 完整路径 */}
              <div className="space-y-2">
                <div className="text-sm text-gray-600">完整路径</div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <code className="text-sm text-black break-all font-mono">
                    {selectedSource.rootPath}
                  </code>
                </div>
              </div>

              {/* 其他信息 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm text-gray-600">类型</div>
                  <div className="text-sm font-medium">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded border border-blue-200">
                      {renderSourceTypeLabel(selectedSource)}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-gray-600">ID</div>
                  <div className="text-sm font-medium text-black">
                    #{selectedSource.id}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-gray-600">扫描策略</div>
                  <div className="text-sm font-medium text-black">
                    {renderScanStrategyLabel(selectedSource)}
                  </div>
                </div>
                {selectedSource.scanStrategy === 'scheduled' && (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">扫描间隔</div>
                    <div className="text-sm font-medium text-black">
                      {formatInterval(selectedSource.scanIntervalSeconds)}
                    </div>
                  </div>
                )}
                {/* 设置模式下显示最后扫描时间 */}
                {mode === 'settings' && selectedSource.lastScanAt && (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">最后扫描</div>
                    <div className="text-sm font-medium text-black">
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
                {selectedSource.lastScanStartedAt && (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">最近扫描开始</div>
                    <div className="text-sm font-medium text-black">
                      {new Date(selectedSource.lastScanStartedAt).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                )}
                {selectedSource.lastScanFinishedAt && (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">最近扫描结束</div>
                    <div className="text-sm font-medium text-black">
                      {new Date(selectedSource.lastScanFinishedAt).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                )}
                {(selectedSource.failureCount ?? 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">连续失败次数</div>
                    <div className="text-sm font-medium text-red-600">
                      {selectedSource.failureCount}
                    </div>
                  </div>
                )}
                {selectedSource.lastError && (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">最后一次错误</div>
                    <div className="text-xs font-mono bg-red-50 text-red-700 px-3 py-2 rounded border border-red-200 break-all">
                      {selectedSource.lastError}
                    </div>
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-4 border-t border-[rgb(228_231_234)]">
                <button
                  onClick={() => setSelectedSource(null)}
                  className="flex-1 h-9 px-4 rounded-md border border-[rgb(150_150_150)] bg-[rgb(252_252_252)] text-black hover:border-[rgb(90_90_90)] hover:bg-[rgb(245_245_245)] transition-colors text-sm font-medium"
                >
                  关闭
                </button>
                <button
                  onClick={() => {
                    handleDeleteSource(selectedSource.id)
                    setSelectedSource(null)
                  }}
                  disabled={deletingId === selectedSource.id}
                  className="px-4 h-9 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingId === selectedSource.id ? (
                    <div className="w-4 h-4 animate-spin border border-current border-t-transparent rounded-full" />
                  ) : (
                    '删除'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
