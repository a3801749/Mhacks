"use client"

import { ArrowRightLeft, Check, CircleDashed, Coffee, Moon, Sparkles } from "lucide-react"
import { taskLogged } from "@/lib/analytics"
import { formatClock, formatDuration, formatRange, weekdayShort } from "@/lib/time"
import type { CalendarEvent, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_META = {
  completed: { label: "Done", icon: Check, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  partial: { label: "Partly", icon: CircleDashed, className: "bg-amber-50 text-amber-700 ring-amber-200" },
  skipped: { label: "Didn't happen", icon: Moon, className: "bg-stone-100 text-stone-600 ring-stone-200" },
  planned: { label: "Planned", icon: Sparkles, className: "bg-sky-50 text-sky-700 ring-sky-200" },
} as const

export function BlockCard({
  event,
  data,
  isNow,
  isPast,
  onOpen,
}: {
  event: CalendarEvent
  data: WeekData
  isNow: boolean
  isPast: boolean
  onOpen: () => void
}) {
  const project = data.projects.find((p) => p.id === event.projectId)
  const task = data.tasks.find((t) => t.id === event.taskId)
  const color = project?.color ?? "#A8A29E"
  const planned = event.endMin - event.startMin
  const logged = task ? taskLogged(task.id, data.logs) : 0
  const taskPct = task ? Math.min(100, Math.round((logged / task.estimateMinutes) * 100)) : 0
  const status = isNow && event.status === "planned" ? null : STATUS_META[event.status]
  const showActual = event.status !== "planned"
  const Icon = event.kind === "life" ? Coffee : null

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border bg-card p-4 text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        isNow && "border-primary/50 shadow-md ring-1 ring-primary/20",
        event.status === "skipped" && "bg-card/60",
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} aria-hidden />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            {formatRange(event.startMin, event.endMin)}
            <span aria-hidden>·</span>
            {formatDuration(planned)}
          </p>
          <h3
            className={cn(
              "mt-1 flex items-center gap-1.5 font-medium leading-snug",
              event.status === "skipped" && "text-muted-foreground line-through decoration-stone-300",
            )}
          >
            {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{event.title}</span>
          </h3>
          {project && <p className="mt-0.5 truncate text-xs text-muted-foreground">{project.name}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isNow && event.status === "planned" ? (
            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 rounded-full bg-white motion-safe:animate-[breathe_2s_ease-in-out_infinite]" />
                <span className="relative size-1.5 rounded-full bg-white" />
              </span>
              Now
            </span>
          ) : (
            status && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                  status.className,
                )}
              >
                <status.icon className="size-3" />
                {status.label}
              </span>
            )
          )}
          {event.movedFromDate && event.movedFromStartMin != null && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <ArrowRightLeft className="size-3" />
              from {weekdayShort(event.movedFromDate)} {formatClock(event.movedFromStartMin)}
            </span>
          )}
        </div>
      </div>

      {(showActual || task) && (
        <div className="mt-3 space-y-2 pl-1">
          {showActual && (
            <PlannedVsActual planned={planned} actual={event.actualMinutes} color={color} />
          )}
          {task && !isPast && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${taskPct}%`, backgroundColor: color }} />
              </div>
              <span className="tabular-nums">
                {formatDuration(logged)} / {formatDuration(task.estimateMinutes)} on task
              </span>
            </div>
          )}
        </div>
      )}
    </button>
  )
}

export function PlannedVsActual({ planned, actual, color }: { planned: number; actual: number; color: string }) {
  const max = Math.max(planned, actual, 1)
  return (
    <div className="space-y-1 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="w-12">Planned</span>
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            className="h-full rounded-full border border-dashed"
            style={{ width: `${(planned / max) * 100}%`, borderColor: color }}
          />
        </div>
        <span className="w-12 text-right tabular-nums">{formatDuration(planned)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12">Actual</span>
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: `${(actual / max) * 100}%`, backgroundColor: color }} />
        </div>
        <span className="w-12 text-right font-medium text-foreground tabular-nums">{formatDuration(actual)}</span>
      </div>
    </div>
  )
}
