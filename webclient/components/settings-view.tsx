"use client"

import { useState, useEffect } from "react"
import QRCode from "qrcode"
import { Settings, RefreshCw, Smartphone, Copy, Check, Wifi, HardDrive, Palette, Shield, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { apiFetch } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useTranslation } from "react-i18next"

interface ServerInfo {
  local_ip: string
  port: number
  url: string
  display_url: string
  host: string
  scheme: string
}

export function SettingsView() {
  const { t, i18n } = useTranslation()
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isNetworkExpanded, setIsNetworkExpanded] = useState(false)
  const { toast } = useToast()

  const fetchServerInfo = async () => {
    setIsLoading(true)
    try {
      const response = await apiFetch("/server-info")
      if (response.ok) {
        const data = await response.json()
        setServerInfo(data)

        // 生成二维码
        QRCode.toDataURL(data.display_url, {
          width: 256,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#FFFFFF"
          }
        }, (err, url) => {
          if (err) {
            console.error("生成二维码失败:", err)
            toast({
              title: t("toast.qrCode.generateFailed.title"),
              description: t("toast.qrCode.generateFailed.description")
            })
          } else {
            setQrCodeUrl(url)
          }
        })
      }
    } catch (error) {
      console.error("获取服务器信息失败:", error)
      toast({
        title: t("toast.serverInfo.fetchFailed.title"),
        description: t("toast.serverInfo.fetchFailed.description")
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
        description: t("toast.clipboard.copied.description")
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        title: t("toast.clipboard.copyFailed.title"),
        description: t("toast.clipboard.copyFailed.description")
      })
    }
  }

  useEffect(() => {
    // 只有在展开网络连接时才获取服务器信息
    if (isNetworkExpanded && !serverInfo) {
      fetchServerInfo()
    }
  }, [isNetworkExpanded, serverInfo])

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{t("settings.title")}</h1>
          <p className="text-muted-foreground">{t("settings.description")}</p>
        </div>

        {/* 语言设置 - 放在第一位，默认展开 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              <CardTitle>{t("settings.language.title")}</CardTitle>
            </div>
            <CardDescription>
              {t("settings.language.current")}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* 网络连接设置 */}
        <Card>
          <CardHeader
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsNetworkExpanded(!isNetworkExpanded)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-5 h-5" />
                <CardTitle>{t("settings.network.title")}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {isNetworkExpanded && (
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
                )}
                <div className={`transition-transform duration-200 ${isNetworkExpanded ? 'rotate-180' : ''}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </div>
            </div>
            <CardDescription>
              {t("settings.network.description")}
            </CardDescription>
          </CardHeader>

          {isNetworkExpanded && (
            <CardContent className="space-y-4">
              {serverInfo ? (
                <>
                  {/* 二维码显示区域 */}
                  <div className="flex justify-center">
                    {qrCodeUrl ? (
                      <div className="text-center space-y-2">
                        <img
                          src={qrCodeUrl}
                          alt={t("settings.network.qrCode.alt")}
                          className="border rounded-lg shadow-sm"
                        />
                        <p className="text-sm text-muted-foreground">
                          {t("settings.network.qrCode.description")}
                        </p>
                      </div>
                    ) : (
                      <div className="w-64 h-64 border rounded-lg flex items-center justify-center bg-muted">
                        <div className="text-center text-muted-foreground">
                          <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">{t("settings.network.qrCode.scanning")}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 连接信息详情 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("settings.network.connection.ip")}</label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-muted rounded text-sm">
                          {serverInfo.local_ip}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(serverInfo.local_ip)}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("settings.network.connection.port")}</label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-muted rounded text-sm">
                          {serverInfo.port}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(serverInfo.port.toString())}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("settings.network.connection.fullAddress")}</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-muted rounded text-sm break-all">
                        {serverInfo.display_url}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(serverInfo.display_url)}
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {isLoading ? (
                    <div className="space-y-2">
                      <RefreshCw className="w-8 h-8 mx-auto animate-spin" />
                      <p>{t("settings.network.connection.getting")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Wifi className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-sm">{t("settings.network.connection.clickToExpand")}</p>
                      <p className="text-xs text-muted-foreground">{t("settings.network.connection.viewDetails")}</p>
                    </div>
                  )}
                </div>
              )}

              {/* 使用说明 */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">{t("settings.network.usage.title")}</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      1
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.network.usage.step1")}
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      2
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.network.usage.step2")}
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      3
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.network.usage.step3")}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* 存储设置 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              <CardTitle>{t("settings.storage.title")}</CardTitle>
            </div>
            <CardDescription>
              {t("settings.storage.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <HardDrive className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">{t("settings.storage.developing")}</p>
            </div>
          </CardContent>
        </Card>

        {/* 外观设置 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              <CardTitle>{t("settings.appearance.title")}</CardTitle>
            </div>
            <CardDescription>
              {t("settings.appearance.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Palette className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">{t("settings.appearance.developing")}</p>
            </div>
          </CardContent>
        </Card>

        {/* 安全设置 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <CardTitle>{t("settings.security.title")}</CardTitle>
            </div>
            <CardDescription>
              {t("settings.security.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">{t("settings.security.developing")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}