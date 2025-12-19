"use client"

import { CircleHelp } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { SearchStandaloneButton } from "@/components/search/search-capsule"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export function InitHelpDialogButton() {
  const { t } = useTranslation()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          // 固定为 28px（text-xl 默认行高 28px），避免在第 1→2 步出现 header 高度跳变
          className="h-7 w-7 rounded-full border border-border/60 bg-card/30 hover:bg-accent/60"
          aria-label={t("init.help.ariaLabel")}
        >
          <CircleHelp className="size-4" />
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("init.help.title")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <ul className="list-disc pl-5 space-y-2 text-left">
                <li>{t("init.help.items.scan")}</li>
                <li>{t("init.help.items.noAssetChange")}</li>
                <li>{t("init.help.items.manageLater")}</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <SearchStandaloneButton
              icon={null}
              size="compact"
              wrapperClassName="w-full sm:w-28"
            >
              {t("init.help.close")}
            </SearchStandaloneButton>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
