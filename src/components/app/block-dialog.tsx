"use client"

import { useState } from "react"
import { Check, CheckCircle2, Loader2, MessageCircleHeart, Moon, Pencil, RotateCcw, Timer, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { estimateProject, taskLogged } from "@/lib/analytics"
import { Slider } from "@/components/ui/slider"
import { SelectField } from "@/components/ui/select-field"
import { AGENT_NAME } from "@/lib/brand"
import { formatDuration, formatRange, MAX_LOG_MINUTES, monthDay, weekdayShort } from "@/lib/time"
import type { CalendarEvent, Project, TimeLog, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { WeekApi } from "@/hooks/use-week"
import { BlockForm } from "./block-form"
import { useApp } from "./app-shell"
import { recurrenceSummary } from "@/lib/recurrence"
import { PlannedVsActual } from "./block-card"

/** Accepts "2.745", "1:30", "1h 30m", "90m". Returns minutes, or null when unparseable. */
export function parseDuration(input: string, unit: "hr" | "min"): number | null {
  const v = input.trim().toLowerCase()
  if (!v) return null
  const clock = v.match(/^(\d+):(\d{1,2})$/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const hm = v.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?)?$/)
  if (hm && (hm[1] || hm[2])) return Math.round(Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0))
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(unit === "hr" ? n * 60 : n)
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
  if (!event) return null
  const live = data.events.find((e) => e.id === event.id) ?? event
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-lg">
        <BlockBody key={live.id} live={live} data={data} api={api} onOpenChange={onOpenChange} onAskAgent={onAskAgent} />
      </DialogContent>
    </Dialog>
  )
}

function BlockBody({
  live,
  data,
  api,
  onOpenChange,
  onAskAgent,
}: {
  live: CalendarEvent
  data: WeekData
  api: WeekApi
  onOpenChange: (open: boolean) => void
  onAskAgent: (message: string) => void
}) {
  const { editProject } = useApp()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [askProgress, setAskProgress] = useState(false)
  const project = data.projects.find((p) => p.id === live.projectId)
  const task = data.tasks.find((t) => t.id === live.taskId)
  const color = project?.color ?? "#A8A29E"
  const planned = live.endMin - live.startMin
  const logs = task
    ? data.logs.filter((l) => l.taskId === task.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []
  const logged = task ? taskLogged(task.id, data.logs) : 0
  const canLog = live.kind === "work" && live.status !== "skipped"
  const showProgress = project && live.kind === "work"

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    const out = await fn()
    setBusy(null)
    return out
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-t-xl px-5 pt-5 pb-4" style={{ backgroundColor: `${color}1f` }}>
        <DialogHeader>
          <p className="text-xs font-medium tracking-wide uppercase" style={{ color }}>
            {project?.name ?? (live.kind === "work" ? "Focus block" : "Life")}
          </p>
          <DialogTitle className="font-heading text-xl font-medium">{live.title}</DialogTitle>
          <DialogDescription>
            {weekdayShort(live.date)} {monthDay(live.date)} · {formatRange(live.startMin, live.endMin)} ·{" "}
            {formatDuration(planned)}
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="space-y-5 px-5 pb-5">
        <div className="flex flex-wrap gap-2 pt-3">
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}><Pencil />{editing ? "Close editor" : "Edit block"}</Button>
          {project && <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); editProject(project) }}>Edit assignment · due date & estimate</Button>}
        </div>
        {editing && <BlockForm key={`${live.id}-${live.date}-${live.startMin}-${live.endMin}`} event={live} draft={{ date: live.date }} onDone={() => { setEditing(false); onOpenChange(false) }} />}
        {!editing && <>
        {(live.location || live.meetingUrl || live.notes || live.seriesId) && <div className="space-y-1 rounded-md border p-3 text-sm">
          {live.location && <p>{live.location}</p>}
          {live.meetingUrl && <a href={live.meetingUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-primary underline underline-offset-2">Open meeting link</a>}
          {live.notes && <p className="whitespace-pre-wrap text-muted-foreground">{live.notes}</p>}
          {live.seriesId && <p className="text-xs text-muted-foreground">{(() => { const series = data.series.find((s) => s.id === live.seriesId); return series ? recurrenceSummary(series.rule) : "Repeating event" })()}</p>}
        </div>}

        {askProgress && project && !project.completedDate && (
          <ProgressReport
            project={project}
            data={data}
            api={api}
            title={`Task done. How far along is ${project.name} now?`}
            highlight
            onSaved={() => setAskProgress(false)}
          />
        )}

        {task && <section className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">Focused time on this task</p>
          <p className="font-heading text-2xl font-medium tabular-nums">{formatDuration(logged)}</p>
        </section>}

        <section>
          <h3 className="mb-2 text-sm font-medium">This block</h3>
          <PlannedVsActual planned={planned} actual={live.actualMinutes} color={color} />
        </section>

        {canLog && <LogTime event={live} api={api} />}

        {showProgress && !askProgress && <ProgressReport key={`${project.id}-${project.progressPercent}`} project={project} data={data} api={api} />}

        {logs.length > 0 && <ProgressTrail logs={logs} color={color} api={api} />}

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
          {live.status !== "skipped" && (
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
          {task ? (
            <Button
              variant="ghost"
              className="ml-auto"
              disabled={busy !== null}
              onClick={async () => {
                const finishing = !task.done
                const ok = await run("done", () => api.setTaskDone(task.id, finishing))
                if (ok && finishing && project && !project.completedDate) setAskProgress(true)
              }}
            >
              {busy === "done" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {task.done ? "Reopen task" : "Mark task done"}
            </Button>
          ) : (
            live.kind === "work" &&
            live.status !== "completed" && (
              <Button
                variant="ghost"
                className="ml-auto"
                disabled={busy !== null}
                onClick={() => run("done", () => api.updateEvent(live.id, { status: "completed" }, "Marked done"))}
              >
                <CheckCircle2 /> Mark done
              </Button>
            )
          )}
        </div>
        </>}
      </div>
    </>
  )
}

function LogTime({ event, api }: { event: CalendarEvent; api: WeekApi }) {
  const [note, setNote] = useState("")
  const [direction, setDirection] = useState<"add" | "remove">("add")
  const [amount, setAmount] = useState("")
  const [unit, setUnit] = useState<"hr" | "min">("hr")
  const [busy, setBusy] = useState<string | null>(null)
  const planned = event.endMin - event.startMin
  const remainingInBlock = Math.max(0, planned - event.actualMinutes)

  const parsed = parseDuration(amount, unit)
  const maxRemove = event.actualMinutes
  const error =
    amount.trim() === ""
      ? null
      : parsed == null || parsed <= 0
        ? "Enter an amount like 2.75, 1:30 or 1h 30m"
        : parsed > MAX_LOG_MINUTES
          ? `That's more than ${MAX_LOG_MINUTES / 60} hours. Log one stretch at a time`
          : direction === "remove" && parsed > maxRemove
            ? `Only ${formatDuration(maxRemove)} is logged on this block`
            : null

  const log = async (key: string, minutes: number) => {
    setBusy(key)
    const ok = await api.logTime(event.id, minutes, note.trim())
    setBusy(null)
    if (ok) {
      setNote("")
      setAmount("")
    }
  }

  return (
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
          <Button key={m} variant="outline" size="sm" disabled={busy !== null} onClick={() => log(`q${m}`, m)}>
            {busy === `q${m}` && <Loader2 className="animate-spin" />}+{m}m
          </Button>
        ))}
        {remainingInBlock > 0 && remainingInBlock <= MAX_LOG_MINUTES && (
          <Button size="sm" disabled={busy !== null} onClick={() => log("whole", remainingInBlock)}>
            {busy === "whole" && <Loader2 className="animate-spin" />}
            Did the whole block
          </Button>
        )}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (parsed && !error) log("custom", direction === "add" ? parsed : -parsed)
        }}
      >
        <div className="flex rounded-md border p-0.5" role="radiogroup" aria-label="Add or remove time">
          {(["add", "remove"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={direction === d}
              disabled={d === "remove" && maxRemove === 0}
              onClick={() => setDirection(d)}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs capitalize transition-colors disabled:opacity-40",
                direction === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <Input
          aria-label="Custom amount"
          inputMode="decimal"
          placeholder={unit === "hr" ? "2.75" : "40"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 w-24"
        />
        <SelectField label="Unit" value={unit} onValueChange={setUnit} options={[{ value: "hr", label: "hr" }, { value: "min", label: "min" }]} className="h-8 w-20" />
        <Button type="submit" size="sm" variant="outline" disabled={busy !== null || !parsed || Boolean(error)}>
          {busy === "custom" && <Loader2 className="animate-spin" />}
          {direction === "add" ? "Log" : "Take off"}
        </Button>
        {parsed != null && parsed > 0 && !error && (
          <span className="text-xs text-muted-foreground tabular-nums">= {formatDuration(parsed)}</span>
        )}
      </form>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </section>
  )
}

function ProgressTrail({ logs, color, api }: { logs: TimeLog[]; color: string; api: WeekApi }) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">
        Progress trail <span className="font-normal text-muted-foreground">· {logs.length}</span>
      </h3>
      <ol className="max-h-60 space-y-2 overflow-y-auto border-l pr-2 pl-4 [scrollbar-gutter:stable]">
        {logs.map((l) =>
          editing === l.id ? (
            <TrailEditor key={l.id} log={l} api={api} onDone={() => setEditing(null)} />
          ) : (
            <li key={l.id} className="group relative text-sm">
              <span
                className="absolute top-1.5 -left-[21px] size-2 rounded-full ring-2 ring-background"
                style={{ backgroundColor: l.minutes < 0 ? "#A8A29E" : color }}
              />
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium tabular-nums">
                    {l.minutes < 0 ? `−${formatDuration(-l.minutes)}` : formatDuration(l.minutes)}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {weekdayShort(l.createdAt.slice(0, 10))} {monthDay(l.createdAt.slice(0, 10))}
                  </span>
                  {l.note && <p className="text-muted-foreground">“{l.note}”</p>}
                </div>
                <button
                  type="button"
                  aria-label="Edit entry"
                  onClick={() => setEditing(l.id)}
                  className="rounded-sm p-1 text-muted-foreground opacity-60 hover:bg-secondary hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>
            </li>
          ),
        )}
      </ol>
    </section>
  )
}

function TrailEditor({ log, api, onDone }: { log: TimeLog; api: WeekApi; onDone: () => void }) {
  const [minutes, setMinutes] = useState(String(log.minutes))
  const [note, setNote] = useState(log.note)
  const [busy, setBusy] = useState<"save" | "delete" | null>(null)
  const n = Math.round(Number(minutes))
  const valid = Number.isFinite(n) && n !== 0 && Math.abs(n) <= MAX_LOG_MINUTES

  return (
    <li className="space-y-2 rounded-md border bg-background p-2.5">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Minutes"
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="h-8 w-20"
        />
        <span className="text-xs text-muted-foreground">min{valid ? ` (${formatDuration(Math.abs(n))})` : ""}</span>
      </div>
      <Input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} className="h-8" />
      {!valid && <p className="text-xs text-red-700">Between 1 and {MAX_LOG_MINUTES} minutes</p>}
      <div className="flex gap-1.5">
        <Button
          size="sm"
          disabled={!valid || busy !== null}
          onClick={async () => {
            setBusy("save")
            const ok = await api.updateLog(log.id, { minutes: n, note })
            setBusy(null)
            if (ok) onDone()
          }}
        >
          {busy === "save" ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy !== null}>
          <X /> Cancel
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-red-700 hover:text-red-800"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("delete")
            const ok = await api.deleteLog(log.id)
            setBusy(null)
            if (ok) onDone()
          }}
        >
          {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
        </Button>
      </div>
    </li>
  )
}

export function ProgressReport({
  project,
  data,
  api,
  title,
  highlight,
  onSaved,
}: {
  project: Project
  data: WeekData
  api: WeekApi
  title?: string
  highlight?: boolean
  onSaved?: () => void
}) {
  const [value, setValue] = useState(project.progressPercent ?? 0)
  const [saving, setSaving] = useState(false)
  const dirty = value !== (project.progressPercent ?? 0)
  const estimate = estimateProject({ ...project, progressPercent: value }, data)

  return (
    <section className={cn("space-y-3 rounded-lg border bg-background p-4", highlight && "border-primary/40 ring-2 ring-primary/15")}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title ?? `How far along is ${project.name}?`}</h3>
        <span className="font-heading text-lg tabular-nums">{value}%</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={5}
        onValueChange={(v) => setValue(Array.isArray(v) ? v[0] : v)}
        aria-label="Assignment progress"
      />
      <p className="text-xs text-muted-foreground">
        {estimate.uncertain ? (
          estimate.explanation
        ) : (
          <>
            <span className="font-medium text-foreground">~{formatDuration(estimate.remaining)} to go.</span>{" "}
            {estimate.explanation}
          </>
        )}
      </p>
      {(dirty || highlight) && (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={saving || !dirty}
            onClick={async () => {
              setSaving(true)
              const ok = await api.updateProject(project.id, { progressPercent: value, ...(project.completedDate && value < 100 ? { completedDate: null } : {}) }, "Assignment progress saved")
              setSaving(false)
              if (ok) onSaved?.()
            }}
          >
            {saving && <Loader2 className="animate-spin" />}
            {project.completedDate && value < 100 ? "Save progress & reopen" : "Save progress"}
          </Button>
          {highlight && (
            <Button size="sm" variant="ghost" onClick={onSaved}>
              Not now
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
