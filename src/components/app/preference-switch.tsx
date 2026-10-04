"use client"

import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import type { Settings } from "@/lib/types"
import { useApp } from "./app-shell"

export function PreferenceSwitch({ setting, children }: {
  setting: "aiPlannerEnabled" | "todayInsightsEnabled" | "analyticsPatternsEnabled"
  children: React.ReactNode
}) {
  const { data, api } = useApp()
  const [saving, setSaving] = useState(false)
  return <label className="flex items-center gap-2 text-sm text-muted-foreground">
    <Switch checked={data.settings[setting]} disabled={saving} onCheckedChange={async (checked) => {
      setSaving(true)
      await api.updateSettings({ [setting]: Boolean(checked) } as Partial<Settings>)
      setSaving(false)
    }} />
    {children}
  </label>
}
