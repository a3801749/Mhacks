"use client"

import { CalendarClock, Plus, Settings2, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ASSIGNMENT_TYPES } from "@/lib/brand"
import { projectHealth, type Pace } from "@/lib/analytics"
import { formatDuration } from "@/lib/time"
import type { Project, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"

const PACE_COPY: Record<Pace, { label: string; className: string }> = {
  done: { label: "Wrapped up", className: "bg-emerald-100 text-emerald-800" },
  ahead: { label: "Fully scheduled", className: "bg-teal-100 text-teal-800" },
  "on-track": { label: "Steady", className: "bg-sky-100 text-sky-800" },
  behind: { label: "Needs a little room", className: "bg-amber-100 text-amber-800" },
}

export function ProjectRail({
  data,
  today,
  className,
  onEdit,
}: {
  data: WeekData
  today: string
  className?: string
  onEdit?: (p: Project | "new") => void
}) {
  const health = projectHealth(data, today)
  return (
    <section className={cn("space-y-3", className)} aria-labelledby="projects-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="projects-heading" className="font-heading text-lg font-medium">
          Assignments
        </h2>
        {onEdit ? (
          <Button variant="ghost" size="sm" onClick={() => onEdit("new")}>
            <Plus /> New
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{health.length} in motion</span>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {health.map((h) => {
          const pace = PACE_COPY[h.pace]
          return (
            <article
              key={h.project.id}
              className="group min-w-[250px] rounded-2xl border bg-card p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] lg:min-w-0"
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: h.project.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">
                    {onEdit ? (
                      <button
                        type="button"
                        onClick={() => onEdit(h.project)}
                        className="max-w-full truncate text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {h.project.name}
                      </button>
                    ) : (
                      h.project.name
                    )}
                  </h3>
                  <p className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                      {h.project.course}
                    </span>
                    <span className="rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {ASSIGNMENT_TYPES[h.project.type]}
                    </span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="size-3" />
                    {h.daysLeft === 0 ? "Due today" : `Due in ${h.daysLeft} day${h.daysLeft === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", pace.className)}>
                    {pace.label}
                  </span>
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Edit ${h.project.name}`}
                      onClick={() => onEdit(h.project)}
                      className="text-muted-foreground"
                    >
                      <Settings2 />
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <WaveBar percent={h.percent} color={h.project.color} className="flex-1" />
                <span className="w-9 text-right text-xs tabular-nums">{h.percent}%</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Done</dt>
                  <dd className="font-medium tabular-nums">{formatDuration(h.logged)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Est. to go</dt>
                  <dd className="font-medium tabular-nums">{formatDuration(h.remaining)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Booked</dt>
                  <dd className="font-medium tabular-nums">{formatDuration(h.scheduledAhead)}</dd>
                </div>
              </dl>
              <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <TrendingUp className="mt-px size-3 shrink-0" />
                {h.estimate.explanation}
              </p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function WaveBar({ percent, color, className }: { percent: number; color: string; className?: string }) {
  return (
    <div
      className={cn("relative h-2.5 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="relative h-full overflow-hidden rounded-full transition-[width] duration-700"
        style={{ width: `${Math.max(percent, 3)}%`, backgroundColor: color }}
      >
        <svg
          className="absolute inset-y-0 left-0 h-full w-[200%] opacity-35 motion-safe:animate-[wave_6s_ease-in-out_infinite]"
          viewBox="0 0 200 10"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0 5 Q 12.5 0 25 5 T 50 5 T 75 5 T 100 5 T 125 5 T 150 5 T 175 5 T 200 5 V10 H0 Z" fill="white" />
        </svg>
      </div>
    </div>
  )
}
