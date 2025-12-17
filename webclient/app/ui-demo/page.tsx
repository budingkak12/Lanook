 "use client"

import { useState } from "react"
import Link from "next/link"
import { UiDemoView } from "@/components/ui-demo-view"
import { StandardSettingsPage } from "@/components/settings/standard-page"
import { Button } from "@/components/ui/button"
import type { DemoTheme } from "@/components/ui-demo-storage-tasks"

export default function UiDemoPage() {
  const [demoTheme, setDemoTheme] = useState<DemoTheme>("gray")

  return (
    <StandardSettingsPage
      title="组件预览"
      className={demoTheme === "warm" ? "theme-demo-warm" : undefined}
      right={
        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Link href="/">⟵</Link>
        </Button>
      }
    >
      <UiDemoView demoTheme={demoTheme} onDemoThemeChange={setDemoTheme} />
    </StandardSettingsPage>
  )
}
