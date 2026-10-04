"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { projectHealth, projectLogged, projectStartedDate } from "@/lib/analytics"
import { ASSIGNMENT_TYPES } from "@/lib/brand"
import { addDays, daysBetween, formatDuration, fromDateKey, monthDay } from "@/lib/time"
import type { Project } from "@/lib/types"
import { cn } from "@/lib/utils"
import { progressFill, progressLag, timelineTicks } from "@/lib/timeline-layout"
import { DueDateInput, DueEdge } from "./timeline-due"
import { useApp } from "./app-shell"

interface Row {
  project: Project
  start: string
  end: string
  started: string | null
  finished: string | null
  percent: number
  logged: number
  remaining: number | null
}

type Status = { label: string; tone: "good" | "warn" | "done" | "idle" }

function rowStatus(r: Row, due: string, today: string): Status {
  if (r.finished) return { label: `Finished ${monthDay(r.finished)}`, tone: "done" }
  if (r.percent >= 100) return { label: "Done", tone: "done" }
  if (!r.started && r.percent === 0) return { label: "Not started", tone: "idle" }
  const lag = progressLag(progressFill(r.start, due, r.started, r.percent), today)
  if (lag <= 0) return { label: lag < -1 ? "Ahead" : "On pace", tone: "good" }
  return { label: "Behind pace", tone: "warn" }
}

export function TimelineView() {
  const { data, today, now, editProject } = useApp()
  const [showFinished, setShowFinished] = useState(false)
  const [preview, setPreview] = useState<{ id: string; date: string } | null>(null)

  const health = projectHealth(data, today)
  const rows: Row[] = health.map((h) => ({
    project: h.project,
    start: h.project.assignedDate,
    end: h.project.dueDate,
    started: projectStartedDate(h.project.id, data),
    finished: null,
    percent: h.percent,
    logged: h.logged,
    remaining: h.remaining,
  }))
  if (showFinished) {
    for (const p of data.projects.filter((x) => x.completedDate)) {
      rows.push({
        project: p,
        start: p.assignedDate,
        end: p.dueDate,
        started: projectStartedDate(p.id, data),
        finished: p.completedDate,
        percent: 100,
        logged: projectLogged(p.id, data.tasks, data.logs, data.events),
        remaining: null,
      })
    }
  }
  rows.sort((a, b) => a.end.localeCompare(b.end))

  const rangeStart = addDays(rows.reduce((m, r) => (r.start < m ? r.start : m), today), -1)
  const rangeEnd = addDays(rows.reduce((m, r) => (r.end > m ? r.end : m), addDays(today, 7)), 2)
  const { days: totalDays, step: labelEvery, labels: ticks, grid: gridDates } = timelineTicks(rangeStart, rangeEnd)
  const x = (date: string, frac = 0) => ((daysBetween(rangeStart, date) + frac) / totalDays) * 100
  const todayX = x(today, now.minute / 1440)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-tight">Timeline</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Assignments from assigned date to due date. Drag a bar’s right edge to change its due date, or use the date field.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showFinished} onCheckedChange={(v) => setShowFinished(Boolean(v))} />
            Show finished
          </label>
          <Button size="sm" onClick={() => editProject("new")}>
            <Plus /> New assignment
          </Button>
        </div>
      </header>

      <section className="overflow-x-auto rounded-2xl border bg-card">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[220px_minmax(0,1fr)] border-b">
            <div className="px-4 py-2 text-xs text-muted-foreground">Assignment</div>
            <div className="relative h-9">
              {gridDates.map((d) => <span key={d} className="absolute inset-y-0 w-px bg-border" style={{ left: `${x(d)}%` }} />)}
              {ticks.map((d) => {
                const date = fromDateKey(d)
                return (
                  <div key={d} className="absolute inset-y-0" style={{ left: `${x(d)}%`, width: `${labelEvery * 100 / totalDays}%` }}>
                    {(
                      <span
                        className={cn(
                          "absolute top-1/2 left-1/2 -translate-1/2 text-[10px] whitespace-nowrap tabular-nums",
                          d === today ? "font-semibold text-primary" : "text-muted-foreground",
                        )}
                      >
                        {labelEvery === 1 ? date.getDate() : totalDays > 366 ? date.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : monthDay(d)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No assignments yet. Add one to see it here.</p>
          ) : (
            rows.map((r) => {
              const due = preview?.id === r.project.id ? preview.date : r.end
              const status = rowStatus(r, due, today)
              const fill = progressFill(r.start, due, r.started, r.percent)
              if (r.finished) fill.length = Math.min(fill.span, Math.max(0.5, daysBetween(fill.origin, addDays(r.finished, 1))))
              const fillLeft = x(fill.origin)
              const fillWidth = x(fill.origin, fill.length) - fillLeft
              const labelInside = fillWidth >= 4
              return (
              <div key={r.project.id} className="grid grid-cols-[220px_minmax(0,1fr)] border-b last:border-b-0">
                <div>
                <button
                  onClick={() => editProject(r.project)}
                  className="min-w-0 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
                >
                  <p className="truncate text-sm font-medium">{r.project.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{r.project.course}</span>·<span>{ASSIGNMENT_TYPES[r.project.type]}</span>
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[11px] font-medium",
                      status.tone === "good" && "text-emerald-700",
                      status.tone === "warn" && "text-amber-700",
                      status.tone === "done" && "text-muted-foreground",
                      status.tone === "idle" && "text-sky-700",
                    )}
                  >
                    {status.label}
                    {r.remaining != null && r.remaining > 0 && (
                      <span className="font-normal text-muted-foreground"> · ~{formatDuration(r.remaining)} left</span>
                    )}
                  </p>
                </button>
                <DueDateInput key={`${r.project.id}-${r.project.dueDate}`} project={r.project} previewDate={preview?.id === r.project.id ? preview.date : null} />
                </div>
                <div className="relative min-h-24">
                  {gridDates.map((d) => <span key={d} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${x(d)}%` }} />)}
                  <div
                    className={cn("absolute top-1/2 h-7 -translate-y-1/2 rounded-lg", status.tone === "done" && !r.remaining && "opacity-60")}
                    style={{
                      left: `${x(r.start)}%`,
                      width: `${Math.max(0, Math.min(100, x(addDays(due, 1))) - x(r.start))}%`,
                      backgroundColor: `${r.project.color}26`,
                      boxShadow: `inset 0 0 0 1px ${r.project.color}55`,
                    }}
                    title={`Assigned ${monthDay(r.start)} · due ${monthDay(r.end)}`}
                  />
                  {fill.length > 0 && (
                    <div
                      className="absolute top-1/2 flex h-7 -translate-y-1/2 items-center justify-end overflow-hidden rounded-lg pr-2 text-[10px] font-medium text-white"
                      style={{ left: `${fillLeft}%`, width: `${fillWidth}%`, backgroundColor: r.project.color }}
                      title={`${r.started ? `Started ${monthDay(r.started)}` : "No time logged yet"} · ${r.percent}% done · ${formatDuration(r.logged)} logged`}
                    >
                      {labelInside && <span className="truncate">{r.percent}%</span>}
                    </div>
                  )}
                  {!labelInside && (
                    <span
                      className="pointer-events-none absolute top-1/2 -translate-y-1/2 pl-1.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                      style={{ left: `${fillLeft + fillWidth}%` }}
                    >
                      {r.percent}%
                    </span>
                  )}
                  <DueEdge project={r.project} date={due} position={x(addDays(due, 1))} days={totalDays} onPreview={(date) => setPreview((current) => date ? { id: r.project.id, date } : current?.id === r.project.id ? null : current)} />
                  {preview?.id === r.project.id && <span className="absolute top-1 right-2 rounded bg-card px-2 text-xs text-muted-foreground">Due {monthDay(due)}</span>}
                  <span className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${todayX}%` }} aria-hidden />
                </div>
              </div>
              )
            })
          )}
        </div>
      </section>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-primary/15 ring-1 ring-primary/30" /> Assigned → due
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-primary" /> Progress, from the day you started
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-primary" /> Today
        </li>
      </ul>
    </div>
  )
}
