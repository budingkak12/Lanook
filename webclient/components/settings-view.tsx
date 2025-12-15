"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import {
  Check,
  Copy,
  Globe,
  HardDrive,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Wifi,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import { SettingsGroup, SettingsPageShell, SettingsPanel, SettingsRow, SettingsTitle } from "@/components/settings/list-ui"
import { SettingsFileScan } from "@/components/settings-file-scan"
import { SettingsMediaManagement } from "@/components/settings-media-management"
import { SettingsTasksPanel } from "@/components/settings-tasks-panel"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { apiFetch, getOSInfo } from "@/lib/api"

interface ConnectionInfo {
  ip: string
  port: number
  display_url: string
}

type SettingsSectionKey = "language" | "appearance" | "network" | "storage" | "smart" | "security"

export function SettingsView() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  const [expandedSection, setExpandedSection] = useState<SettingsSectionKey | null>(null)
  const [serverInfo, setServerInfo] = useState<ConnectionInfo | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const toggleSection = (key: SettingsSectionKey) => {
    setExpandedSection((prev) => (prev === key ? null : key))
  }

  const fetchServerInfo = async () => {
    setIsLoading(true)
    try {
      const osinfo = await getOSInfo()
      if (osinfo && Array.isArray(osinfo.lan_ips) && osinfo.lan_ips.length > 0) {
        const ip = osinfo.lan_ips[0]
        const port = osinfo.port
        const data: ConnectionInfo = { ip, port, display_url: `http://${ip}:${port}` }
        setServerInfo(data)

        QRCode.toDataURL(
          data.display_url,
          {
            width: 256,
            margin: 2,
            color: {
              dark: "#000000",
              light: "#FFFFFF",
            },
          },
          (err, url) => {
            if (err) {
              console.error("生成二维码失败:", err)
              toast({
                title: t("toast.qrCode.generateFailed.title"),
                description: t("toast.qrCode.generateFailed.description"),
              })
            } else {
              setQrCodeUrl(url)
            }
          },
        )
      }
    } catch (error) {
      console.error("获取服务器信息失败:", error)
      toast({
        title: t("toast.serverInfo.fetchFailed.title"),
        description: t("toast.serverInfo.fetchFailed.description"),
      })
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast({
        title: t("toast.clipboard.copied.title"),
        description: t("toast.clipboard.copied.description"),
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({
        title: t("toast.clipboard.copyFailed.title"),
        description: t("toast.clipboard.copyFailed.description"),
      })
    }
  }

  const resetInitialization = async () => {
    setIsResetting(true)
    try {
      const response = await apiFetch("/settings/db-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirm: true,
          drop_existing: true,
        }),
      })

      if (response.ok) {
        toast({
          title: "重置成功",
          description: "数据库已删除并重建，即将重新进入初始化页面",
        })
        setTimeout(() => {
          window.location.href = window.location.origin + "?forceInit=true"
        }, 2000)
      } else {
        const errorData = await response.json()
        toast({
          title: "重置失败",
          description: errorData.detail || "无法重置初始化状态",
        })
      }
    } catch (error) {
      console.error("重置初始化状态失败:", error)
      toast({
        title: "重置失败",
        description: "网络错误，请稍后重试",
      })
    } finally {
      setIsResetting(false)
    }
  }

  useEffect(() => {
    if (expandedSection === "network" && !serverInfo) {
      fetchServerInfo()
    }
  }, [expandedSection, serverInfo])

  return (
    <div className="h-full w-full overflow-y-auto">
      <SettingsPageShell>
        <SettingsTitle>设置</SettingsTitle>

        <div className="space-y-3 sm:space-y-4">
          <SettingsGroup>
            <SettingsRow
              icon={<Globe className="w-5 h-5" />}
              title={t("settings.language.title")}
              description={t("settings.language.current")}
              expanded={expandedSection === "language"}
              onClick={() => toggleSection("language")}
              showChevron={false}
            />
            {expandedSection === "language" ? (
              <SettingsPanel>
                <div className="space-y-2">
                  <Button
                    variant={i18n.language === "zh-CN" ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => i18n.changeLanguage("zh-CN")}
                  >
                    {t("settings.language.chinese")}
                  </Button>
                  <Button
                    variant={i18n.language === "en-US" ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => i18n.changeLanguage("en-US")}
                  >
                    {t("settings.language.english")}
                  </Button>
                </div>
              </SettingsPanel>
            ) : null}

            <SettingsRow
              icon={<Palette className="w-5 h-5" />}
              title={t("settings.appearance.title")}
              description={t("settings.appearance.description")}
              expanded={expandedSection === "appearance"}
              onClick={() => toggleSection("appearance")}
              showChevron={false}
            />
            {expandedSection === "appearance" ? (
              <SettingsPanel>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      className="h-auto p-3 justify-start"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="w-4 h-4 mr-2" />
                      <div className="text-left">
                        <p className="text-sm font-medium">明亮模式</p>
                        <p className="text-xs opacity-70">适合白天使用</p>
                      </div>
                    </Button>

                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      className="h-auto p-3 justify-start"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="w-4 h-4 mr-2" />
                      <div className="text-left">
                        <p className="text-sm font-medium">黑暗模式</p>
                        <p className="text-xs opacity-70">适合夜间使用</p>
                      </div>
                    </Button>

                    <Button
                      variant={theme === "system" ? "default" : "outline"}
                      className="h-auto p-3 justify-start"
                      onClick={() => setTheme("system")}
                    >
                      <Monitor className="w-4 h-4 mr-2" />
                      <div className="text-left">
                        <p className="text-sm font-medium">跟随系统</p>
                        <p className="text-xs opacity-70">自动适配系统</p>
                      </div>
                    </Button>
                  </div>

                  <div className="text-xs bg-[rgb(240_242_244)] text-[rgb(74_77_78)] p-2 rounded">
                    当前：<span className="font-medium">{theme === "light" ? "明亮" : theme === "dark" ? "黑暗" : "跟随系统"}</span>
                    {theme === "system" && typeof window !== "undefined" ? (
                      <span className="ml-1">
                        (系统{window.matchMedia("(prefers-color-scheme: dark)").matches ? "黑暗" : "明亮"})
                      </span>
                    ) : null}
                  </div>
                </div>
              </SettingsPanel>
            ) : null}
          </SettingsGroup>

          <SettingsGroup>
            <SettingsRow
              icon={<Wifi className="w-5 h-5" />}
              title={t("settings.network.title")}
              description={t("settings.network.description")}
              expanded={expandedSection === "network"}
              onClick={() => toggleSection("network")}
              showChevron={false}
              right={
                expandedSection === "network" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      fetchServerInfo()
                    }}
                    disabled={isLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    {t("settings.network.refresh")}
                  </Button>
                ) : null
              }
            />
            {expandedSection === "network" ? (
              <SettingsPanel>
                <div className="space-y-4">
                  {serverInfo ? (
                    <>
                      <div className="flex justify-center">
                        {qrCodeUrl ? (
                          <div className="text-center space-y-2">
                            <img
                              src={qrCodeUrl}
                              alt={t("settings.network.qrCode.alt")}
                              className="border border-[rgb(228_231_234)] rounded-lg shadow-sm"
                            />
                            <p className="text-sm text-[rgb(120_123_124)]">{t("settings.network.qrCode.description")}</p>
                          </div>
                        ) : (
                          <div className="w-64 h-64 border border-[rgb(228_231_234)] rounded-lg flex items-center justify-center bg-[rgb(240_242_244)]">
                            <div className="text-center text-[rgb(120_123_124)]">
                              <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">{t("settings.network.qrCode.scanning")}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("settings.network.connection.ip")}</label>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 px-3 py-2 bg-[rgb(240_242_244)] rounded text-sm">{serverInfo.ip}</code>
                            <Button variant="outline" size="sm" onClick={() => copyToClipboard(serverInfo.ip)}>
                              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t("settings.network.connection.port")}</label>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 px-3 py-2 bg-[rgb(240_242_244)] rounded text-sm">{serverInfo.port}</code>
                            <Button variant="outline" size="sm" onClick={() => copyToClipboard(serverInfo.port.toString())}>
                              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t("settings.network.connection.fullAddress")}</label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-[rgb(240_242_244)] rounded text-sm break-all">
                            {serverInfo.display_url}
                          </code>
                          <Button variant="outline" size="sm" onClick={() => copyToClipboard(serverInfo.display_url)}>
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>

                      <div className="border border-[rgb(228_231_234)] rounded-lg p-3 bg-[rgb(240_242_244)]">
                        <h4 className="font-medium mb-2 flex items-center gap-2 text-sm">
                          <Settings className="w-4 h-4" />
                          {t("settings.network.usage.title")}
                        </h4>
                        <div className="space-y-2 text-sm text-[rgb(74_77_78)]">
                          <p className="flex items-start gap-2">
                            <span className="font-medium">1.</span>
                            {t("settings.network.usage.step1")}
                          </p>
                          <p className="flex items-start gap-2">
                            <span className="font-medium">2.</span>
                            {t("settings.network.usage.step2")}
                          </p>
                          <p className="flex items-start gap-2">
                            <span className="font-medium">3.</span>
                            {t("settings.network.usage.step3")}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6 text-[rgb(120_123_124)]">
                      <Wifi className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-xs">{t("settings.network.loading")}</p>
                    </div>
                  )}
                </div>
              </SettingsPanel>
            ) : null}
          </SettingsGroup>

          <SettingsGroup>
            <SettingsRow
              icon={<HardDrive className="w-5 h-5" />}
              title="存储与任务"
              description="管理媒体库设置、路径配置与后台任务进度"
              expanded={expandedSection === "storage"}
              onClick={() => toggleSection("storage")}
              showChevron={false}
            />
            {expandedSection === "storage" ? (
              <SettingsPanel>
                <div className="space-y-6">
                  <SettingsFileScan />

                  <div className="border-t border-[rgb(228_231_234)] pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Settings className="w-4 h-4" />
                      <h4 className="text-sm font-medium">任务与进度</h4>
                    </div>
                    <SettingsTasksPanel />
                  </div>

                  <div className="border-t border-[rgb(228_231_234)] pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <HardDrive className="w-4 h-4" />
                      <h4 className="text-sm font-medium">媒体路径管理</h4>
                    </div>
                    <SettingsMediaManagement />
                  </div>

                  <div className="border-t border-[rgb(228_231_234)] pt-4">
                    <div className="border border-[rgb(228_231_234)] rounded-lg p-3 sm:p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <h4 className="font-medium flex items-center gap-2 text-sm">
                            <RotateCcw className="w-4 h-4" />
                            重置媒体库
                          </h4>
                          <p className="text-xs text-[rgb(120_123_124)]">清除当前媒体库设置，重新选择媒体文件夹</p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={resetInitialization}
                          disabled={isResetting}
                          className="w-full sm:w-auto"
                        >
                          {isResetting ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              重置中...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-4 h-4 mr-2" />
                              重置
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="text-xs text-[rgb(120_123_124)] bg-[rgb(240_242_244)] p-2 rounded">
                        <strong>注意：</strong>重置后，软件将回到初始状态。这将清空所有数据库信息（点赞、标签等），但不会删除媒体文件夹内的实际文件。
                      </div>
                    </div>
                  </div>
                </div>
              </SettingsPanel>
            ) : null}

            <SettingsRow
              icon={<Sparkles className="w-5 h-5" />}
              title="智能搜索 (Beta)"
              description="文本搜图 / 图搜图，调用 CLIP/SigLIP 向量检索"
              expanded={expandedSection === "smart"}
              onClick={() => toggleSection("smart")}
              showChevron={false}
              right={
                <Button asChild variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
                  <a href="/smart-search" target="_blank" rel="noreferrer">
                    打开
                  </a>
                </Button>
              }
            />
            {expandedSection === "smart" ? (
              <SettingsPanel>
                <p className="text-sm text-[rgb(120_123_124)]">需要先在后端运行 /clip/rebuild 生成向量索引。</p>
              </SettingsPanel>
            ) : null}

            <SettingsRow
              icon={<Shield className="w-5 h-5" />}
              title={t("settings.security.title")}
              description={t("settings.security.description")}
              expanded={expandedSection === "security"}
              onClick={() => toggleSection("security")}
              showChevron={false}
            />
            {expandedSection === "security" ? (
              <SettingsPanel>
                <div className="text-center py-6 text-[rgb(120_123_124)]">
                  <Shield className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-xs">{t("settings.security.developing")}</p>
                </div>
              </SettingsPanel>
            ) : null}
          </SettingsGroup>
        </div>
      </SettingsPageShell>
    </div>
  )
}

