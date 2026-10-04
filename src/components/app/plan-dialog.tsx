"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Loader2, Plus, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatRange, validDate } from "@/lib/time"
import type { PlanBreakdown, ScheduleChange } from "@/lib/types"
import { request } from "@/hooks/use-week"
import { useApp } from "./app-shell"
import { BlockForm, type BlockWindow } from "./block-form"

export type DraftBlock = BlockWindow

export function PlanDialog({ block, onClose }: { block: DraftBlock | null; onClose: () => void }) {
  return <Dialog open={block !== null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl font-medium">Add to your week</DialogTitle>
        <DialogDescription>Choose your own block, or open Tilly’s suggestions below.</DialogDescription>
      </DialogHeader>
      {block && <PlanForm key={`${block.date}-${block.startMin}-${block.endMin}`} initial={block} onDone={onClose} />}
    </DialogContent>
  </Dialog>
}

function PlanForm({ initial, onDone }: { initial: DraftBlock; onDone: () => void }) {
  const { data } = useApp()
  const [block, setBlock] = useState(initial)
  const [expanded, setExpanded] = useState(false)
  return <div className="space-y-4">
    <BlockForm draft={initial} onDone={onDone} onWindowChange={setBlock} />
    {data.settings.aiPlannerEnabled && <section className="rounded-md border p-3">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium">
        Tilly’s suggestions <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <Suggestions block={block} onDone={onDone} />}
    </section>}
  </div>
}

/** Mounted only after an explicit expansion; stale or hidden suggestions cannot be applied. */
function Suggestions({ block, onDone }: { block: DraftBlock; onDone: () => void }) {
  const { data, today, api } = useApp()
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{ key: string; plan?: PlanBreakdown; error?: string } | null>(null)
  const [saving, setSaving] = useState<number[] | null>(null)
  // Once a suggestion is added the calendar changes; keep this list instead of refetching it.
  const [kept, setKept] = useState<{ blockKey: string; plan: PlanBreakdown; added: number[] } | null>(null)
  const lock = useRef(false)
  const valid = validDate(block.date) && Number.isInteger(block.startMin) && Number.isInteger(block.endMin) && block.startMin >= 0 && block.endMin <= 1440 && block.endMin - block.startMin >= 15
  const snapshot = JSON.stringify([data.projects, data.tasks, data.events, data.logs, data.checkIns, data.settings])
  const blockKey = JSON.stringify(block)
  const key = JSON.stringify([block, today, snapshot, version])
  const keep = kept?.blockKey === blockKey ? kept : null
  const current = keep ? { key, plan: keep.plan } : result?.key === key ? result : null
  const loading = valid && current === null
  const plan = current?.plan
  const added = keep?.added ?? []

  useEffect(() => {
    if (!valid || keep) return
    const controller = new AbortController()
    let active = true
    request<PlanBreakdown>("/api/plan", { method: "POST", body: JSON.stringify({ ...block, today }), signal: controller.signal }).then(
      (plan) => { if (active) setResult({ key, plan }) },
      (err) => { if (active) setResult({ key, error: err instanceof Error ? err.message : "Couldn't suggest blocks" }) },
    )
    return () => { active = false; controller.abort() }
  }, [key, block, today, valid, keep])

  const taskById = new Map(data.tasks.map((t) => [t.id, t]))
  const remaining = plan ? plan.segments.flatMap((_, i) => (added.includes(i) ? [] : [i])) : []
  const add = async (indices: number[]) => {
    if (!plan || lock.current || indices.length === 0) return
    lock.current = true
    const changes: ScheduleChange[] = indices.map((i) => plan.segments[i]).map((s) => ({ action: "create", date: block.date, startMin: s.startMin, endMin: s.endMin, taskId: s.taskId, projectId: taskById.get(s.taskId)?.projectId, title: taskById.get(s.taskId)?.title, reason: s.why }))
    setSaving(indices)
    try {
      const ok = await api.applyChanges(changes, indices.length === 1 ? `Added ${changes[0].title ?? "block"}` : "Suggestions added to your calendar")
      if (!ok) return
      const next = [...added, ...indices]
      if (next.length === plan.segments.length) onDone()
      else setKept({ blockKey, plan, added: next })
    } finally {
      lock.current = false
      setSaving(null)
    }
  }
  return <div className="mt-3 space-y-3">
    <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">For {valid ? formatRange(block.startMin, block.endMin) : "a valid time window"}</p><Button variant="ghost" size="xs" disabled={loading || !valid || saving !== null} onClick={() => { setKept(null); setVersion((v) => v + 1) }}><RefreshCw />Try again</Button></div>
    {!valid && <p className="text-sm text-muted-foreground">Choose a date and at least 15 minutes above.</p>}
    {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Preparing suggestions…</p>}
    {current?.error && <p role="alert" className="text-sm text-destructive">{current.error}</p>}
    {plan && <>
      <p className="text-sm text-muted-foreground">{plan.summary}</p>
      <ol className="space-y-2">{plan.segments.map((segment, i) => {
        const task = taskById.get(segment.taskId)
        const project = data.projects.find((p) => p.id === task?.projectId)
        const isAdded = added.includes(i)
        return <li key={`${segment.taskId}-${segment.startMin}`} className={`flex items-start gap-2 rounded-md border p-3 ${isAdded ? "bg-emerald-50/60" : ""}`}>
          <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: project?.color }} />
          <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{formatRange(segment.startMin, segment.endMin)}</p><p className="text-sm font-medium">{task?.title}</p><p className="text-xs text-muted-foreground">{segment.why}</p></div>
          {isAdded ? <span className="flex items-center gap-1 text-xs text-emerald-700"><Check className="size-3.5" />Added</span> : <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="xs" aria-label={`Add ${task?.title ?? "suggestion"}`} disabled={saving !== null} onClick={() => add([i])}>{saving?.length === 1 && saving[0] === i ? <Loader2 className="animate-spin" /> : <Plus />}Add</Button>
            <Button variant="ghost" size="icon-xs" aria-label={`Remove ${task?.title ?? "suggestion"}`} disabled={saving !== null} onClick={() => {
              const segments = plan.segments.filter((_, j) => i !== j)
              const shifted = added.map((j) => (j > i ? j - 1 : j))
              if (keep) setKept({ ...keep, plan: { ...plan, segments }, added: shifted })
              else setResult({ key, plan: { ...plan, segments } })
            }}><X /></Button>
          </div>}
        </li>
      })}</ol>
      {remaining.length > 1 && <Button className="w-full" disabled={saving !== null} onClick={() => add(remaining)}>{saving && saving.length > 1 && <Loader2 className="animate-spin" />}Add {added.length ? "the other" : "all"} {remaining.length}</Button>}
      {added.length > 0 && <Button variant="ghost" className="w-full" disabled={saving !== null} onClick={onDone}>Done</Button>}
      {plan.segments.length === 0 && <p className="text-sm text-muted-foreground">No suggested blocks for this window.</p>}
    </>}
  </div>
}
