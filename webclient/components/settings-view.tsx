"use client"

import { useState, useEffect } from "react"
import QRCode from "qrcode"
import { Settings, RefreshCw, Smartphone, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { apiFetch } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface ServerInfo {
  local_ip: string
  port: number
  url: string
  display_url: string
  host: string
  scheme: string
}

export function SettingsView() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
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
              title: "生成二维码失败",
              description: "无法生成连接二维码"
            })
          } else {
            setQrCodeUrl(url)
          }
        })
      }
    } catch (error) {
      console.error("获取服务器信息失败:", error)
      toast({
        title: "获取服务器信息失败",
        description: "无法获取服务器连接信息"
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
        title: "已复制",
        description: "连接地址已复制到剪贴板"
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        title: "复制失败",
        description: "无法复制到剪贴板"
      })
    }
  }

  useEffect(() => {
    fetchServerInfo()
  }, [])

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">设置</h1>
          <p className="text-muted-foreground">管理应用配置和连接信息</p>
        </div>

        {/* 连接信息卡片 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                <CardTitle>手机端连接</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchServerInfo}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                刷新
              </Button>
            </div>
            <CardDescription>
              使用手机扫描下方二维码连接到后端服务
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {serverInfo ? (
              <>
                {/* 二维码显示区域 */}
                <div className="flex justify-center">
                  {qrCodeUrl ? (
                    <div className="text-center space-y-2">
                      <img
                        src={qrCodeUrl}
                        alt="连接二维码"
                        className="border rounded-lg shadow-sm"
                      />
                      <p className="text-sm text-muted-foreground">
                        扫描此二维码连接后端
                      </p>
                    </div>
                  ) : (
                    <div className="w-64 h-64 border rounded-lg flex items-center justify-center bg-muted">
                      <div className="text-center text-muted-foreground">
                        <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">生成二维码中...</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 连接信息详情 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">IP地址</label>
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
                    <label className="text-sm font-medium">端口</label>
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
                  <label className="text-sm font-medium">完整连接地址</label>
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
                    <p>正在获取连接信息...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Settings className="w-8 h-8 mx-auto opacity-50" />
                    <p>无法获取服务器连接信息</p>
                    <Button variant="outline" onClick={fetchServerInfo}>
                      重试
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 使用说明 */}
        <Card>
          <CardHeader>
            <CardTitle>使用说明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                1
              </div>
              <p className="text-sm text-muted-foreground">
                确保手机和电脑在同一个局域网内
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                2
              </div>
              <p className="text-sm text-muted-foreground">
                使用手机扫描上方二维码，或手动输入连接地址
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                3
              </div>
              <p className="text-sm text-muted-foreground">
                在手机端打开链接即可访问后端服务
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
