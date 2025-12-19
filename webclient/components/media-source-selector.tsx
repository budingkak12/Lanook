'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  validateMediaSource,
  createMediaSourceOrMerge,
  getCommonFolders,
  listFolderContents,
  browseNasFolders,
  discoverNasShares,
  getMediaSources,
  deleteMediaSource,
  type CommonFolderEntry,
  type FolderItem,
  type MediaSource,
  type NasFolderItem,
  type NasShareInfo,
  type NasFileItem,
  type CreateSourceRequest,
} from '@/lib/api'
import {
  SearchStandaloneButton,
  SearchCapsuleInput,
  SearchCapsuleButton,
  searchCapsuleWrapperClass,
} from "@/components/search/search-capsule"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"
import { SettingsSecondaryCard } from "@/components/settings/list-ui"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'

interface ParsedSmbPath {
  host: string
  share: string
  subPath: string
}

const SMB_SCHEME = 'smb:'

function parseSmbUrl(value: string): ParsedSmbPath | null {
  try {
    const url = new URL(value)
    if (url.protocol !== SMB_SCHEME) return null
    const host = url.hostname
    const rawPath = url.pathname.replace(/^\/+/, '')
    if (!host || !rawPath) return null
    const segments = rawPath.split('/')
    const share = segments.shift() ?? ''
    if (!share) return null
    const subPath = segments.join('/')
    return { host, share, subPath }
  } catch {
    return null
  }
}

function buildNasDisplayName(share: string, subPath: string): string {
  if (!subPath) return `NAS-${share}`
  const parts = subPath.split('/').filter(Boolean)
  const last = parts[parts.length - 1] || subPath
  return `NAS-${share}/${last}`
}

function buildSmbPath(host: string, share: string, subPath: string): string {
  const normalized = subPath ? subPath.replace(/^\/+/, '') : ''
  const base = `smb://${host}/${share}`
  return normalized ? `${base}/${normalized}` : base
}

interface MediaSourceSelectorProps {
  mode?: 'init' | 'settings'  // 使用模式
  onSuccess?: (source: MediaSource) => void  // 成功回调
}

export function MediaSourceSelector({ mode = 'init', onSuccess }: MediaSourceSelectorProps = {}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  // 本机面板的独立输入状态（与 NAS 独立）
  const [localInputPath, setLocalInputPath] = useState('')
  // 验证状态拆分：本机与 NAS 独立，避免互相联动
  const [isValidatingLocal, setIsValidatingLocal] = useState(false)
  const [isValidatingNas, setIsValidatingNas] = useState(false)
  const [currentFolderPath, setCurrentFolderPath] = useState('')
  const [folderContents, setFolderContents] = useState<FolderItem[]>([])
  const [isBrowsingFolder, setIsBrowsingFolder] = useState(false)
  const [commonFolders, setCommonFolders] = useState<CommonFolderEntry[]>([])
  const [isLoadingFolders, setIsLoadingFolders] = useState(false)
  const [isLoadingContents, setIsLoadingContents] = useState(false)
  const [browsingPath, setBrowsingPath] = useState('') // 新增：当前浏览的路径，不显示在地址栏

  // NAS连接状态管理
  const [nasHost, setNasHost] = useState('smb://172.29.45.60')
  const [nasUsername, setNasUsername] = useState('wang')
  const [nasPassword, setNasPassword] = useState('0000')
  const [isConnectingNas, setIsConnectingNas] = useState(false)
  const [nasShares, setNasShares] = useState<NasShareInfo[]>([])
  const [selectedNasShare, setSelectedNasShare] = useState('')
  const [connectedNasPath, setConnectedNasPath] = useState('')
  const [currentNasSubPath, setCurrentNasSubPath] = useState('')
  const [isBrowsingNas, setIsBrowsingNas] = useState(false)
  const [isLoadingNasContents, setIsLoadingNasContents] = useState(false)
  const [nasFolderContents, setNasFolderContents] = useState<NasFolderItem[]>([])
  const [nasFileContents, setNasFileContents] = useState<NasFileItem[]>([])

  // 合并对话框（替代 window.confirm）
  const [mergePrompt, setMergePrompt] = useState<{
    parentPath: string
    children: string[]
    retryPayload: CreateSourceRequest
  } | null>(null)

  const isNasAnonymous = nasUsername.trim() === '' && nasPassword.trim() === ''
  const currentNasPath = connectedNasPath ? (currentNasSubPath ? `${connectedNasPath}/${currentNasSubPath}` : connectedNasPath) : ''

  const resetNasState = () => {
    setNasShares([])
    setSelectedNasShare('')
    setConnectedNasPath('')
    setCurrentNasSubPath('')
    setNasFolderContents([])
    setNasFileContents([])
    setIsBrowsingNas(false)
  }

  const buildNasAuthPayload = () => ({
    host: nasHost.trim(),
    anonymous: isNasAnonymous,
    username: isNasAnonymous ? undefined : nasUsername.trim(),
    password: isNasAnonymous ? undefined : nasPassword
  })

  // 已移除设备列表与搜索入口：不再维护本地模拟设备清单

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
    const trimmedPath = path.trim()
    if (!trimmedPath) return

    try {
      setIsValidatingLocal(true)
      const isSmbPath = trimmedPath.toLowerCase().startsWith('smb://')

      if (isSmbPath) {
        const parsed = parseSmbUrl(trimmedPath)
        if (!parsed) {
          toast({ title: "添加失败", description: "SMB 路径格式不正确" })
          return
        }

        const validation = await validateMediaSource({
          type: 'smb',
          host: parsed.host,
          share: parsed.share,
          subPath: parsed.subPath || undefined,
          anonymous: isNasAnonymous,
          username: isNasAnonymous ? undefined : nasUsername.trim(),
          password: isNasAnonymous ? undefined : nasPassword
        })

        if (validation.ok && validation.readable) {
          const result = await createMediaSourceOrMerge({
            type: 'smb',
            rootPath: validation.absPath,
            displayName: buildNasDisplayName(parsed.share, parsed.subPath),
            host: parsed.host,
            share: parsed.share,
            subPath: parsed.subPath || undefined,
            anonymous: isNasAnonymous,
            username: isNasAnonymous ? undefined : nasUsername.trim(),
            password: isNasAnonymous ? undefined : nasPassword,
            // 统一策略：初始化仅加入清单；设置页创建即扫描
            scan: mode !== 'init'
          })
          if (!result.ok) {
            if (result.conflict === 'overlap_parent') {
              toast({ title: '路径冲突', description: `已存在父路径：${result.parent}，无需重复添加子目录。` })
              return
            }
            if (result.conflict === 'overlap_children') {
              setMergePrompt({
                parentPath: validation.absPath,
                children: result.children,
                retryPayload: {
                  type: 'smb', rootPath: validation.absPath, displayName: buildNasDisplayName(parsed.share, parsed.subPath),
                  host: parsed.host, share: parsed.share, subPath: parsed.subPath || undefined,
                  anonymous: isNasAnonymous, username: isNasAnonymous ? undefined : nasUsername.trim(), password: isNasAnonymous ? undefined : nasPassword,
                  scan: mode !== 'init'
                }
              })
              return
            }
          } else {
            const { source, existed, message } = result
            onSuccess?.(source)
            if (mode !== 'settings') {
              toast({ title: existed ? '路径已存在' : '添加成功', description: existed ? (message || `${source.displayName || source.rootPath}`) : `成功添加NAS媒体来源: ${source.displayName} (扫描到 ${validation.estimatedCount} 个文件)` })
            }
            setLocalInputPath('')
          }
        } else {
          toast({
            title: "添加失败",
            description: `NAS 路径验证失败: ${validation.note}`
          })
        }
      } else {
        const validation = await validateMediaSource({
          type: 'local',
          path: trimmedPath
        })

        if (validation.ok && validation.readable) {
          const result = await createMediaSourceOrMerge({
            type: 'local',
            rootPath: validation.absPath,
            displayName: trimmedPath.split('/').pop() || trimmedPath,
            // 统一策略：初始化仅加入清单；设置页创建即扫描
            scan: mode !== 'init'
          })
          if (!result.ok) {
            if (result.conflict === 'overlap_parent') {
              toast({ title: '路径冲突', description: `已存在父路径：${result.parent}，无需重复添加子目录。` })
              return
            }
            if (result.conflict === 'overlap_children') {
              setMergePrompt({
                parentPath: validation.absPath,
                children: result.children,
                retryPayload: { type: 'local', rootPath: validation.absPath, displayName: trimmedPath.split('/').pop() || trimmedPath, scan: mode !== 'init' }
              })
              return
            }
          } else {
            const { source, existed, message } = result
            onSuccess?.(source)
            if (mode !== 'settings') {
              toast({ title: existed ? '路径已存在' : '添加成功', description: existed ? (message || `${source.displayName || source.rootPath}`) : `成功添加媒体来源: ${source.displayName} (发现 ${validation.estimatedCount} 个文件)` })
            }
            setLocalInputPath('')
          }
        } else {
          toast({
            title: "添加失败",
            description: `路径验证失败: ${validation.note}`
          })
        }
      }
    } catch (error) {
      console.error('添加媒体来源失败:', error)
      toast({
        title: "添加失败",
        description: `添加失败: ${error instanceof Error ? error.message : '未知错误'}`
      })
    } finally {
      setIsValidatingLocal(false)
    }
  }

  const handleCommonPathClick = async (path: string) => {
    // 点击文件夹项是进入文件夹，在当前视图显示内容
    try {
      setIsLoadingContents(true)
      setCurrentFolderPath(path)
      setBrowsingPath(path) // 设置浏览路径，不填充到地址栏
      setLocalInputPath(path) // 同步填充到输入框
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
        setBrowsingPath(folder.path) // 设置浏览路径，不填充到地址栏
        setLocalInputPath(folder.path) // 同步填充到输入框
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
          setBrowsingPath(parentPath) // 设置浏览路径
          setLocalInputPath(parentPath) // 同步到下方输入框

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
        setBrowsingPath('') // 清空浏览路径
        setLocalInputPath('') // 输入框也清空
      }
    }
  }

  // NAS连接处理函数
  const handleNasConnect = async (hostOverride?: string) => {
    const base = (typeof hostOverride === 'string' ? hostOverride : nasHost) as string
    const targetHost = (base || '').trim()
    if (!targetHost) {
      toast({ title: "连接失败", description: "请输入 NAS 主机地址" })
      return
    }

    try {
      setIsConnectingNas(true)
      resetNasState()

      // 临时使用传入 host 覆盖到 payload
      const payload = { ...buildNasAuthPayload(), host: targetHost }
      const result = await discoverNasShares(payload)
      if (result.success) {
        setNasShares(result.shares)
        setNasHost(targetHost)
        if (result.shares.length === 0) {
          toast({ title: "未发现共享", description: "NAS 未返回任何共享，请确认该地址是否正确" })
        } else {
          toast({
            title: "已获取共享",
            description: `找到 ${result.shares.length} 个共享，请选择其一继续浏览`
          })
        }
      } else {
        toast({ title: "连接失败", description: result.error || 'NAS 探测失败' })
      }
    } catch (error) {
      console.error('NAS连接失败:', error)
      toast({
        title: "连接失败",
        description: `NAS连接失败: ${error instanceof Error ? error.message : '未知错误'}`
      })
    } finally {
      setIsConnectingNas(false)
    }
  }

  const handleSelectNasShare = async (shareName: string) => {
    if (!nasHost.trim()) {
      toast({ title: "连接失败", description: "请先输入 NAS IP 或主机名" })
      return
    }

    try {
      setIsLoadingNasContents(true)
      const validation = await validateMediaSource({
        type: 'smb',
        host: nasHost.trim(),
        share: shareName,
        anonymous: isNasAnonymous,
        username: isNasAnonymous ? undefined : nasUsername.trim(),
        password: isNasAnonymous ? undefined : nasPassword
      })

      if (validation.ok && validation.readable) {
        setSelectedNasShare(shareName)
        setConnectedNasPath(validation.absPath)
        setCurrentNasSubPath('')
        setIsBrowsingNas(true)

        toast({
          title: "共享已验证",
          description: `成功连接 ${shareName}，发现 ${validation.estimatedCount} 个媒体文件`
        })

        await loadNasFolderContents('', shareName)
      } else {
        toast({ title: "共享不可用", description: validation.note })
      }
    } catch (error) {
      console.error('NAS共享验证失败:', error)
      toast({
        title: "共享验证失败",
        description: `无法访问共享: ${error instanceof Error ? error.message : '未知错误'}`
      })
    } finally {
      setIsLoadingNasContents(false)
    }
  }

  // 加载NAS文件夹内容
  const loadNasFolderContents = async (subPath: string, shareOverride?: string) => {
    // 统一路径分隔符，去掉开头的斜杠，避免后端收到 "/photos" 导致二级目录报错
    const normalizedSubPath = (subPath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
    const targetShare = shareOverride || selectedNasShare
    if (!nasHost.trim() || !targetShare) return

    try {
      setIsLoadingNasContents(true)
      const response = await browseNasFolders({
        host: nasHost.trim(),
        share: targetShare,
        path: normalizedSubPath || undefined,
        anonymous: isNasAnonymous,
        username: isNasAnonymous ? undefined : nasUsername.trim(),
        password: isNasAnonymous ? undefined : nasPassword
      })

      if (response.success) {
        setNasFolderContents(response.folders || [])
        setNasFileContents(response.files || [])
        setCurrentNasSubPath(normalizedSubPath)
        setIsBrowsingNas(true)
      } else {
        toast({ title: "浏览失败", description: response.error || '无法浏览 NAS 目录' })
      }
    } catch (error) {
      console.error('加载NAS文件夹内容失败:', error)
      toast({ title: "浏览失败", description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setIsLoadingNasContents(false)
    }
  }

  // NAS文件夹导航
  const handleNasFolderNavigate = async (folder: NasFolderItem) => {
    const next = (folder.path || '').replace(/\\/g, '/').replace(/^\/+/, '')
    await loadNasFolderContents(next)
  }

  // NAS返回上级
  const handleNasBackToParent = async () => {
    if (!currentNasSubPath) {
      setIsBrowsingNas(false)
      setNasFolderContents([])
      setNasFileContents([])
      return
    }
    const parentParts = (currentNasSubPath || '').split('/').filter(Boolean)
    parentParts.pop()
    await loadNasFolderContents(parentParts.join('/'))
  }

  // 直接在 NAS 面板完成"添加至媒体路径清单"
  const handleAddCurrentNasFolder = async () => {
    if (!nasHost.trim() || !selectedNasShare) {
      toast({ title: "请选择共享", description: "请先连接 NAS 并选择可用共享" })
      return
    }
    try {
      setIsValidatingNas(true)
      const validation = await validateMediaSource({
        type: 'smb',
        host: nasHost.trim(),
        share: selectedNasShare,
        subPath: currentNasSubPath || undefined,
        anonymous: isNasAnonymous,
        username: isNasAnonymous ? undefined : nasUsername.trim(),
        password: isNasAnonymous ? undefined : nasPassword
      })

      if (validation.ok && validation.readable) {
        const result = await createMediaSourceOrMerge({
          type: 'smb',
          rootPath: validation.absPath,
          displayName: buildNasDisplayName(selectedNasShare, currentNasSubPath),
          host: nasHost.trim(),
          share: selectedNasShare,
          subPath: currentNasSubPath || undefined,
          anonymous: isNasAnonymous,
          username: isNasAnonymous ? undefined : nasUsername.trim(),
          password: isNasAnonymous ? undefined : nasPassword,
          // 统一策略：初始化仅加入清单；设置页创建即扫描
          scan: mode !== 'init'
        })
        if (!result.ok) {
          if (result.conflict === 'overlap_parent') {
            toast({ title: '路径冲突', description: `已存在父路径：${result.parent}，无需重复添加子目录。` })
            return
          }
          if (result.conflict === 'overlap_children') {
            setMergePrompt({
              parentPath: validation.absPath,
              children: result.children,
              retryPayload: {
                type: 'smb', rootPath: validation.absPath, displayName: buildNasDisplayName(selectedNasShare, currentNasSubPath),
                host: nasHost.trim(), share: selectedNasShare, subPath: currentNasSubPath || undefined,
                anonymous: isNasAnonymous, username: isNasAnonymous ? undefined : nasUsername.trim(), password: isNasAnonymous ? undefined : nasPassword,
                scan: mode !== 'init'
              }
            })
            return
          }
        } else {
          const { source, existed, message } = result
          onSuccess?.(source)
          if (mode !== 'settings') {
            toast({ title: existed ? '路径已存在' : '添加成功', description: existed ? (message || `${source.displayName || source.rootPath}`) : `成功添加NAS媒体来源: ${source.displayName}` })
          }
        }
      } else {
        toast({ title: "添加失败", description: validation.note || 'NAS 路径验证失败' })
      }
    } catch (error) {
      console.error('NAS 直接添加失败:', error)
      toast({ title: "添加失败", description: error instanceof Error ? error.message : '未知错误' })
    } finally {
      setIsValidatingNas(false)
    }
  }

  // 注意：NAS 模块不再改变本机输入框（selectedPath），两侧状态完全独立

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
    <div className="space-y-3 w-full">

      {/* 本机文件夹框架 */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        style={{ height: '600px' }}
      >
        <SettingsSecondaryCard className={`h-full flex flex-col w-full p-4 space-y-2 ${mode === "init" ? "mt-0" : ""}`}>
          {/* 本机文件夹板块标题 */}
          <h3 className="text-lg font-medium text-foreground mb-3">
            选择媒体路径
          </h3>

          {/* 文件夹浏览区域 */}
          <div className="space-y-1 flex-1 flex flex-col min-h-0">
            {/* 头部：返回按钮 + 当前路径 */}
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <SearchStandaloneButton
                  onClick={isBrowsingFolder ? handleBackToCommon : undefined}
                  disabled={!isBrowsingFolder}
                  icon={undefined}
                  size="compact"
                  wrapperClassName="w-8"
                  className="justify-center"
                >
                  ←
                </SearchStandaloneButton>
                {isBrowsingFolder && (
                  <div className="text-xs text-muted-foreground/80 truncate max-w-[300px]" title={currentFolderPath}>
                    {formatPath(currentFolderPath)}
                  </div>
                )}
              </div>
            </div>

            {/* 文件夹列表，使用统一的 SelectableListCard 风格 */}
            <div className="overflow-y-auto flex-1 min-h-0 justify-start">
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
                  <SelectableListCard className="shadow-none border-0 rounded-none">
                    {folderContents.map((folder, index) => (
                      <motion.div
                        key={folder.path + index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.02 }}
                      >
                        <SelectableListItem
                          selected={false}
                          onSelect={() => handleFolderNavigate(folder)}
                          showCheck={false}
                          className="py-2"
                          right={
                            <svg
                              className="w-4 h-4 text-[rgb(160_163_164)]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          }
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 bg-primary/20 rounded flex items-center justify-center">
                              <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="text-sm font-medium text-foreground truncate">{folder.name}</div>
                              <div className="text-xs text-muted-foreground/80 truncate" title={folder.path}>
                                {formatPath(folder.path)}
                              </div>
                            </div>
                          </div>
                        </SelectableListItem>
                      </motion.div>
                    ))}
                  </SelectableListCard>
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
                  <SelectableListCard className="shadow-none border-0 rounded-none">
                    {commonFolders
                      .filter(folder => folder.readable && !folder.is_root && !folder.is_symlink)
                      .slice(0, 6)
                      .map((folder, index) => (
                        <motion.div
                          key={folder.path + index}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: index * 0.02 }}
                        >
                          <SelectableListItem
                            selected={false}
                            onSelect={() => handleCommonPathClick(folder.path)}
                            showCheck={false}
                            className="py-2"
                            right={
                              <svg
                                className="w-4 h-4 text-[rgb(160_163_164)]"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            }
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 bg-primary/20 rounded flex items-center justify-center">
                                <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                </svg>
                              </div>
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <div className="text-sm font-medium text-foreground truncate">{folder.name}</div>
                                <div className="text-xs text-muted-foreground/80 truncate" title={folder.path}>
                                  {formatPath(folder.path)}
                                </div>
                              </div>
                            </div>
                          </SelectableListItem>
                        </motion.div>
                      ))}
                  </SelectableListCard>
                )
              )}
            </div>

          </div>

          {/* 自定义路径 */}
          <div className="space-y-3 pt-3 border-t border-border/20">
            <p className="text-xs text-muted-foreground/70">
              从上方选择文件夹，或直接输入完整路径
            </p>
            <div className={searchCapsuleWrapperClass}>
              <SearchCapsuleInput
                value={localInputPath}
                onChange={(e) => setLocalInputPath(e.target.value)}
                placeholder={t("init.sourceType.local.pathPlaceholder")}
                className="text-sm"
                disabled={isValidatingLocal}
              />
              {!!localInputPath && (
                <button
                  type="button"
                  onClick={() => setLocalInputPath("")}
                  className="flex h-11 px-3 items-center justify-center text-muted-foreground hover:bg-muted/40 transition-colors"
                  disabled={isValidatingLocal}
                >
                  ×
                </button>
              )}
              <SearchCapsuleButton
                onClick={() => localInputPath && handleSelectPath(localInputPath)}
                disabled={!localInputPath || isValidatingLocal}
                icon={<span className="text-base leading-none">✓</span>}
              />
            </div>
          </div>
        </SettingsSecondaryCard>
      </motion.div>

      {/* 局域网设备框架 */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="flex-shrink-0"
        style={{ height: '600px' }}
      >
        {/* 使用统一的大盒子组件包裹 NAS 面板，使其与本机文件夹成为两个独立的大盒子 */}
        <SettingsSecondaryCard className="w-full h-full p-4 space-y-4 flex flex-col">
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
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={nasHost}
                  onChange={(e) => setNasHost(e.target.value)}
                  placeholder="IP 或主机名 (如 192.168.1.10 或 nas.local)"
                  className="flex-1 bg-background/60 border-border/40 focus:border-border/60 text-sm"
                  disabled={isConnectingNas}
                />
                <Input
                  value={nasUsername}
                  onChange={(e) => setNasUsername(e.target.value)}
                  placeholder="用户名 (留空=匿名)"
                  className="flex-1 bg-background/60 border-border/40 focus:border-border/60 text-sm"
                  disabled={isConnectingNas}
                />
                <Input
                  type="password"
                  value={nasPassword}
                  onChange={(e) => setNasPassword(e.target.value)}
                  placeholder="密码 (留空=匿名)"
                  className="flex-1 bg-background/60 border-border/40 focus:border-border/60 text-sm"
                  disabled={isConnectingNas}
                />
                <Button
                  variant="outline"
                  className="shrink-0 bg-background/40 border-border/40 hover:bg-background/60 text-sm px-3 w-full sm:w-auto"
                  onClick={() => handleNasConnect()}
                  disabled={isConnectingNas || !nasHost.trim()}
                >
                  {isConnectingNas ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 animate-spin border border-current border-t-transparent rounded-full" />
                      连接中...
                    </div>
                  ) : (
                    '连接'
                  )}
                </Button>
              </div>

              {/* 匿名访问：通过留空用户名/密码实现，无需额外勾选 */}
            </div>
          </div>

          {/* NAS共享列表（顶部也显示连接信息；列表项样式与本机一致） */}
          {nasShares.length > 0 && !isBrowsingNas && (
            <div className="space-y-4 pt-3 border-t border-border/20 flex-1 min-h-0 flex flex-col">
              {/* 连接信息（固定占位） */}
              <div className="space-y-2 flex-shrink-0 min-h-[64px]">
                <div className="text-xs text-muted-foreground/70">已连接: {nasHost}</div>
                <div className="text-xs text-muted-foreground/80 truncate" title={`smb://${nasHost}/`}>
                  当前路径: {`smb://${nasHost}/`}
                </div>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-accent/20 flex-shrink-0"
                    disabled
                    aria-label="返回上级"
                  >
                    ←
                  </Button>
                </div>
              </div>

              {/* 共享列表（固定滚动区域） */}
              <div className="overflow-y-auto flex-1 min-h-0 space-y-2 justify-start">
                {nasShares.map((share, idx) => (
                  <motion.div
                    key={share.name + idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.02 }}
                    className="flex items-center justify-between p-2 h-12 w-full bg-background/60 border border-border/30 rounded-lg hover:bg-accent/40 hover:border-border/50 transition-all duration-200 cursor-pointer group"
                    onClick={() => handleSelectNasShare(share.name)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-primary/20 rounded flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      </div>
                      <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{share.name}</div>
                    </div>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* NAS文件夹浏览 */}
          {isBrowsingNas && (
            <div className="space-y-4 pt-3 border-t border-border/20 flex-1 min-h-0 flex flex-col">
              {/* 去掉标题与绿色提示点，保持与本机面板一致的简洁头部 */}

              {/* 连接信息和当前路径（固定占位，避免布局抖动） */}
              <div className="space-y-2 flex-shrink-0 min-h-[64px]">
                <div className="text-xs text-muted-foreground/70">已连接: {nasHost}/{selectedNasShare}</div>
                <div className="text-xs text-muted-foreground/80 truncate" title={currentNasPath}>
                  当前路径: {formatPath(currentNasPath)}
                </div>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNasBackToParent}
                    className="h-8 w-8 p-0 hover:bg-accent/20 flex-shrink-0"
                    aria-label="返回上级"
                  >
                    ←
                  </Button>
                </div>
              </div>

              {/* 文件夹列表（样式与本机保持一致，固定滚动区域） */}
              <div className="overflow-y-auto flex-1 min-h-0 space-y-2 justify-start">
                {isLoadingNasContents ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">加载中...</div>
                ) : (
                  <>
                    {nasFolderContents.map((folder, index) => (
                      <motion.div
                        key={folder.name + index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.02 }}
                        className="flex items-center justify-between p-2 h-12 w-full bg-background/60 border border-border/30 rounded-lg hover:bg-accent/40 hover:border-border/50 transition-all duration-200 cursor-pointer group"
                        onClick={() => handleNasFolderNavigate(folder)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-primary/20 rounded flex items-center justify-center">
                            <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                          </div>
                          <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{folder.name}</div>
                        </div>
                        <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </motion.div>
                    ))}
                    {nasFileContents.length > 0 && (
                      <div className="text-xs text-muted-foreground/80 pt-2">此目录包含 {nasFileContents.length} 个媒体文件</div>
                    )}
                  </>
                )}
              </div>

              {/* 添加按钮（文案统一为 添加至媒体路径清单），使用独立按钮组件 */}
              <SearchStandaloneButton
                onClick={handleAddCurrentNasFolder}
                disabled={isValidatingNas || !currentNasPath}
                icon={undefined}
                wrapperClassName="w-full"
              >
                {isValidatingNas ? "验证中..." : "添加至媒体路径清单"}
              </SearchStandaloneButton>
            </div>
          )}

          {/* 设备列表与搜索入口已移除 */}
        </SettingsSecondaryCard>
      </motion.div>

      {/* 合并对话框（使用项目内置 AlertDialog 组件） */}
      <AlertDialog open={!!mergePrompt} onOpenChange={(open) => { if (!open) setMergePrompt(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>发现已存在子路径</AlertDialogTitle>
            <AlertDialogDescription>
              将仅保留父路径，并移除以下子路径后再添加：
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-auto text-sm bg-muted/30 p-2 rounded">
            {mergePrompt?.children.map((c) => (
              <div key={c} className="truncate" title={c}>{c}</div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMergePrompt(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!mergePrompt) return
                try {
                  const sources = await getMediaSources(true)
                  const toDelete = sources.filter(s => mergePrompt.children.includes(s.rootPath))
                  for (const s of toDelete) {
                    await deleteMediaSource(s.id, true)
                  }
                  const retry = await createMediaSourceOrMerge(mergePrompt.retryPayload)
                  if (!retry.ok) {
                    toast({ title: '添加失败', description: '合并后创建失败' }); setMergePrompt(null); return
                  }
                  toast({ title: retry.existed ? '路径已存在' : '添加成功', description: `${retry.source.displayName || retry.source.rootPath}` })
                  onSuccess?.(retry.source)
                } catch (e) {
                  toast({ title: '操作失败', description: e instanceof Error ? e.message : '未知错误' })
                } finally {
                  setMergePrompt(null)
                }
              }}
            >
              确认合并
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
