"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, Check, Lightbulb, Loader2, NotebookPen, RefreshCw, Sparkle, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { backtrack } from "@/lib/analytics"
import { describeChange } from "@/lib/describe"
import { createInsightCache, insightKey } from "@/lib/insights"
import { formatDuration, nowMinutes, weekdayShort } from "@/lib/time"
import type { Reflection, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { request, type WeekApi } from "@/hooks/use-week"

import { PreferenceSwitch } from "./preference-switch"

interface InsightResult {
  key: string
  version: number
  reflection?: Reflection
  error?: string
  applied: Set<number>
}

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
  const key = insightKey(data, today)
  const [result, setResult] = useState<InsightResult | null>(null)
  const [version, setVersion] = useState(0)
  const [applying, setApplying] = useState(false)
  const lastRefresh = useRef(0)
  const current = result?.key === key && result.version === version ? result : null
  const reflection = current?.reflection
  const error = current?.error
  const loading = current === null
  const applied = current?.applied ?? new Set<number>()

  const maxDay = Math.max(1, ...stats.byDay.map((d) => Math.max(d.planned, d.actual)))

  useEffect(() => {
    if (!data.settings.todayInsightsEnabled) return
    let active = true
    const fresh = version !== lastRefresh.current
    lastRefresh.current = version
    loadInsights(key, today, fresh).then(
      (reflection) => {
        if (active) setResult({ key, version, reflection, applied: new Set() })
      },
      (err) => {
        if (active) setResult({ key, version, error: err instanceof Error ? err.message : "Couldn't load insights", applied: new Set() })
      },
    )
    return () => { active = false }
  }, [key, today, version, data.settings.todayInsightsEnabled])

  const refresh = () => setVersion((value) => value + 1)

  return (
    <section className={cn("space-y-4", className)} aria-labelledby="reflect-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="reflect-heading" className="font-heading text-2xl font-medium tracking-tight">
          Looking back
        </h2>
        <span className="text-xs text-muted-foreground">
          {weekdayShort(stats.windowStart)} – {weekdayShort(stats.windowEnd)}
        </span>
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

      <PreferenceSwitch setting="todayInsightsEnabled">Show Tilly insights</PreferenceSwitch>
      {data.settings.todayInsightsEnabled && <>
      <div className="flex items-center justify-between pt-1">
        <h2 id="insights-heading" className="font-heading text-2xl font-medium tracking-tight">
          Insights
        </h2>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} aria-label="Refresh insights">
          <RefreshCw className={cn(loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {loading && !reflection && (
        <div className="space-y-3 rounded-lg border bg-card p-4" aria-busy>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading between the blocks…
          </p>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-dashed p-4">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {reflection && (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-50")} aria-labelledby="insights-heading">
          <div className="rounded-lg border bg-card p-3.5">
            <p className="font-medium leading-snug">{reflection.headline}</p>
            <p className="mt-1 text-sm text-muted-foreground">{reflection.summary}</p>
          </div>

          {reflection.habits.map((h, i) => (
            <div key={i} className="flex gap-3 rounded-lg border bg-card p-3.5">
              <Sparkle className="mt-0.5 size-4 shrink-0 text-sky-600" />
              <div>
                <p className="text-sm font-medium">{h.title}</p>
                <p className="text-sm text-muted-foreground">{h.detail}</p>
              </div>
            </div>
          ))}

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
                          disabled={loading || applying || applied.has(i)}
                          onClick={async () => {
                            setApplying(true)
                            try {
                              const ok = await api.applyChanges([s.change!], "Shift applied")
                              if (ok) setResult((prev) => prev?.key === key && prev.version === version
                                ? { ...prev, applied: new Set(prev.applied).add(i) }
                                : prev)
                            } finally {
                              setApplying(false)
                            }
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

          <p className="text-xs text-muted-foreground">
            {reflection.source === "gemini" ? "Compiled by Gemini" : "Compiled locally (demo mode)"}
          </p>
        </div>
      )}
      </>}
    </section>
  )
}

const insightCache = createInsightCache()

/** Shared across the panel's desktop and mobile instances so one page load is one request. */
function loadInsights(key: string, today: string, fresh = false) {
  return insightCache.load(key, () => request<Reflection>("/api/reflect", {
    method: "POST", body: JSON.stringify({ today, minute: nowMinutes(new Date()) }),
  }), fresh)
}
