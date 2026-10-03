"use client"

import { CalendarClock } from "lucide-react"
import { projectHealth, type Pace } from "@/lib/analytics"
import { formatDuration } from "@/lib/time"
import type { WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"

const PACE_COPY: Record<Pace, { label: string; className: string }> = {
  done: { label: "Target reached", className: "bg-emerald-100 text-emerald-800" },
  ahead: { label: "Fully scheduled", className: "bg-teal-100 text-teal-800" },
  "on-track": { label: "Steady", className: "bg-sky-100 text-sky-800" },
  behind: { label: "Needs a little room", className: "bg-amber-100 text-amber-800" },
}

export function ProjectRail({ data, today, className }: { data: WeekData; today: string; className?: string }) {
  const health = projectHealth(data, today)
  return (
    <section className={cn("space-y-3", className)} aria-labelledby="projects-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="projects-heading" className="font-heading text-lg font-medium">
          Active projects
        </h2>
        <span className="text-xs text-muted-foreground">{health.length} in motion</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {health.map((h) => {
          const pace = PACE_COPY[h.pace]
          return (
            <article
              key={h.project.id}
              className="min-w-[240px] rounded-2xl border bg-card p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] lg:min-w-0"
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: h.project.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">{h.project.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="size-3" />
                    {h.daysLeft === 0 ? "Due today" : `Due in ${h.daysLeft} day${h.daysLeft === 1 ? "" : "s"}`}
                  </p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", pace.className)}>
                  {pace.label}
                </span>
              </div>
              <WaveBar percent={h.percent} color={h.project.color} className="mt-4" />
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Done</dt>
                  <dd className="font-medium tabular-nums">{formatDuration(h.logged)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">To go</dt>
                  <dd className="font-medium tabular-nums">{formatDuration(h.remaining)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Booked</dt>
                  <dd className="font-medium tabular-nums">{formatDuration(h.scheduledAhead)}</dd>
                </div>
              </dl>
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
          className="absolute inset-y-0 left-0 h-full w-[200%] opacity-35 motion-safe:animate-[ebb-wave_6s_ease-in-out_infinite]"
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
