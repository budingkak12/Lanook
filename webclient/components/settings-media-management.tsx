'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog'
import { MediaSourceSelector } from '@/components/media-source-selector'
import { MediaPathList } from '@/components/media-path-list'
import { startScan, type MediaSource } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { HardDrive, Plus } from 'lucide-react'

interface SettingsMediaManagementProps {
  className?: string
}

export function SettingsMediaManagement({ className }: SettingsMediaManagementProps) {
  const [showAddSource, setShowAddSource] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { toast } = useToast()

  // 添加源成功后立即开始扫描
  const handleSourceAdded = async (source: MediaSource) => {
    setShowAddSource(false)
    setRefreshKey(prev => prev + 1)

    try {
      // 立即开始扫描
      const jobId = await startScan(source.id)
      toast({
        title: "添加成功并开始扫描",
        description: `"${source.displayName || source.rootPath}" 已添加并开始后台扫描`
      })
    } catch (error) {
      console.error('启动扫描失败:', error)
      toast({
        title: "添加成功",
        description: `"${source.displayName || source.rootPath}" 已添加，但扫描启动失败`
      })
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 说明文字 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
        <HardDrive className="w-4 h-4" />
        <span>添加新的媒体路径后，系统将立即开始扫描该路径；删除路径后立即生效。</span>
      </div>

      {/* 媒体路径列表 - 增强版 */}
      <MediaPathList
        key={refreshKey}
        mode="settings" // 标识设置模式
        onRefresh={() => setRefreshKey(prev => prev + 1)}
      />

      {/* 添加路径按钮 */}
      <div className="flex justify-center pt-2">
        <Button
          onClick={() => setShowAddSource(true)}
          className="w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          添加媒体路径
        </Button>
      </div>

      {/* 添加路径对话框 */}
      <AlertDialog open={showAddSource} onOpenChange={setShowAddSource}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>添加新媒体路径</AlertDialogTitle>
            <AlertDialogDescription>
              选择要添加的媒体文件夹路径，添加后将立即开始扫描
            </AlertDialogDescription>
          </AlertDialogHeader>
          <MediaSourceSelector
            onSuccess={handleSourceAdded}
            mode="settings"
          />
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}