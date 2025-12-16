"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import { SettingsGroup, SettingsPageShell, SettingsTitle } from "@/components/settings/list-ui"
import {
  AppearanceSection,
  LanguageSection,
  NetworkSection,
  type NetworkInfo,
  SecuritySection,
  StorageSection,
} from "@/components/settings/sections"
import { SettingsFileScan } from "@/components/settings-file-scan"
import { SettingsMediaManagement } from "@/components/settings-media-management"
import { SettingsTasksPanel } from "@/components/settings-tasks-panel"
import { useToast } from "@/hooks/use-toast"
import { apiFetch, getOSInfo } from "@/lib/api"

type SettingsSectionKey = "language" | "appearance" | "network" | "storage" | "security"

export function SettingsView() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  const [expandedSection, setExpandedSection] = useState<SettingsSectionKey | null>(null)
  const [serverInfo, setServerInfo] = useState<NetworkInfo | null>(null)
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
        const data: NetworkInfo = { ip, port, display_url: `http://${ip}:${port}` }
        setServerInfo(data)

        QRCode.toDataURL(
          data.display_url,
          {
            width: 256,
            margin: 2,
            color: { dark: "#000000", light: "#FFFFFF" },
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, drop_existing: true }),
      })

      if (response.ok) {
        toast({ title: "重置成功", description: "数据库已删除并重建，即将重新进入初始化页面" })
        setTimeout(() => {
          window.location.href = window.location.origin + "?forceInit=true"
        }, 2000)
      } else {
        const errorData = await response.json()
        toast({ title: "重置失败", description: errorData.detail || "无法重置初始化状态" })
      }
    } catch (error) {
      console.error("重置初始化状态失败:", error)
      toast({ title: "重置失败", description: "网络错误，请稍后重试" })
    } finally {
      setIsResetting(false)
    }
  }

  useEffect(() => {
    if (expandedSection === "network" && !serverInfo) fetchServerInfo()
  }, [expandedSection, serverInfo])

  return (
    <div className="w-full">
      <SettingsPageShell>
        <SettingsTitle>设置</SettingsTitle>

        <div className="space-y-3 sm:space-y-4">
          <SettingsGroup>
            <LanguageSection open={expandedSection === "language"} onToggle={() => toggleSection("language")} t={t} i18n={i18n} />
            <AppearanceSection
              open={expandedSection === "appearance"}
              onToggle={() => toggleSection("appearance")}
              t={t}
              theme={theme}
              setTheme={setTheme}
            />
          </SettingsGroup>

          <SettingsGroup>
            <NetworkSection
              open={expandedSection === "network"}
              onToggle={() => toggleSection("network")}
              t={t}
              serverInfo={serverInfo}
              qrCodeUrl={qrCodeUrl}
              isLoading={isLoading}
              copied={copied}
              onRefresh={() => fetchServerInfo()}
              onCopy={(text) => copyToClipboard(text)}
            />
          </SettingsGroup>

          <SettingsGroup>
            <StorageSection
              open={expandedSection === "storage"}
              onToggle={() => toggleSection("storage")}
              isResetting={isResetting}
              onReset={resetInitialization}
              content={{
                fileScan: <SettingsFileScan />,
                tasks: <SettingsTasksPanel />,
                mediaManagement: <SettingsMediaManagement />,
              }}
            />
            <SecuritySection open={expandedSection === "security"} onToggle={() => toggleSection("security")} t={t} />
          </SettingsGroup>
        </div>
      </SettingsPageShell>
    </div>
  )
}
