"use client"

import { cn } from "@/lib/utils"

interface Step {
  id: number
  title: string
}

interface StepNavigationProps {
  steps: Step[]
  currentStep: number
  onStepClick: (stepId: number) => void
}

export function StepNavigation({ steps, currentStep, onStepClick }: StepNavigationProps) {
  return (
    <nav className="space-y-2 py-2 px-1">
      {steps.map((step) => {
        const isActive = step.id === currentStep
        const isCompleted = step.id < currentStep

        return (
          <button
            key={step.id}
            onClick={() => onStepClick(step.id)}
            className={cn(
              "w-full flex items-center gap-2 px-2 pr-1 py-2 rounded-xl text-left transition-all duration-300 ease-in-out",
              isActive && "bg-white text-black shadow-lg border border-border/50",
              !isActive && "bg-card/30 backdrop-blur-sm hover:bg-card/50 shadow-sm hover:shadow-md",
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-xs font-medium transition-all duration-300",
                isActive && "bg-black text-white",
                !isActive && isCompleted && "bg-muted/50 text-muted-foreground",
                !isActive && !isCompleted && "bg-muted/50 text-muted-foreground",
              )}
            >
              {step.id}
            </div>
            <span
              className={cn(
                "text-sm leading-relaxed transition-colors duration-300",
                isActive && "font-medium text-black",
                !isActive && "text-muted-foreground",
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