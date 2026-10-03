"use client"

import { useState } from "react"
import { Anchor, Compass, Loader2, RotateCcw, Waves } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { AGENT_NAME, GUIDANCE_MODES } from "@/lib/brand"
import type { GuidanceMode, Integrations, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { WeekApi } from "@/hooks/use-week"

const ICONS: Record<GuidanceMode, typeof Anchor> = { anchor: Anchor, coach: Compass, autopilot: Waves }

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
                  await api.setMode(mode)
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
          "rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
          on ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground",
        )}
      >
        {on ? "Live" : `Using ${fallback}`}
      </span>
    </li>
  )
}
