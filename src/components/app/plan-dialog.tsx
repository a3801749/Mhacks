"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { activeProjects } from "@/lib/analytics"
import { AGENT_NAME } from "@/lib/brand"
import { formatDuration, formatRange, weekdayLong, weekdayShort, monthDay } from "@/lib/time"
import type { PlanBreakdown, PlanSegment, ScheduleChange } from "@/lib/types"
import { request } from "@/hooks/use-week"
import { useApp } from "./app-shell"

export interface DraftBlock {
  date: string
  startMin: number
  endMin: number
}

const toTime = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`
const fromTime = (v: string) => {
  const [h, m] = v.split(":").map(Number)
  return h * 60 + m
}

export function PlanDialog({ block, onClose, days }: { block: DraftBlock | null; onClose: () => void; days: string[] }) {
  return (
    <Dialog open={block !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {block && <PlanForm key={`${block.date}-${block.startMin}-${block.endMin}`} initial={block} days={days} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function PlanForm({ initial, days, onDone }: { initial: DraftBlock; days: string[]; onDone: () => void }) {
  const { data, today, api } = useApp()
  const [block, setBlock] = useState(initial)
  const [plan, setPlan] = useState<PlanBreakdown | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const active = new Set(activeProjects(data).map((p) => p.id))
  const tasks = data.tasks.filter((t) => !t.done && active.has(t.projectId))
  const [manualTask, setManualTask] = useState(tasks[0]?.id ?? "")
  const aiOn = data.settings.aiPlannerEnabled
  const valid = block.endMin - block.startMin >= 15

  const suggest = useCallback(
    async (b: DraftBlock) => {
      setLoading(true)
      setError(null)
      try {
        setPlan(await request<PlanBreakdown>("/api/plan", { method: "POST", body: JSON.stringify({ ...b, today }) }))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't plan that block")
      } finally {
        setLoading(false)
      }
    },
    [today],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch a suggestion when the dialog opens
    if (aiOn) suggest(initial)
  }, [aiOn, initial, suggest])

  const taskById = new Map(data.tasks.map((t) => [t.id, t]))
  const projectOf = (taskId: string) => data.projects.find((p) => p.id === taskById.get(taskId)?.projectId)

  const save = async (segments: PlanSegment[]) => {
    const changes: ScheduleChange[] = segments.map((s) => ({
      action: "create",
      date: block.date,
      startMin: s.startMin,
      endMin: s.endMin,
      title: taskById.get(s.taskId)?.title,
      taskId: s.taskId,
      projectId: taskById.get(s.taskId)?.projectId ?? null,
      reason: s.why,
    }))
    setSaving(true)
    const ok = await api.applyChanges(changes, `Added ${changes.length} block${changes.length === 1 ? "" : "s"}`)
    setSaving(false)
    if (ok) onDone()
  }

  const updateBlock = (patch: Partial<DraftBlock>) => {
    const next = { ...block, ...patch }
    setBlock(next)
    setPlan(null)
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl font-medium">
          {weekdayLong(block.date)}, {formatRange(block.startMin, block.endMin)}
        </DialogTitle>
        <DialogDescription>
          {valid ? `${formatDuration(block.endMin - block.startMin)} to work with.` : "End time needs to be after the start."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor="plan-day">Day</Label>
          <select
            id="plan-day"
            value={block.date}
            onChange={(e) => updateBlock({ date: e.target.value })}
            className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d === today ? "Today" : weekdayShort(d)} {monthDay(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-start">From</Label>
          <input
            id="plan-start"
            type="time"
            step={900}
            value={toTime(block.startMin)}
            onChange={(e) => e.target.value && updateBlock({ startMin: fromTime(e.target.value) })}
            className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="plan-end">To</Label>
          <input
            id="plan-end"
            type="time"
            step={900}
            value={toTime(block.endMin % 1440)}
            onChange={(e) => e.target.value && updateBlock({ endMin: fromTime(e.target.value) || 1440 })}
            className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
          />
        </div>
      </div>

      {aiOn && (
        <section className="space-y-3 rounded-2xl border bg-background p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-primary" /> {AGENT_NAME}&apos;s suggestion
            </h3>
            <Button variant="ghost" size="xs" disabled={loading || !valid} onClick={() => suggest(block)}>
              <RefreshCw /> {plan ? "Try again" : "Suggest"}
            </Button>
          </div>
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Weighing deadlines, estimates, and how you&apos;ve been feeling…
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {plan && !loading && (
            <>
              <p className="text-sm text-muted-foreground">{plan.summary}</p>
              {plan.segments.length > 0 ? (
                <ol className="space-y-2">
                  {plan.segments.map((s, i) => {
                    const project = projectOf(s.taskId)
                    return (
                      <li key={`${s.taskId}-${s.startMin}`} className="flex items-start gap-3 rounded-xl border p-2.5">
                        <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: project?.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground tabular-nums">{formatRange(s.startMin, s.endMin)}</p>
                          <p className="truncate text-sm font-medium">{taskById.get(s.taskId)?.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {project?.name} · {s.why}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Remove"
                          onClick={() => setPlan({ ...plan, segments: plan.segments.filter((_, j) => j !== i) })}
                        >
                          <X />
                        </Button>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No segments to suggest for this window.</p>
              )}
              {plan.segments.length > 0 && (
                <Button className="w-full" disabled={saving} onClick={() => save(plan.segments)}>
                  {saving && <Loader2 className="animate-spin" />}
                  Add {plan.segments.length} block{plan.segments.length === 1 ? "" : "s"} to my calendar
                </Button>
              )}
            </>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{aiOn ? "Or keep it simple — one task" : "What will you work on?"}</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open tasks. Add an assignment first.</p>
        ) : (
          <div className="flex gap-2">
            <select
              value={manualTask}
              onChange={(e) => setManualTask(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm"
              aria-label="Task"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} — {data.projects.find((p) => p.id === t.projectId)?.name}
                </option>
              ))}
            </select>
            <Button
              variant={aiOn ? "outline" : "default"}
              disabled={saving || !valid || !manualTask}
              onClick={() => save([{ taskId: manualTask, startMin: block.startMin, endMin: block.endMin, why: "Planned by you" }])}
            >
              Add block
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
