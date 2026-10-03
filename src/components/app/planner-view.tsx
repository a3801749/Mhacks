"use client"

import { useEffect, useRef, useState } from "react"
import { CalendarPlus, MousePointerClick } from "lucide-react"
import { Button } from "@/components/ui/button"
import { addDays, formatClock, formatRange, monthDay, weekdayShort } from "@/lib/time"
import type { CalendarEvent } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"
import { PlanDialog, type DraftBlock } from "./plan-dialog"

const START_HOUR = 6
const END_HOUR = 24
const HOUR_PX = 44
const snap = (min: number) => Math.round(min / 15) * 15

export function PlannerView() {
  const { data, today, now, openBlock } = useApp()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const [drag, setDrag] = useState<{ date: string; a: number; b: number } | null>(null)
  const [block, setBlock] = useState<DraftBlock | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: (9 - START_HOUR) * HOUR_PX })
  }, [])

  const minuteAt = (e: React.PointerEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
    return snap(START_HOUR * 60 + (y / HOUR_PX) * 60)
  }

  const onDown = (date: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-event]")) return
    if (e.pointerType === "touch") {
      touchStart.current = { x: e.clientX, y: e.clientY }
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const m = minuteAt(e, e.currentTarget)
    setDrag({ date, a: m, b: m + 15 })
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    setDrag({ ...drag, b: minuteAt(e, e.currentTarget) })
  }

  const onUp = (date: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      const s = touchStart.current
      touchStart.current = null
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) {
        const m = minuteAt(e, e.currentTarget)
        setBlock({ date, startMin: Math.min(m, END_HOUR * 60 - 60), endMin: Math.min(m + 60, END_HOUR * 60) })
      }
      return
    }
    if (!drag) return
    let start = Math.min(drag.a, drag.b)
    let end = Math.max(drag.a, drag.b)
    if (end - start < 30) end = start + 60
    end = Math.min(end, END_HOUR * 60)
    start = Math.min(start, end - 15)
    setDrag(null)
    setBlock({ date, startMin: start, endMin: end })
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-tight">Plan your week</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MousePointerClick className="size-4" />
            <span>
              <span className="hidden sm:inline">Drag across a day to block out time</span>
              <span className="sm:hidden">Tap a time to block it out</span>
              {data.settings.aiPlannerEnabled ? " — Tilly will suggest how to split it across your tasks." : "."}
            </span>
          </p>
        </div>
        <Button onClick={() => setBlock({ date: addDays(today, 1), startMin: 13 * 60, endMin: 17 * 60 })}>
          <CalendarPlus /> Plan a block
        </Button>
      </header>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b">
              <div />
              {days.map((d) => {
                const work = data.events.filter((e) => e.date === d && e.kind === "work" && e.status !== "skipped")
                const mins = work.reduce((s, e) => s + e.endMin - e.startMin, 0)
                return (
                  <div key={d} className={cn("border-l px-2 py-2 text-center", d === today && "bg-accent/60")}>
                    <p className={cn("text-[11px] uppercase tracking-wide text-muted-foreground", d === today && "text-primary")}>
                      {d === today ? "Today" : weekdayShort(d)}
                    </p>
                    <p className="font-heading text-lg leading-tight">{monthDay(d).split(" ")[1]}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {mins ? `${Math.round((mins / 60) * 10) / 10}h booked` : "open"}
                    </p>
                  </div>
                )
              })}
            </div>

            <div ref={scrollRef} className="max-h-[68dvh] overflow-y-auto">
              <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]">
                <div className="relative" style={{ height: hours.length * HOUR_PX }}>
                  {hours.map((h) => (
                    <span
                      key={h}
                      className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                      style={{ top: (h - START_HOUR) * HOUR_PX }}
                    >
                      {h === START_HOUR ? "" : formatClock(h * 60)}
                    </span>
                  ))}
                </div>
                {days.map((d) => {
                  const events = data.events.filter(
                    (e) => e.date === d && e.endMin > START_HOUR * 60 && e.startMin < END_HOUR * 60,
                  )
                  const draft = drag?.date === d ? drag : null
                  return (
                    <div
                      key={d}
                      className={cn("relative cursor-crosshair touch-pan-y border-l select-none", d === today && "bg-accent/30")}
                      style={{ height: hours.length * HOUR_PX }}
                      onPointerDown={onDown(d)}
                      onPointerMove={onMove}
                      onPointerUp={onUp(d)}
                    >
                      {hours.map((h) => (
                        <span
                          key={h}
                          className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                          style={{ top: (h - START_HOUR) * HOUR_PX }}
                        />
                      ))}
                      {d === today && now.minute >= START_HOUR * 60 && (
                        <>
                          <span
                            className="pointer-events-none absolute inset-x-0 top-0 bg-muted/60"
                            style={{ height: ((now.minute - START_HOUR * 60) / 60) * HOUR_PX }}
                          />
                          <span
                            className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-primary"
                            style={{ top: ((now.minute - START_HOUR * 60) / 60) * HOUR_PX }}
                          />
                        </>
                      )}
                      {events.map((e) => (
                        <GridEvent key={e.id} event={e} onOpen={() => openBlock(e)} />
                      ))}
                      {draft && (
                        <div
                          className="pointer-events-none absolute inset-x-1 z-20 rounded-lg border-2 border-dashed border-primary bg-primary/10 px-1.5 py-1 text-[11px] font-medium text-primary"
                          style={{
                            top: ((Math.min(draft.a, draft.b) - START_HOUR * 60) / 60) * HOUR_PX,
                            height: Math.max(15, Math.abs(draft.b - draft.a)) * (HOUR_PX / 60),
                          }}
                        >
                          {formatRange(Math.min(draft.a, draft.b), Math.max(draft.a, draft.b, Math.min(draft.a, draft.b) + 15))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PlanDialog block={block} onClose={() => setBlock(null)} days={days} />
    </div>
  )
}

function GridEvent({ event, onOpen }: { event: CalendarEvent; onOpen: () => void }) {
  const { data } = useApp()
  const project = data.projects.find((p) => p.id === event.projectId)
  const color = project?.color ?? "#A8A29E"
  const top = ((Math.max(event.startMin, START_HOUR * 60) - START_HOUR * 60) / 60) * HOUR_PX
  const height = Math.max(18, ((Math.min(event.endMin, END_HOUR * 60) - Math.max(event.startMin, START_HOUR * 60)) / 60) * HOUR_PX - 2)
  return (
    <button
      data-event
      onClick={onOpen}
      className={cn(
        "absolute inset-x-1 z-10 overflow-hidden rounded-lg px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow hover:shadow-md",
        event.status === "skipped" && "opacity-45",
      )}
      style={{ top, height, backgroundColor: `${color}2e`, borderLeft: `3px solid ${color}` }}
    >
      <span className={cn("block truncate font-medium", event.status === "skipped" && "line-through")}>{event.title}</span>
      {height > 30 && <span className="block truncate text-muted-foreground">{formatRange(event.startMin, event.endMin)}</span>}
    </button>
  )
}
