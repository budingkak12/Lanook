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
import { SettingsExpand, SettingsPanel, SettingsRow, SettingsSecondaryCard } from "@/components/settings/list-ui"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"
import { SettingsSelectableSection } from "@/components/settings/selectable-section"

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
    <SettingsSelectableSection
      icon={<Globe className="w-5 h-5" />}
      title={t("settings.language.title")}
      description={t("settings.language.current")}
      open={open}
      onToggle={onToggle}
      options={[
        {
          id: "zh-CN",
          label: t("settings.language.chinese"),
          selected: i18n.language === "zh-CN",
          onSelect: () => i18n.changeLanguage("zh-CN"),
        },
        {
          id: "en-US",
          label: t("settings.language.english"),
          selected: i18n.language === "en-US",
          onSelect: () => i18n.changeLanguage("en-US"),
        },
      ]}
    />
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
          <SelectableListCard>
            <SelectableListItem selected={theme === "light"} onSelect={() => setTheme("light")}>
              <div className="flex items-center gap-2 min-w-0">
                <Sun className="w-4 h-4 shrink-0" />
                <span className="truncate">明亮模式</span>
              </div>
            </SelectableListItem>
            <SelectableListItem selected={theme === "warm"} onSelect={() => setTheme("warm")}>
              <div className="flex items-center gap-2 min-w-0">
                <Palette className="w-4 h-4 shrink-0" />
                <span className="truncate">暖色模式</span>
              </div>
            </SelectableListItem>
            <SelectableListItem selected={theme === "dark"} onSelect={() => setTheme("dark")}>
              <div className="flex items-center gap-2 min-w-0">
                <Moon className="w-4 h-4 shrink-0" />
                <span className="truncate">黑暗模式</span>
              </div>
            </SelectableListItem>
            <SelectableListItem selected={theme === "system"} onSelect={() => setTheme("system")}>
              <div className="flex items-center gap-2 min-w-0">
                <Monitor className="w-4 h-4 shrink-0" />
                <span className="truncate">跟随系统</span>
              </div>
            </SelectableListItem>
          </SelectableListCard>
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
  copiedText,
  onRefresh,
  onCopy,
}: {
  open: boolean
  onToggle: () => void
  t: TFn
  serverInfo: NetworkInfo | null
  qrCodeUrl: string
  isLoading: boolean
  copiedText: string | null
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
                    <div className="text-center space-y-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                      <img
                        src={qrCodeUrl}
                        alt={t("settings.network.qrCode.alt")}
                        className="mx-auto border border-border/50 rounded-lg bg-card"
                      />
                      <p className="text-sm text-muted-foreground">{t("settings.network.qrCode.description")}</p>
                    </div>
                  ) : (
                    <div className="w-72 max-w-full rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                      <div className="aspect-square w-full rounded-lg border border-border/50 bg-card flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                        <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">{t("settings.network.qrCode.scanning")}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <SelectableListCard className="border border-border/50">
                  <SelectableListItem
                    selected={false}
                    showCheck={false}
                    onSelect={() => onCopy(serverInfo.ip)}
                    right={copiedText === serverInfo.ip ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">{t("settings.network.connection.ip")}</div>
                      <div className="mt-0.5 text-sm font-mono text-foreground truncate">{serverInfo.ip}</div>
                    </div>
                  </SelectableListItem>

                  <SelectableListItem
                    selected={false}
                    showCheck={false}
                    onSelect={() => onCopy(serverInfo.port.toString())}
                    right={copiedText === serverInfo.port.toString() ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">{t("settings.network.connection.port")}</div>
                      <div className="mt-0.5 text-sm font-mono text-foreground truncate">{serverInfo.port}</div>
                    </div>
                  </SelectableListItem>

                  <SelectableListItem
                    selected={false}
                    showCheck={false}
                    onSelect={() => onCopy(serverInfo.display_url)}
                    right={copiedText === serverInfo.display_url ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground">{t("settings.network.connection.fullAddress")}</div>
                      <div className="mt-0.5 text-sm font-mono text-foreground break-all line-clamp-2">
                        {serverInfo.display_url}
                      </div>
                    </div>
                  </SelectableListItem>
                </SelectableListCard>

                <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                  <h4 className="font-medium mb-2 flex items-center gap-2 text-sm text-foreground">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    {t("settings.network.usage.title")}
                  </h4>
                  <div className="space-y-2 text-sm text-foreground">
                    <p className="flex items-start gap-2">
                      <span className="font-medium text-muted-foreground">1.</span>
                      <span className="text-muted-foreground">{t("settings.network.usage.step1")}</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="font-medium text-muted-foreground">2.</span>
                      <span className="text-muted-foreground">{t("settings.network.usage.step2")}</span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="font-medium text-muted-foreground">3.</span>
                      <span className="text-muted-foreground">{t("settings.network.usage.step3")}</span>
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
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
          <div className="space-y-4">
            {fileScan}
            {tasks}
            {mediaManagement}

            <SettingsSecondaryCard>
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <RotateCcw className="w-5 h-5 text-muted-foreground" />
                    <span>重置媒体库</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">清除当前媒体库设置，重新选择媒体文件夹。</div>
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
              <div className="px-4 pb-4">
                <div className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">注意：</span>
                  重置后软件将回到初始状态。这将清空数据库信息（点赞、标签等），但不会删除媒体文件夹内的实际文件。
                </div>
              </div>
            </SettingsSecondaryCard>
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
