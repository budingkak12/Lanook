import type { ReactNode } from "react"
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
  Sun,
  Wifi,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { SettingsExpand, SettingsPanel, SettingsRow } from "@/components/settings/list-ui"

type TFn = (key: string) => string

export function LanguageSection({
  open,
  onToggle,
  t,
  i18n,
}: {
  open: boolean
  onToggle: () => void
  t: TFn
  i18n: { language: string; changeLanguage: (lng: string) => void }
}) {
  return (
    <>
      <SettingsRow
        icon={<Globe className="w-5 h-5" />}
        title={t("settings.language.title")}
        description={t("settings.language.current")}
        expanded={open}
        onClick={onToggle}
        showChevron={false}
      />
      <SettingsExpand open={open}>
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
      </SettingsExpand>
    </>
  )
}

export function AppearanceSection({
  open,
  onToggle,
  t,
  theme,
  setTheme,
}: {
  open: boolean
  onToggle: () => void
  t: TFn
  theme: string | undefined
  setTheme: (theme: string) => void
}) {
  return (
    <>
      <SettingsRow
        icon={<Palette className="w-5 h-5" />}
        title={t("settings.appearance.title")}
        description={t("settings.appearance.description")}
        expanded={open}
        onClick={onToggle}
        showChevron={false}
      />
      <SettingsExpand open={open}>
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
                <span className="ml-1">(系统{window.matchMedia("(prefers-color-scheme: dark)").matches ? "黑暗" : "明亮"})</span>
              ) : null}
            </div>
          </div>
        </SettingsPanel>
      </SettingsExpand>
    </>
  )
}

export type NetworkInfo = { ip: string; port: number; display_url: string }

export function NetworkSection({
  open,
  onToggle,
  t,
  serverInfo,
  qrCodeUrl,
  isLoading,
  copied,
  onRefresh,
  onCopy,
}: {
  open: boolean
  onToggle: () => void
  t: TFn
  serverInfo: NetworkInfo | null
  qrCodeUrl: string
  isLoading: boolean
  copied: boolean
  onRefresh: () => void
  onCopy: (text: string) => void
}) {
  return (
    <>
      <SettingsRow
        icon={<Wifi className="w-5 h-5" />}
        title={t("settings.network.title")}
        description={t("settings.network.description")}
        expanded={open}
        onClick={onToggle}
        showChevron={false}
        right={
          open ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onRefresh()
              }}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              {t("settings.network.refresh")}
            </Button>
          ) : null
        }
      />
      <SettingsExpand open={open}>
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
                      <Button variant="outline" size="sm" onClick={() => onCopy(serverInfo.ip)}>
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t("settings.network.connection.port")}</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-[rgb(240_242_244)] rounded text-sm">{serverInfo.port}</code>
                      <Button variant="outline" size="sm" onClick={() => onCopy(serverInfo.port.toString())}>
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
                    <Button variant="outline" size="sm" onClick={() => onCopy(serverInfo.display_url)}>
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
      </SettingsExpand>
    </>
  )
}

export function StorageSection({
  open,
  onToggle,
  isResetting,
  onReset,
  content,
}: {
  open: boolean
  onToggle: () => void
  isResetting: boolean
  onReset: () => void
  content: { fileScan: ReactNode; tasks: ReactNode; mediaManagement: ReactNode }
}) {
  const { fileScan, tasks, mediaManagement } = content
  return (
    <>
      <SettingsRow
        icon={<HardDrive className="w-5 h-5" />}
        title="存储与任务"
        description="管理媒体库设置、路径配置与后台任务进度"
        expanded={open}
        onClick={onToggle}
        showChevron={false}
      />
      <SettingsExpand open={open}>
        <SettingsPanel>
          <div className="space-y-6">
            {fileScan}

            <div className="border-t border-[rgb(228_231_234)] pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Settings className="w-4 h-4" />
                <h4 className="text-sm font-medium">任务与进度</h4>
              </div>
              {tasks}
            </div>

            <div className="border-t border-[rgb(228_231_234)] pt-4">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="w-4 h-4" />
                <h4 className="text-sm font-medium">媒体路径管理</h4>
              </div>
              {mediaManagement}
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
                    onClick={onReset}
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
      </SettingsExpand>
    </>
  )
}

export function SecuritySection({
  open,
  onToggle,
  t,
}: {
  open: boolean
  onToggle: () => void
  t: TFn
}) {
  return (
    <>
      <SettingsRow
        icon={<Shield className="w-5 h-5" />}
        title={t("settings.security.title")}
        description={t("settings.security.description")}
        expanded={open}
        onClick={onToggle}
        showChevron={false}
      />
      <SettingsExpand open={open}>
        <SettingsPanel>
          <div className="text-center py-6 text-[rgb(120_123_124)]">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-xs">{t("settings.security.developing")}</p>
          </div>
        </SettingsPanel>
      </SettingsExpand>
    </>
  )
}
