"use client"

import { useState } from "react"
import { ArrowRight, Check, Lightbulb, Loader2, NotebookPen, RefreshCw, Sparkles, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { backtrack } from "@/lib/analytics"
import { describeChange } from "@/lib/describe"
import { formatDuration, weekdayShort } from "@/lib/time"
import type { Reflection, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { request, type WeekApi } from "@/hooks/use-week"

export function ReflectPanel({
  data,
  today,
  api,
  className,
}: {
  data: WeekData
  today: string
  api: WeekApi
  className?: string
}) {
  const stats = backtrack(data, today)
  const [reflection, setReflection] = useState<Reflection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<Set<number>>(new Set())

  const followThrough = stats.plannedMinutes ? Math.round((stats.actualMinutes / stats.plannedMinutes) * 100) : 0
  const maxDay = Math.max(1, ...stats.byDay.map((d) => Math.max(d.planned, d.actual)))

  const compile = async () => {
    setLoading(true)
    setError(null)
    try {
      setReflection(await request<Reflection>("/api/reflect", { method: "POST", body: JSON.stringify({ today }) }))
      setApplied(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't compile your reflection")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={cn("space-y-4", className)} aria-labelledby="reflect-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="reflect-heading" className="font-heading text-lg font-medium">
          Looking back
        </h2>
        <span className="text-xs text-muted-foreground">
          {weekdayShort(stats.windowStart)} – {weekdayShort(stats.windowEnd)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Did" value={formatDuration(stats.actualMinutes)} sub={`of ${formatDuration(stats.plannedMinutes)}`} />
        <Stat label="Follow-through" value={`${followThrough}%`} sub="time kept" />
        <Stat
          label="Blocks landed"
          value={`${stats.counts.completed}/${stats.counts.total}`}
          sub={`${stats.counts.partial} partly`}
        />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-3 text-xs font-medium text-muted-foreground">Planned vs. actual, by day</p>
        <div className="flex h-24 items-end gap-2">
          {stats.byDay.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex h-20 w-full items-end justify-center gap-0.5">
                <div
                  className="w-2.5 rounded-t-sm border border-dashed border-primary/50"
                  style={{ height: `${(d.planned / maxDay) * 100}%` }}
                  title={`Planned ${formatDuration(d.planned)}`}
                />
                <div
                  className="w-2.5 rounded-t-sm bg-primary"
                  style={{ height: `${(d.actual / maxDay) * 100}%` }}
                  title={`Actual ${formatDuration(d.actual)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{d.date === today ? "Today" : weekdayShort(d.date)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {(["morning", "afternoon", "evening"] as const).map((bucket) => {
            const b = stats.byTimeOfDay[bucket]
            const pct = b.planned ? Math.round((b.actual / b.planned) * 100) : 0
            return (
              <div key={bucket} className="flex items-center gap-2 text-xs">
                <span className="w-16 capitalize text-muted-foreground">{bucket}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-sky-500" : "bg-amber-400")}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <span className="w-9 text-right tabular-nums">{b.blocks ? `${pct}%` : "—"}</span>
              </div>
            )
          })}
        </div>
      </div>

      {!reflection && !loading && (
        <div className="rounded-2xl border border-dashed bg-card/60 p-4">
          <p className="text-sm">
            Skip the spreadsheet. Let the AI tally what really happened — you do the reflecting.
          </p>
          <Button className="mt-3 w-full" onClick={compile}>
            <Sparkles /> Compile my week
          </Button>
          {error && (
            <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className="space-y-3 rounded-2xl border bg-card p-4" aria-busy>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading between the blocks…
          </p>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {reflection && !loading && (
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <div>
            <p className="font-heading text-lg leading-snug font-medium">{reflection.headline}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{reflection.summary}</p>
          </div>

          {reflection.habits.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Patterns</h3>
              {reflection.habits.map((h, i) => (
                <div key={i} className="rounded-xl bg-secondary/70 p-3">
                  <p className="text-sm font-medium">{h.title}</p>
                  <p className="text-sm text-muted-foreground">{h.detail}</p>
                </div>
              ))}
            </div>
          )}

          {reflection.suggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Suggested shifts</h3>
              {reflection.suggestions.map((s, i) => {
                const d = s.change ? describeChange(s.change, data.events) : null
                return (
                  <div key={i} className="rounded-xl border p-3">
                    <p className="flex items-start gap-2 text-sm font-medium">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" /> {s.title}
                    </p>
                    <p className="mt-1 pl-6 text-sm text-muted-foreground">{s.detail}</p>
                    {s.change && d && (
                      <div className="mt-2 flex items-center justify-between gap-2 pl-6">
                        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                          {d.from && <span className="truncate">{d.from}</span>}
                          {d.from && d.to && <ArrowRight className="size-3 shrink-0" />}
                          {d.to && <span className="truncate font-medium text-foreground">{d.to}</span>}
                        </span>
                        <Button
                          size="sm"
                          variant={applied.has(i) ? "ghost" : "outline"}
                          disabled={applied.has(i)}
                          onClick={async () => {
                            const ok = await api.applyChanges([s.change!], "Shift applied")
                            if (ok) setApplied((prev) => new Set(prev).add(i))
                          }}
                        >
                          {applied.has(i) ? (
                            <>
                              <Check /> Applied
                            </>
                          ) : (
                            "Apply"
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {reflection.questions.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <NotebookPen className="size-3.5" /> For you to sit with
              </h3>
              <ul className="space-y-1.5">
                {reflection.questions.map((q, i) => (
                  <li key={i} className="text-sm italic text-foreground/80">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span>{reflection.source === "gemini" ? "Compiled by Gemini" : "Compiled locally (demo mode)"}</span>
            <Button variant="ghost" size="sm" onClick={compile}>
              <RefreshCw /> Recompile
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-heading text-xl font-medium tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}
