"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, MessageCircleHeart, Moon, RotateCcw, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { taskLogged } from "@/lib/analytics"
import { AGENT_NAME } from "@/lib/brand"
import { formatDuration, formatRange, monthDay, weekdayShort } from "@/lib/time"
import type { CalendarEvent, WeekData } from "@/lib/types"
import type { WeekApi } from "@/hooks/use-week"
import { PlannedVsActual } from "./block-card"

function momentumLine(logged: number, estimate: number, sessions: number) {
  if (logged === 0) return "Fresh start. Even 15 minutes counts as momentum."
  const pct = Math.round((logged / estimate) * 100)
  if (pct >= 100) return `You've put in ${formatDuration(logged)} — past the estimate. It might be closer to done than it feels.`
  if (pct >= 60) return `${pct}% of the way there across ${sessions} session${sessions === 1 ? "" : "s"}. The finish line is in view.`
  return `${formatDuration(logged)} in already across ${sessions} session${sessions === 1 ? "" : "s"}. You're not starting from zero.`
}

export function BlockDialog({
  event,
  data,
  api,
  open,
  onOpenChange,
  onAskAgent,
}: {
  event: CalendarEvent | null
  data: WeekData
  api: WeekApi
  open: boolean
  onOpenChange: (open: boolean) => void
  onAskAgent: (message: string) => void
}) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  if (!event) return null

  const live = data.events.find((e) => e.id === event.id) ?? event
  const project = data.projects.find((p) => p.id === live.projectId)
  const task = data.tasks.find((t) => t.id === live.taskId)
  const color = project?.color ?? "#A8A29E"
  const planned = live.endMin - live.startMin
  const logs = task
    ? data.logs.filter((l) => l.taskId === task.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []
  const logged = task ? taskLogged(task.id, data.logs) : 0
  const pct = task ? Math.min(100, Math.round((logged / task.estimateMinutes) * 100)) : 0
  const remainingInBlock = Math.max(0, planned - live.actualMinutes)

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    await fn()
    setBusy(null)
  }

  const log = (minutes: number) =>
    run(`log-${minutes}`, async () => {
      await api.logTime(live.id, minutes, note.trim())
      setNote("")
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-lg">
        <div className="relative overflow-hidden rounded-t-xl px-5 pt-5 pb-4" style={{ backgroundColor: `${color}1f` }}>
          <DialogHeader>
            <p className="text-xs font-medium tracking-wide uppercase" style={{ color }}>
              {project?.name ?? "Life"}
            </p>
            <DialogTitle className="font-heading text-xl font-medium">{live.title}</DialogTitle>
            <DialogDescription>
              {weekdayShort(live.date)} {monthDay(live.date)} · {formatRange(live.startMin, live.endMin)} ·{" "}
              {formatDuration(planned)}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-5 pb-5">
          {task ? (
            <section className="rounded-2xl border bg-background p-4">
              <div className="flex items-center gap-4">
                <ProgressRing percent={pct} color={color} />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Time on this task so far</p>
                  <p className="font-heading text-2xl font-medium tabular-nums">
                    {formatDuration(logged)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      of ~{formatDuration(task.estimateMinutes)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {momentumLine(logged, task.estimateMinutes, logs.length)}
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <p className="rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">
              Life blocks aren&apos;t tracked against goals — they&apos;re here so your plan stays honest about your
              time.
            </p>
          )}

          {live.status !== "planned" && (
            <section>
              <h3 className="mb-2 text-sm font-medium">This block</h3>
              <PlannedVsActual planned={planned} actual={live.actualMinutes} color={color} />
            </section>
          )}

          {task && live.status !== "skipped" && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Timer className="size-4" /> Log focused time
              </h3>
              <Input
                placeholder="Optional note — what moved forward?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
              />
              <div className="flex flex-wrap gap-2">
                {[15, 25, 45].map((m) => (
                  <Button key={m} variant="outline" size="sm" disabled={busy !== null} onClick={() => log(m)}>
                    {busy === `log-${m}` && <Loader2 className="animate-spin" />}+{m}m
                  </Button>
                ))}
                {remainingInBlock > 0 && (
                  <Button size="sm" disabled={busy !== null} onClick={() => log(remainingInBlock)}>
                    {busy === `log-${remainingInBlock}` && <Loader2 className="animate-spin" />}
                    Did the whole block
                  </Button>
                )}
              </div>
            </section>
          )}

          {logs.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium">Progress trail</h3>
              <ol className="space-y-2 border-l pl-4">
                {logs.slice(0, 6).map((l) => (
                  <li key={l.id} className="relative text-sm">
                    <span
                      className="absolute top-1.5 -left-[21px] size-2 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-medium tabular-nums">{formatDuration(l.minutes)}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {weekdayShort(l.createdAt.slice(0, 10))} {monthDay(l.createdAt.slice(0, 10))}
                    </span>
                    {l.note && <p className="text-muted-foreground">“{l.note}”</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {live.status === "planned" && live.kind === "work" && (
              <Button
                variant="secondary"
                onClick={() => {
                  onOpenChange(false)
                  onAskAgent(`I'm not up for "${live.title}" right now, move it.`)
                }}
              >
                <MessageCircleHeart /> Not feeling it — ask {AGENT_NAME}
              </Button>
            )}
            {live.status === "planned" && (
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => run("skip", () => api.updateEvent(live.id, { status: "skipped" }, "Let it go. That's allowed."))}
              >
                <Moon /> Skip
              </Button>
            )}
            {live.status === "skipped" && (
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => run("restore", () => api.updateEvent(live.id, { status: "planned" }, "Block restored"))}
              >
                <RotateCcw /> Restore block
              </Button>
            )}
            {task && (
              <Button
                variant="ghost"
                className="ml-auto"
                disabled={busy !== null}
                onClick={() => run("done", () => api.setTaskDone(task.id, !task.done))}
              >
                <CheckCircle2 /> {task.done ? "Reopen task" : "Mark task done"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-label={`${percent}% of estimate`}>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        stroke={color}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
        className="transition-[stroke-dashoffset] duration-700"
      />
      <text
        x="32"
        y="32"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-foreground text-[13px] font-medium"
        style={{ transformOrigin: "32px 32px" }}
      >
        {percent}%
      </text>
    </svg>
  )
}
