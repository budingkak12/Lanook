"use client"

import { cn } from "@/lib/utils"

interface Step {
  id: number
  title: string
  icon?: React.ReactNode
}

interface StepNavigationProps {
  steps: Step[]
  currentStep: number
  onStepClick: (stepId: number) => void
  collapsed?: boolean
}

export function StepNavigation({ steps, currentStep, onStepClick, collapsed = false }: StepNavigationProps) {
  return (
    <nav className={cn("space-y-2 py-2 px-1", collapsed && "px-0 flex flex-col items-center")}>
      {steps.map((step) => {
        const isActive = step.id === currentStep

        return (
          <button
            key={step.id}
            onClick={() => onStepClick(step.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl text-left transition-colors duration-150 justify-start",
              isActive && "bg-primary text-primary-foreground shadow-lg",
              !isActive && "bg-card/30 backdrop-blur-sm hover:bg-card/50 shadow-sm hover:shadow-md",
              !collapsed && "w-full px-3 py-2",
              collapsed && "w-10 h-10 justify-center px-0 rounded-full"
            )}
          >
            {step.icon && <span className={cn(
              "w-4 h-4 flex items-center justify-center",
              isActive && "text-primary-foreground",
              !isActive && "text-muted-foreground"
            )}>{step.icon}</span>}
            <span
              className={cn(
                "text-sm leading-relaxed",
                isActive && "font-medium text-primary-foreground",
                !isActive && "text-muted-foreground",
                collapsed && "sr-only"
              )}
            >
              {step.title}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
