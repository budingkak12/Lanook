 "use client"

import Link from "next/link"
import { UiDemoView } from "@/components/ui-demo-view"
import { StandardSettingsPage } from "@/components/settings/standard-page"
import { Button } from "@/components/ui/button"

export default function UiDemoPage() {
  return (
    <StandardSettingsPage
      title="组件预览"
      right={
        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Link href="/">⟵</Link>
        </Button>
      }
    >
      <UiDemoView />
    </StandardSettingsPage>
  )
}
