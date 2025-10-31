'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { FolderBrowser } from '@/components/folder-browser'

export function MediaSourceSelector() {
  const { t } = useTranslation()
  const [isFolderBrowserOpen, setIsFolderBrowserOpen] = useState(false)
  const [selectedPath, setSelectedPath] = useState('')

  // 常用本机路径示例
  const commonPaths = [
    { name: '图片', path: '/Users/you/Pictures' },
    { name: '文档', path: '/Users/you/Documents' },
    { name: '桌面', path: '/Users/you/Desktop' },
    { name: '下载', path: '/Users/you/Downloads' },
    { name: '视频', path: '/Users/you/Movies' },
  ]

  // 模拟局域网设备
  const networkDevices = [
    { name: 'NAS-家庭', host: '192.168.1.10', type: 'NAS' },
    { name: '办公室服务器', host: '192.168.1.20', type: 'Server' },
    { name: 'Backup-NAS', host: '192.168.1.30', type: 'NAS' },
  ]

  const handleFolderSelect = (path: string) => {
    setSelectedPath(path)
  }

  const handleCommonPathClick = (path: string) => {
    setSelectedPath(path)
    // 也可以直接选择，不打开浏览器
  }

  const handleBrowseFolder = () => {
    setIsFolderBrowserOpen(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-8 shadow-lg"
    >
      <h2 className="text-3xl font-normal text-foreground mb-4 text-balance">
        {t('init.step2.title')}
      </h2>

      <p className="text-base text-muted-foreground mb-8 leading-relaxed">
        {t('init.step2.description')}
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
        {/* 本机文件夹板块 */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="bg-background/40 border border-border/40 rounded-xl p-6 h-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-foreground">
                {t('init.sourceType.local.title')}
              </h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {t('init.sourceType.local.description')}
            </p>

            {/* 常用路径 */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-foreground/90">
                {t('init.sourceType.local.commonPaths')}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {commonPaths.slice(0, 4).map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.1 + index * 0.05 }}
                    className="flex items-center justify-between p-3 bg-background/60 border border-border/30 rounded-lg hover:bg-white/20 hover:shadow-lg hover:scale-[1.02] hover:border-white/40 transition-all duration-200 cursor-pointer group"
                    onClick={() => handleCommonPathClick(item.path)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{item.name}</div>
                        <div className="text-xs text-muted-foreground/80 truncate" title={item.path}>{item.path}</div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 px-2 hover:bg-white/30 text-xs group-hover:bg-white/25 group-hover:text-foreground group-hover:shadow-sm">
                      选择
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* 自定义路径 */}
            <div className="space-y-3 mt-6 pt-4 border-t border-border/20">
              <h4 className="text-sm font-medium text-foreground/90">
                {t('init.sourceType.local.customPath')}
              </h4>
              <div className="flex gap-2">
                <Input
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
                  placeholder={t('init.sourceType.local.pathPlaceholder')}
                  className="flex-1 bg-background/60 border-border/40 focus:border-border/60"
                />
                <Button
                  variant="outline"
                  className="shrink-0 bg-background/40 border-border/40 hover:bg-background/60 text-sm px-3"
                  onClick={handleBrowseFolder}
                >
                  浏览文件夹
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 局域网设备板块 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="bg-background/40 border border-border/40 rounded-xl p-6 h-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-foreground">
                {t('init.sourceType.network.title')}
              </h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
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
            <div className="space-y-4 mt-6 pt-4 border-t border-border/20">
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
            <div className="mt-4">
              <Input
                placeholder={t('init.sourceType.network.searchPlaceholder')}
                className="bg-background/60 border-border/40 focus:border-border/60 text-sm"
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* 文件夹浏览器模态框 */}
      <FolderBrowser
        isOpen={isFolderBrowserOpen}
        onClose={() => setIsFolderBrowserOpen(false)}
        onSelect={handleFolderSelect}
        initialPath={selectedPath || '/Users/you'}
      />
    </motion.div>
  )
}