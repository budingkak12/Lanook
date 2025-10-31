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
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-8 shadow-lg"
    >
      <div className="flex flex-col items-center justify-center gap-8">
        <div className="flex gap-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Button
              variant={currentLanguage === 'zh-CN' ? 'default' : 'outline'}
              onClick={() => handleLanguageSelect('zh-CN')}
              className={`px-8 py-4 text-lg rounded-xl transition-all duration-300 ${
                currentLanguage === 'zh-CN'
                  ? 'bg-white text-black shadow-md hover:shadow-lg'
                  : 'bg-transparent border-white/20 text-white hover:bg-white/10'
              }`}
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
              className={`px-8 py-4 text-lg rounded-xl transition-all duration-300 ${
                currentLanguage === 'en-US'
                  ? 'bg-white text-black shadow-md hover:shadow-lg'
                  : 'bg-transparent border-white/20 text-white hover:bg-white/10'
              }`}
            >
              {t('init.english')}
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}