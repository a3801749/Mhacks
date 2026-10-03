"use client"

import { useState } from "react"
import { AlertCircle, Lightbulb, Sparkle } from "lucide-react"
import {
  categoryLabel,
  categoryStats,
  groupKey,
  rhythmBins,
  rhythmInsights,
  sessions,
  windDownByDay,
  type RhythmGroupBy,
} from "@/lib/analytics"
import { addDays, formatClock, formatDuration, monthDay, weekdayShort } from "@/lib/time"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"

const RANGES = [
  { days: 7, label: "Week" },
  { days: 28, label: "Month" },
] as const

const GROUPS: { key: RhythmGroupBy; label: string }[] = [
  { key: "project", label: "Assignment" },
  { key: "course", label: "Course" },
  { key: "type", label: "Type" },
]

export function RhythmView() {
  const { data, today } = useApp()
  const [days, setDays] = useState<7 | 28>(7)
  const [by, setBy] = useState<RhythmGroupBy>("course")
  const from = addDays(today, -days + 1)
  const list = sessions(data, from, today)
  const { bins, legend } = rhythmBins(list, data, by)
  const colorOf = new Map(legend.map((l) => [l.key, l.color]))
  const labelOf = new Map(legend.map((l) => [l.key, l.label]))
  const max = Math.max(30, ...bins.map((b) => b.total))
  const total = list.reduce((s, x) => s + x.minutes, 0)
  const insights = rhythmInsights(data, today, days)
  const windDown = new Map(windDownByDay(list).map((w) => [w.date, w.end]))
  const categories = categoryStats(data).filter((c) => c.course)
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -i))

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-tight">Your rhythm</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Like screen time, but for your work: when in the day each project actually happens.{" "}
            <span className="font-medium text-foreground">{formatDuration(total)}</span> logged in the last{" "}
            {days === 7 ? "week" : "month"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented options={RANGES.map((r) => ({ key: r.days, label: r.label }))} value={days} onChange={(v) => setDays(v as 7 | 28)} />
          <Segmented options={GROUPS} value={by} onChange={(v) => setBy(v as RhythmGroupBy)} />
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="when-heading">
            <div className="flex items-baseline justify-between">
              <h2 id="when-heading" className="font-medium">When you work</h2>
              <span className="text-xs text-muted-foreground">minutes per half hour, all {days} days combined</span>
            </div>
            {list.length === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <div className="relative mt-4 h-48">
                  <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
                    {[1, 0.5, 0].map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <span className="w-8 text-right text-[10px] text-muted-foreground tabular-nums">
                          {formatDuration(Math.round(max * f))}
                        </span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-y-0 right-0 left-10 flex items-end gap-px">
                    {bins.map((b) => (
                      <div
                        key={b.slot}
                        className="flex h-full flex-1 flex-col-reverse"
                        title={`${formatClock(b.slot)}–${formatClock(b.slot + 30)} · ${formatDuration(b.total)}${b.parts
                          .map((p) => `\n${labelOf.get(p.key)}: ${formatDuration(p.minutes)}`)
                          .join("")}`}
                      >
                        {b.parts.map((p) => (
                          <div
                            key={p.key}
                            className="w-full first:rounded-b-[2px] last:rounded-t-[3px]"
                            style={{ height: `${(p.minutes / max) * 100}%`, backgroundColor: colorOf.get(p.key) }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <HourAxis className="ml-10" />
                <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                  {legend.map((l) => (
                    <li key={l.key} className="flex items-center gap-1.5 text-xs">
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                      {l.label}
                      <span className="text-muted-foreground tabular-nums">{formatDuration(l.minutes)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="days-heading">
            <div className="flex items-baseline justify-between">
              <h2 id="days-heading" className="font-medium">Day by day</h2>
              <span className="text-xs text-muted-foreground">midnight to midnight · ring marks when you wrapped up</span>
            </div>
            <div className="mt-4 space-y-1">
              {dates.map((date) => {
                const daySessions = list.filter((s) => s.date === date)
                const mins = daySessions.reduce((s, x) => s + x.minutes, 0)
                const end = windDown.get(date)
                const check = data.settings.checkInEnabled ? data.checkIns.find((c) => c.date === date) : undefined
                return (
                  <div key={date} className="flex items-center gap-2">
                    <span className={cn("w-16 shrink-0 text-[11px] text-muted-foreground tabular-nums", days === 28 && "w-14 text-[10px]")}>
                      {date === today ? "Today" : `${weekdayShort(date)} ${monthDay(date).split(" ")[1]}`}
                    </span>
                    <div className={cn("relative flex-1 rounded-full bg-muted/70", days === 7 ? "h-5" : "h-2.5")}>
                      {[6, 12, 18].map((hr) => (
                        <span key={hr} className="absolute inset-y-0 w-px bg-background" style={{ left: `${(hr / 24) * 100}%` }} />
                      ))}
                      {daySessions.map((s, i) => (
                        <span
                          key={i}
                          className="absolute inset-y-0 rounded-full"
                          style={{
                            left: `${(s.start / 1440) * 100}%`,
                            width: `${Math.max(0.6, ((s.end - s.start) / 1440) * 100)}%`,
                            backgroundColor: groupKey(s.projectId, data, by).color,
                          }}
                          title={`${groupKey(s.projectId, data, by).label} · ${formatClock(s.start)}–${formatClock(s.end)}`}
                        />
                      ))}
                      {end != null && end <= 1440 && (
                        <span
                          className={cn(
                            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground/70 bg-background",
                            days === 7 ? "size-3" : "size-2",
                          )}
                          style={{ left: `${(end / 1440) * 100}%` }}
                          title={`Wrapped up ${formatClock(end)}`}
                        />
                      )}
                    </div>
                    <span className="w-12 shrink-0 text-right text-[11px] tabular-nums">{mins ? formatDuration(mins) : "—"}</span>
                    {data.settings.checkInEnabled && (
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tabular-nums",
                          !check && "text-muted-foreground/50",
                          check && check.rating <= 3 && "bg-rose-100 text-rose-700",
                          check && check.rating > 3 && check.rating <= 6 && "bg-amber-100 text-amber-800",
                          check && check.rating > 6 && "bg-emerald-100 text-emerald-800",
                        )}
                        title={check ? `Rated ${check.rating}/10${check.note ? ` — ${check.note}` : ""}` : "No check-in"}
                      >
                        {check ? check.rating : "·"}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <HourAxis className={cn(days === 28 ? "mr-[76px] ml-16" : "mr-[76px] ml-[72px]", !data.settings.checkInEnabled && "mr-14")} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="space-y-2" aria-labelledby="insights-heading">
            <h2 id="insights-heading" className="font-heading text-lg font-medium">What stands out</h2>
            {insights.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                Log a few blocks and patterns will start showing up here.
              </p>
            ) : (
              insights.map((i) => (
                <div key={i.title} className="flex gap-3 rounded-2xl border bg-card p-3.5">
                  {i.tone === "warning" ? (
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  ) : i.tone === "positive" ? (
                    <Sparkle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-sky-600" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{i.title}</p>
                    <p className="text-sm text-muted-foreground">{i.detail}</p>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="rounded-2xl border bg-card p-4" aria-labelledby="accuracy-heading">
            <h2 id="accuracy-heading" className="font-medium">How long things really take</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              From finished assignments. New estimates for the same course and type are adjusted by this.
            </p>
            {categories.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Finish an assignment to start learning.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {categories.map((c) => {
                  const pct = Math.round((c.multiplier - 1) * 100)
                  const maxV = Math.max(c.planned, c.actual)
                  return (
                    <li key={c.key} className="space-y-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="capitalize">{categoryLabel(c)}</span>
                        <span
                          className={cn(
                            "text-xs font-medium tabular-nums",
                            pct > 15 ? "text-amber-700" : pct < -15 ? "text-sky-700" : "text-emerald-700",
                          )}
                        >
                          {pct > 0 ? "+" : ""}
                          {pct}%
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="h-1.5 rounded-full border border-dashed border-primary/50" style={{ width: `${(c.planned / maxV) * 100}%` }} />
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(c.actual / maxV) * 100}%` }} />
                      </div>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        planned {formatDuration(c.planned)} · took {formatDuration(c.actual)} · {c.samples} done
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function HourAxis({ className }: { className?: string }) {
  return (
    <div className={cn("relative mt-1.5 h-4 text-[10px] text-muted-foreground", className)} aria-hidden>
      {[0, 6, 12, 18, 24].map((hr) => (
        <span
          key={hr}
          className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
          style={{ left: `${(hr / 24) * 100}%` }}
        >
          {hr === 0 || hr === 24 ? "12am" : formatClock(hr * 60)}
        </span>
      ))}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="mt-4 flex h-48 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
      No logged time in this range yet.
    </div>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-full border bg-card p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-full px-3 py-1 text-xs transition-colors",
            value === o.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
