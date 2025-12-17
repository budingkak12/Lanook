'use client'

import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"

export function LanguageSelector() {
  const { i18n, t } = useTranslation()

  const handleLanguageSelect = (language: string) => {
    i18n.changeLanguage(language)
  }

  const currentLanguage = i18n.language

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
      className="w-full max-w-sm mx-auto"
    >
      <SelectableListCard>
        <SelectableListItem
          selected={currentLanguage === "zh-CN"}
          onSelect={() => handleLanguageSelect("zh-CN")}
        >
          <span className="text-sm sm:text-base">{t("init.chinese")}</span>
        </SelectableListItem>
        <SelectableListItem
          selected={currentLanguage === "en-US"}
          onSelect={() => handleLanguageSelect("en-US")}
        >
          <span className="text-sm sm:text-base">{t("init.english")}</span>
        </SelectableListItem>
      </SelectableListCard>
    </motion.div>
  )
}
