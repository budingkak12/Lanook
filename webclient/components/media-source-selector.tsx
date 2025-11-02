'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { validateMediaSource, createMediaSource, getCommonFolders, listFolderContents, type CommonFolderEntry, type FolderItem } from '@/lib/api'

export function MediaSourceSelector() {
  const { t } = useTranslation()
    const [selectedPath, setSelectedPath] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<string | null>(null)
  const [currentFolderPath, setCurrentFolderPath] = useState('')
  const [folderContents, setFolderContents] = useState<FolderItem[]>([])
  const [isBrowsingFolder, setIsBrowsingFolder] = useState(false)
  const [commonFolders, setCommonFolders] = useState<CommonFolderEntry[]>([])
  const [isLoadingFolders, setIsLoadingFolders] = useState(false)
  const [isLoadingContents, setIsLoadingContents] = useState(false)

  // 模拟局域网设备
  const networkDevices = [
    { name: 'NAS-家庭', host: '192.168.1.10', type: 'NAS' },
    { name: '办公室服务器', host: '192.168.1.20', type: 'Server' },
    { name: 'Backup-NAS', host: '192.168.1.30', type: 'NAS' },
  ]

  // 初始化：加载常用文件夹
  useEffect(() => {
    const loadCommonFolders = async () => {
      try {
        setIsLoadingFolders(true)
        const folders = await getCommonFolders()
        setCommonFolders(folders)
      } catch (error) {
        console.error('加载常用文件夹失败:', error)
      } finally {
        setIsLoadingFolders(false)
      }
    }
    loadCommonFolders()
  }, [])

  
  const handleSelectPath = async (path: string) => {
    if (!path.trim()) return

    setSelectedPath(path)
    setValidationResult(null)

    try {
      setIsValidating(true)

      // 1. 验证路径
      const validation = await validateMediaSource({
        type: 'local',
        path: path.trim()
      })

      if (validation.ok && validation.readable) {
        // 2. 创建媒体来源
        const source = await createMediaSource({
          type: 'local',
          rootPath: validation.absPath,
          displayName: path.split('/').pop() || path
        })

        setValidationResult(`✅ 成功添加媒体来源: ${source.displayName} (发现 ${validation.estimatedCount} 个文件)`)
        console.log('成功创建媒体来源:', source)
      } else {
        setValidationResult(`❌ 路径验证失败: ${validation.note}`)
      }
    } catch (error) {
      console.error('添加媒体来源失败:', error)
      setValidationResult(`❌ 添加失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsValidating(false)
    }
  }

  const handleCommonPathClick = async (path: string) => {
    // 点击文件夹项是进入文件夹，在当前视图显示内容
    try {
      setIsLoadingContents(true)
      setCurrentFolderPath(path)
      setSelectedPath(path)
      setIsBrowsingFolder(true)

      const contents = await listFolderContents(path)
      // 只显示文件夹，过滤掉文件
      const foldersOnly = contents.filter(item => item.type === 'folder')
      setFolderContents(foldersOnly)
    } catch (error) {
      console.error('加载文件夹内容失败:', error)
      setFolderContents([])
    } finally {
      setIsLoadingContents(false)
    }
  }

  const handleFolderNavigate = async (folder: FolderItem) => {
    if (folder.type === 'folder') {
      try {
        setIsLoadingContents(true)
        setCurrentFolderPath(folder.path)
        setSelectedPath(folder.path)
        setIsBrowsingFolder(true) // 重要：设置浏览状态为true

        const contents = await listFolderContents(folder.path)
        const foldersOnly = contents.filter(item => item.type === 'folder')
        setFolderContents(foldersOnly)
      } catch (error) {
        console.error('加载文件夹内容失败:', error)
        setFolderContents([])
      } finally {
        setIsLoadingContents(false)
      }
    }
  }

  const handleBackToCommon = async () => {
    if (currentFolderPath) {
      // 获取上级目录路径
      const parentPath = currentFolderPath.split('/').slice(0, -1).join('/')

      if (parentPath && parentPath !== currentFolderPath) {
        // 返回到上级目录
        try {
          setIsLoadingContents(true)
          setCurrentFolderPath(parentPath)
          setSelectedPath(parentPath)

          const contents = await listFolderContents(parentPath)
          const foldersOnly = contents.filter(item => item.type === 'folder')
          setFolderContents(foldersOnly)
        } catch (error) {
          console.error('返回上级目录失败:', error)
          setFolderContents([])
        } finally {
          setIsLoadingContents(false)
        }
      } else {
        // 如果已经是顶层，则返回到常用路径
        setIsBrowsingFolder(false)
        setSelectedPath('')
      }
    }
  }

  
  // 格式化路径显示，省略前半部分，适应小屏幕
  const formatPath = (path: string): string => {
    const parts = path.split('/').filter(part => part !== '') // 过滤掉空部分

    // 对于短路径，完整显示
    if (parts.length <= 3) {
      return path
    }

    // 对于长路径（7个部分以上），只保留最后3个部分
    if (parts.length > 7) {
      const lastParts = parts.slice(-3)
      return `.../${lastParts.join('/')}`
    }

    // 对于中等长度的路径（4-7个部分），保留前面2个和最后2个部分
    if (parts.length > 5) {
      const first = parts.slice(0, 2)
      const lastParts = parts.slice(-2)
      return `${first.join('/')}/.../${lastParts.join('/')}`
    }

    // 对于稍长的路径（4-5个部分），保留前面1个和最后2个部分
    if (parts.length > 3) {
      const first = parts[0]
      const lastParts = parts.slice(-2)
      return `${first}/.../${lastParts.join('/')}`
    }

    return path
  }

  return (
    <div className="space-y-4">
  
      {/* 本机文件夹框架 */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        style={{ height: '600px' }}
      >
        <div className="bg-background/30 border border-border/30 rounded-xl p-4 shadow-sm space-y-2 h-full flex flex-col">
          {/* 本机文件夹板块标题 */}
          <h3 className="text-lg font-medium text-foreground mb-3">
            {t('init.sourceType.local.title')}
          </h3>

          {/* 文件夹浏览区域 */}
          <div className="space-y-1 flex-1 flex flex-col min-h-0">
            {/* 头部：返回按钮 + 当前路径 */}
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={isBrowsingFolder ? handleBackToCommon : undefined}
                  className="h-8 w-8 p-0 hover:bg-white/20 flex-shrink-0"
                  disabled={!isBrowsingFolder}
                >
                  ←
                </Button>
                {isBrowsingFolder && (
                  <div className="text-xs text-muted-foreground/80 truncate max-w-[300px]" title={currentFolderPath}>
                    {formatPath(currentFolderPath)}
                  </div>
                )}
              </div>
            </div>

            {/* 文件夹列表 */}
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2 justify-start">
              {isBrowsingFolder ? (
                // 显示当前文件夹内容
                isLoadingContents ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">正在加载文件夹内容...</div>
                  </div>
                ) : folderContents.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">此文件夹为空或无子文件夹</div>
                  </div>
                ) : (
                  folderContents.map((folder, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      className="flex items-center justify-between p-2 h-14 w-full bg-background/80 border border-border/40 rounded-lg hover:bg-white/30 hover:shadow-xl hover:scale-[1.02] hover:border-white/50 transition-all duration-200 cursor-pointer group"
                      onClick={() => handleFolderNavigate(folder)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="text-sm font-medium text-foreground truncate">{folder.name}</div>
                          <div className="text-xs text-muted-foreground/80 truncate" title={folder.path}>{formatPath(folder.path)}</div>
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </motion.div>
                  ))
                )
              ) : (
                // 显示常用路径
                isLoadingFolders ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">正在加载常用文件夹...</div>
                  </div>
                ) : commonFolders.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">未找到常用文件夹</div>
                  </div>
                ) : (
                  commonFolders
                    .filter(folder => folder.readable && !folder.is_root && !folder.is_symlink)
                    .slice(0, 6)
                    .map((folder, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.02 }}
                        className="flex items-center justify-between p-2 h-14 w-full bg-background/60 border border-border/30 rounded-lg hover:bg-white/20 hover:shadow-lg hover:scale-[1.02] hover:border-white/40 transition-all duration-200 cursor-pointer group"
                        onClick={() => handleCommonPathClick(folder.path)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center">
                            <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div className="text-sm font-medium text-foreground truncate">{folder.name}</div>
                            <div className="text-xs text-muted-foreground/80 truncate" title={folder.path}>{formatPath(folder.path)}</div>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </motion.div>
                    ))
                )
              )}
            </div>

            {/* 浏览模式下选择按钮 */}
            {isBrowsingFolder && selectedPath && (
              <Button
                onClick={() => handleSelectPath(selectedPath)}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                disabled={isValidating}
              >
                {isValidating ? '验证中...' : `选择当前文件夹: ${selectedPath.split('/').pop() || selectedPath}`}
              </Button>
            )}
          </div>

          {/* 自定义路径 */}
          <div className="space-y-3 pt-3 border-t border-border/20">
            <p className="text-xs text-muted-foreground/70">
              从上方选择文件夹，或直接输入完整路径
            </p>
            <div className="flex gap-2">
              <Input
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                placeholder={t('init.sourceType.local.pathPlaceholder')}
                className="flex-1 bg-background/60 border-border/40 focus:border-border/60"
                disabled={isValidating}
              />
            </div>

            {/* 验证结果 */}
            {validationResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-lg text-sm ${
                  validationResult.includes('✅')
                    ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                    : 'bg-red-500/10 border border-red-500/30 text-red-300'
                }`}
              >
                {validationResult}
              </motion.div>
            )}

            {/* 添加按钮 */}
            {selectedPath && !isValidating && (
              <Button
                onClick={() => handleSelectPath(selectedPath)}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                disabled={isValidating}
              >
                {isValidating ? '验证中...' : '添加至媒体路径清单'}
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* 局域网设备框架 */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="flex-shrink-0"
      >
        <div className="bg-background/30 border border-border/30 rounded-xl p-4 shadow-sm space-y-4">
          {/* 局域网设备板块标题 */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-foreground">
              {t('init.sourceType.network.title')}
            </h3>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('init.sourceType.network.description')}
          </p>

          {/* SMB 共享 */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground/90">
              {t('init.sourceType.network.smbShare')}
            </h4>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="192.168.1.10"
                  className="flex-1 bg-background/60 border-border/40 focus:border-border/60 text-sm"
                />
                <Input
                  placeholder="共享名称"
                  className="flex-1 bg-background/60 border-border/40 focus:border-border/60 text-sm"
                />
                <Button variant="outline" className="shrink-0 bg-background/40 border-border/40 hover:bg-background/60 text-sm px-3">
                  连接
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="用户名 (可选)"
                  className="flex-1 bg-background/60 border-border/40 focus:border-border/60 text-sm"
                />
                <Input
                  type="password"
                  placeholder="密码 (可选)"
                  className="flex-1 bg-background/60 border-border/40 focus:border-border/60 text-sm"
                />
              </div>
            </div>
          </div>

          {/* 设备列表 */}
          <div className="space-y-4 pt-3 border-t border-border/20">
            <h4 className="text-sm font-medium text-foreground/90">
              {t('init.sourceType.network.deviceList')}
            </h4>
            <div className="space-y-2">
              {networkDevices.slice(0, 3).map((device, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.2 + index * 0.05 }}
                  className="flex items-center justify-between p-3 bg-background/60 border border-border/30 rounded-lg hover:bg-background/80 transition-all duration-200 cursor-pointer hover:border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-green-500/20 rounded flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{device.name}</div>
                      <div className="text-xs text-muted-foreground/80">{device.host} • {device.type}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 px-2 hover:bg-background/50 text-xs">
                    连接
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 搜索设备 */}
          <div>
            <Input
              placeholder={t('init.sourceType.network.searchPlaceholder')}
              className="bg-background/60 border-border/40 focus:border-border/60 text-sm"
            />
          </div>
        </div>
      </motion.div>

      </div>
  )
}