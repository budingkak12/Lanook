"use client"

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SearchStandaloneButton } from "@/components/search/search-capsule"

interface InitializationFooterNavProps {
  isLastStep: boolean
  isLoading: boolean
  disablePrev: boolean
  onPrev: () => void
  onNext: () => void
}

export function InitializationFooterNav({
  isLastStep,
  isLoading,
  disablePrev,
  onPrev,
  onNext,
}: InitializationFooterNavProps) {
  const { t } = useTranslation()

  return (
    <div className="fixed bottom-8 right-4 z-[99999] flex gap-3">
      <SearchStandaloneButton
        onClick={onPrev}
        disabled={disablePrev}
        icon={<ArrowLeft className="w-4 h-4" />}
        wrapperClassName="shadow-md shadow-primary/10"
        className="px-4"
        aria-label={t("init.prevStep")}
      />
      <SearchStandaloneButton
        onClick={onNext}
        disabled={isLoading}
        icon={
          isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )
        }
        wrapperClassName="shadow-lg shadow-primary/20"
        className="px-4"
        aria-label={isLastStep ? t("init.enterHome") : t("init.nextStep")}
      />
    </div>
  )
}

