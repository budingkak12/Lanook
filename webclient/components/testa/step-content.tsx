"use client"

import { motion } from "framer-motion"

interface ContentSection {
  heading: string
  items: string[]
}

interface StepContentData {
  title: string
  description: string
  sections: ContentSection[]
}

interface StepContentProps {
  content: StepContentData
  isLastStep: boolean
}

export function StepContent({ content, isLastStep }: StepContentProps) {
  return (
    <motion.div
      key={content.title}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-8 shadow-lg"
    >
      <h2 className="text-3xl font-normal text-foreground mb-4 text-balance">{content.title}</h2>

      <p style={{ color: 'var(--dynamic-muted-foreground, oklch(0.90 0 0))' }} className="text-base mb-8 leading-relaxed">{content.description}</p>

      <div className="space-y-8">
        {content.sections.map((section, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <h3 className="text-xl font-medium text-foreground mb-4">{section.heading}</h3>
            <ul className="space-y-3">
              {section.items.map((item, itemIndex) => (
                <motion.li
                  key={itemIndex}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.1 + itemIndex * 0.05 }}
                  style={{ color: 'var(--dynamic-muted-foreground, oklch(0.90 0 0))' }}
                  className="flex items-start gap-3 leading-relaxed"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>{item}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      {isLastStep && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="mt-8 p-6 bg-primary/10 border border-primary/30 rounded-xl backdrop-blur-sm"
        >
          <p className="text-center text-foreground font-medium">🎉 恭喜您完成所有步驟！</p>
        </motion.div>
      )}
    </motion.div>
  )
}