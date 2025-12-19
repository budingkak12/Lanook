"use client"

import { motion } from "framer-motion"
import { InitHelpDialogButton } from "@/components/init/init-help-dialog-button"

interface InitializationHeaderProps {
  title: string
  isExiting: boolean
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  showHelp?: boolean
}

export function InitializationHeader({
  title,
  isExiting,
  isSidebarOpen,
  onToggleSidebar,
  showHelp = true,
}: InitializationHeaderProps) {
  return (
    <motion.header
      initial={{ y: 0, opacity: 1 }}
      animate={isExiting ? { y: "-120%", opacity: 0 } : { y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      className="fixed top-0 left-0 right-0 z-[10000] border-b border-border/50 relative overflow-hidden"
      style={{ position: "fixed", top: 0, left: 0, right: 0, transform: "translateZ(0)" }}
    >
      <div className="absolute inset-x-0 top-0 h-1/2 backdrop-blur-sm bg-card/50" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 backdrop-blur-sm bg-muted/50" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-border/70" />

      <div className="relative z-10 bg-card/20 backdrop-blur-md">
        <div className="pr-4 pl-2 lg:pl-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-4">
            <button
              onClick={onToggleSidebar}
              className="lg:hidden hover:opacity-70 transition-opacity"
              aria-label={isSidebarOpen ? "关闭侧边栏" : "打开侧边栏"}
            >
              <div className="flex flex-col justify-center items-center w-5 h-5">
                <div className="w-4 h-0.5 bg-foreground mb-1"></div>
                <div className="w-4 h-0.5 bg-foreground mb-1"></div>
                <div className="w-4 h-0.5 bg-foreground"></div>
              </div>
            </button>
            <h1 className="text-xl font-normal text-foreground ml-0 pl-0 lg:ml-0 lg:pl-0">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {showHelp ? <InitHelpDialogButton /> : null}
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 h-1 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, transparent 100%)",
        }}
      />
    </motion.header>
  )
}
