'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { SettingsSecondaryCard } from '@/components/settings/list-ui'
import { MediaSourceSelector } from '@/components/media-source-selector'
import { MediaPathList } from '@/components/media-path-list'
import { type MediaSource } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { HardDrive, Plus } from 'lucide-react'
import { SearchStandaloneButton } from "@/components/search/search-capsule"

interface SettingsMediaManagementProps {
  className?: string
}

export function SettingsMediaManagement({ className }: SettingsMediaManagementProps) {
  const [showAddSource, setShowAddSource] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { toast } = useToast()

  const notifySourcesChanged = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('media-sources-changed'))
    }
  }

  // 添加源成功后，创建时已传 scan=true，这里不再二次触发扫描
  const handleSourceAdded = async (source: MediaSource) => {
    setShowAddSource(false)
    setRefreshKey(prev => prev + 1)
    notifySourcesChanged()
    toast({
      title: "添加成功并开始扫描",
      description: `"${source.displayName || source.rootPath}" 已添加并开始后台扫描`
    })
  }

  return (
    <div className={className}>
      <SettingsSecondaryCard>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <HardDrive className="w-5 h-5 text-muted-foreground" />
            <span>媒体路径管理</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            添加新的媒体路径后将立即开始扫描；删除路径后立即生效。
          </div>
        </div>

        <div className="px-4 pb-4 space-y-4">
          {/* 说明文字 */}
          <div className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
            支持本机文件夹与 SMB/NAS。路径添加后会在后台索引，不会移动/删除你的文件。
          </div>

          {/* 媒体路径列表 */}
          <MediaPathList
            key={refreshKey}
            mode="settings"
            onRefresh={() => setRefreshKey((prev) => prev + 1)}
          />

          {/* 添加路径按钮 */}
          <div className="flex justify-center">
            <SearchStandaloneButton
              onClick={() => setShowAddSource(true)}
              icon={<Plus className="w-4 h-4" />}
              wrapperClassName="w-full sm:w-40"
            >
              添加媒体路径
            </SearchStandaloneButton>
          </div>
        </div>
      </SettingsSecondaryCard>

      {/* 添加路径对话框 */}
      <AlertDialog open={showAddSource} onOpenChange={setShowAddSource}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>添加新媒体路径</AlertDialogTitle>
            <AlertDialogDescription>选择要添加的媒体文件夹路径，添加后将立即开始扫描。</AlertDialogDescription>
          </AlertDialogHeader>
          <MediaSourceSelector onSuccess={handleSourceAdded} mode="settings" />
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <SearchStandaloneButton icon={null} size="compact" wrapperClassName="w-full sm:w-28">
                关闭
              </SearchStandaloneButton>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
