"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

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
      <p className="text-base text-muted-foreground mb-8 leading-relaxed">{content.description}</p>

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
                  className="flex items-start gap-3 text-muted-foreground leading-relaxed"
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
          className="mt-8 flex justify-center"
        >
          <Button
            onClick={() => {
              // TODO: 切换到媒体浏览界面，这里暂时先重新加载页面
              window.location.reload()
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-medium shadow-lg hover:shadow-md transition-all duration-300"
          >
            进入首页
          </Button>
        </motion.div>
      )}
    </motion.div>
  )
}