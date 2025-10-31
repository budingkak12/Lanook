'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface FolderItem {
  name: string
  path: string
  type: 'folder' | 'parent'
}

interface FolderBrowserProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (path: string) => void
  initialPath?: string
}

export function FolderBrowser({ isOpen, onClose, onSelect, initialPath = '/' }: FolderBrowserProps) {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [isLoading, setIsLoading] = useState(false)

  // 模拟文件夹数据 - 实际应该从API获取
  const mockFolders: FolderItem[] = [
    { name: '📁 文档', path: `${currentPath}/Documents`, type: 'folder' },
    { name: '📁 下载', path: `${currentPath}/Downloads`, type: 'folder' },
    { name: '📁 桌面', path: `${currentPath}/Desktop`, type: 'folder' },
    { name: '📁 图片', path: `${currentPath}/Pictures`, type: 'folder' },
    { name: '📁 视频', path: `${currentPath}/Movies`, type: 'folder' },
    { name: '📁 音乐', path: `${currentPath}/Music`, type: 'folder' },
    { name: '📁 应用程序', path: `${currentPath}/Applications`, type: 'folder' },
    { name: '📁 公共', path: `${currentPath}/Public`, type: 'folder' },
  ]

  const handleFolderClick = (folder: FolderItem) => {
    if (folder.type === 'folder') {
      setCurrentPath(folder.path)
    } else if (folder.type === 'parent') {
      // 返回上级目录
      const parentPath = folder.path
      setCurrentPath(parentPath)
    }
  }

  const handleSelect = () => {
    onSelect(currentPath)
    onClose()
  }

  const handleBack = () => {
    const pathParts = currentPath.split('/')
    pathParts.pop()
    const parentPath = pathParts.join('/') || '/'
    setCurrentPath(parentPath)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-background/95 backdrop-blur-md border border-border/50 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-foreground">选择文件夹</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>

          {/* 路径导航 */}
          <div className="flex items-center gap-2 mb-4">
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={currentPath === '/'}>
              ← 返回上级
            </Button>
            <Input
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              className="flex-1 bg-background/50 border-border/40 text-sm"
              placeholder="输入路径..."
            />
          </div>

          {/* 文件夹列表 */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {mockFolders.map((folder, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.1, delay: index * 0.02 }}
                className="flex items-center gap-3 p-3 bg-background/30 border border-border/20 rounded-lg hover:bg-background/50 transition-colors cursor-pointer"
                onClick={() => handleFolderClick(folder)}
              >
                <div className="w-8 h-8 bg-blue-500/20 rounded flex items-center justify-center">
                  <span className="text-sm">{folder.name.charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{folder.name}</div>
                  <div className="text-xs text-muted-foreground">{folder.path}</div>
                </div>
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.div>
            ))}
          </div>

          {/* 底部按钮 */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/20">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleSelect} className="bg-primary hover:bg-primary/90">
              选择当前文件夹
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}