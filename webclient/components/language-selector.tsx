'use client'

import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

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
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg sm:rounded-xl p-4 sm:p-6 lg:p-8 shadow-lg w-full max-w-sm mx-auto"
    >
      <div className="flex flex-col items-center justify-center gap-4 sm:gap-6 w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Button
            variant={currentLanguage === 'zh-CN' ? 'default' : 'outline'}
            onClick={() => handleLanguageSelect('zh-CN')}
            className="w-36 sm:w-44 lg:w-48 px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg rounded-lg sm:rounded-xl transition-all duration-300"
          >
            {t('init.chinese')}
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Button
            variant={currentLanguage === 'en-US' ? 'default' : 'outline'}
            onClick={() => handleLanguageSelect('en-US')}
            className="w-36 sm:w-44 lg:w-48 px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg rounded-lg sm:rounded-xl transition-all duration-300"
          >
            {t('init.english')}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  )
}