"use client"

import { useState } from "react"
import Link from "next/link"
import { Anchor, Lighthouse, Loader2, RotateCcw, Waves } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { AGENT_NAME, GUIDANCE_MODES } from "@/lib/brand"
import type { GuidanceMode, Integrations, Settings, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { WeekApi } from "@/hooks/use-week"

const ICONS: Record<GuidanceMode, typeof Anchor> = { anchor: Anchor, coach: Lighthouse, autopilot: Waves }

export function SettingsDialog({
  open,
  onOpenChange,
  data,
  api,
  integrations,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  data: WeekData
  api: WeekApi
  integrations: Integrations | null
}) {
  const [saving, setSaving] = useState<GuidanceMode | "reset" | null>(null)
  const current = data.settings.guidanceMode

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl font-medium">Guidance mode</DialogTitle>
          <DialogDescription>How much should {AGENT_NAME} step in when your plans change?</DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="radiogroup" aria-label="Guidance mode">
          {(Object.keys(GUIDANCE_MODES) as GuidanceMode[]).map((mode) => {
            const m = GUIDANCE_MODES[mode]
            const Icon = ICONS[mode]
            const selected = current === mode
            return (
              <button
                key={mode}
                role="radio"
                aria-checked={selected}
                disabled={saving !== null}
                onClick={async () => {
                  if (selected) return
                  setSaving(mode)
                  await api.updateSettings({ guidanceMode: mode })
                  setSaving(null)
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                  selected ? "border-primary bg-accent" : "hover:bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                    selected ? "bg-primary text-primary-foreground" : "bg-secondary",
                  )}
                >
                  {saving === mode ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                </span>
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    {m.label}
                    <span className="text-xs font-normal text-muted-foreground">{m.short}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{m.description}</span>
                </span>
              </button>
            )
          })}
        </div>

        <Separator />

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Optional features</h3>
            <p className="text-xs text-muted-foreground">Turn on only what feels useful. Nothing here is required.</p>
          </div>
          <FeatureToggle
            label="Daily check-in"
            description="Rate each day 1–10 in one tap, so patterns like “late nights → rough mornings” show up."
            checked={data.settings.checkInEnabled}
            onChange={(v) => api.updateSettings({ checkInEnabled: v })}
          />
          <FeatureToggle
            label="Tilly planner suggestions"
            description={`Enable the optional ${AGENT_NAME} suggestions section below manual creation on the Plan page.`}
            checked={data.settings.aiPlannerEnabled}
            onChange={(v) => api.updateSettings({ aiPlannerEnabled: v })}
          />
          <FeatureToggle label="Today insights" description="Show Tilly’s observations and suggested shifts alongside Looking back." checked={data.settings.todayInsightsEnabled} onChange={(v) => api.updateSettings({ todayInsightsEnabled: v })} />
          <FeatureToggle label="Analytics patterns" description="Show observations calculated from your time logs. These do not use a model." checked={data.settings.analyticsPatternsEnabled} onChange={(v) => api.updateSettings({ analyticsPatternsEnabled: v })} />
          <FeatureToggle
            label="Screen time insights"
            description="See how much of a study block went to scrolling. Needs the browser extension — coming soon."
            checked={false}
            disabled
            onChange={() => {}}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Connected services</h3>
          <ul className="space-y-1.5 text-sm">
            <ServiceRow label="Gemini" on={integrations?.gemini} detail="reasoning & reflection" fallback="local heuristics" />
            <ServiceRow label="ElevenLabs" on={integrations?.elevenlabs} detail="Tilly's voice" fallback="browser voice" />
            <ServiceRow label="Neon Postgres" on={integrations?.neon} detail="calendar & time logs" fallback="in-memory demo data" />
          </ul>
        </div>

        <Button
          variant="outline"
          disabled={saving !== null}
          onClick={async () => {
            setSaving("reset")
            await api.reset()
            setSaving(null)
            onOpenChange(false)
          }}
        >
          {saving === "reset" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Reset demo week
        </Button>
        <Link
          href="/welcome"
          onClick={() => {
            onOpenChange(false)
            // Same-page navigation does not remount the wizard, so tell it to start over.
            window.dispatchEvent(new Event("tilly:replay-welcome"))
          }}
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Replay the welcome tour
        </Link>
      </DialogContent>
    </Dialog>
  )
}

function ServiceRow({ label, on, detail, fallback }: { label: string; on?: boolean; detail: string; fallback: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>
        {label} <span className="text-muted-foreground">· {detail}</span>
      </span>
      <span
        className={cn(
          "rounded-sm px-2 py-0.5 text-xs whitespace-nowrap",
          on ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground",
        )}
      >
        {on ? "Live" : `Using ${fallback}`}
      </span>
    </li>
  )
}

function FeatureToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: Settings["checkInEnabled"]
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className={cn("flex items-start justify-between gap-4", disabled && "opacity-60")}>
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(Boolean(v))} className="mt-1" />
    </label>
  )
}
