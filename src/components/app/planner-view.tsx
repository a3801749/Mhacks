"use client"

import { useEffect, useRef, useState } from "react"
import { CalendarPlus, GripVertical, MousePointerClick } from "lucide-react"
import { Button } from "@/components/ui/button"
import { eventLanes, movedWindow, resizedWindow } from "@/lib/grid-editing"
import { bookedMinutes } from "@/lib/day-layout"
import { PreferenceSwitch } from "./preference-switch"
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
  const { data, today, now, openBlock, api } = useApp()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const [drag, setDrag] = useState<{ date: string; a: number; b: number } | null>(null)
  const [block, setBlock] = useState<DraftBlock | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const columns = useRef(new Map<string, HTMLDivElement>())
  const gesture = useRef<{ event: CalendarEvent; mode: "move" | "resize"; x: number; y: number; offset: number; moved: boolean } | null>(null)
  const [preview, setPreview] = useState<CalendarEvent | null>(null)
  const previewRef = useRef<CalendarEvent | null>(null)
  const suppressClick = useRef<string | null>(null)

  const beginEdit = (event: CalendarEvent, mode: "move" | "resize", e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    gridRef.current?.setPointerCapture(e.pointerId)
    const rect = columns.current.get(event.date)!.getBoundingClientRect()
    const minute = START_HOUR * 60 + (e.clientY - rect.top) * 60 / HOUR_PX
    gesture.current = { event, mode, x: e.clientX, y: e.clientY, offset: minute - event.startMin, moved: false }
    previewRef.current = null
  }
  const moveEdit = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return
    g.moved = true
    const closest = days.reduce((best, d) => {
      const rect = columns.current.get(d)!.getBoundingClientRect()
      const distance = Math.max(rect.left - e.clientX, e.clientX - rect.right, 0)
      return distance < best.distance ? { date: d, distance } : best
    }, { date: g.event.date, distance: Infinity })
    const rect = columns.current.get(closest.date)!.getBoundingClientRect()
    const window = g.mode === "move" ? movedWindow(g.event, closest.date, START_HOUR * 60 + (e.clientY - rect.top) * 60 / HOUR_PX, g.offset)
      : resizedWindow(g.event, (e.clientY - g.y) * 60 / HOUR_PX)
    const next = { ...g.event, ...window }
    previewRef.current = next
    setPreview(next)
  }
  const finishEdit = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    gesture.current = null
    const next = previewRef.current
    if (g.moved) {
      suppressClick.current = g.event.id
      // Consume the synthetic click from this drag, then allow the next real click.
      setTimeout(() => { if (suppressClick.current === g.event.id) suppressClick.current = null }, 0)
    }
    previewRef.current = null
    setPreview(null)
    if (gridRef.current?.hasPointerCapture(e.pointerId)) gridRef.current.releasePointerCapture(e.pointerId)
    if (next && (next.date !== g.event.date || next.startMin !== g.event.startMin || next.endMin !== g.event.endMin)) {
      api.updateEvent(g.event.id, { date: next.date, startMin: next.startMin, endMin: next.endMin }, g.event.seriesId ? "This occurrence updated" : "Block updated")
    }
  }
  const cancelEdit = () => { gesture.current = null; previewRef.current = null; setPreview(null); setDrag(null); touchStart.current = null }


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: (9 - START_HOUR) * HOUR_PX })
  }, [])

  const minuteAt = (e: React.PointerEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
    return snap(START_HOUR * 60 + (y / HOUR_PX) * 60)
  }

  const onDown = (date: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-event]")) return
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
          <h1 className="font-heading text-3xl font-medium tracking-tight">Your Week</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MousePointerClick className="size-4" />
            <span>
              <span className="hidden sm:inline">Drag empty space to add a block. Drag a block to move it; use its lower edge to resize.</span>
              <span className="sm:hidden">Tap to add or edit. Drag a block’s grip to move it.</span>

            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
        <PreferenceSwitch setting="aiPlannerEnabled">Tilly suggestions</PreferenceSwitch>
        <Button onClick={() => setBlock({ date: addDays(today, 1), startMin: 13 * 60, endMin: 17 * 60 })}>
          <CalendarPlus /> Add a block
        </Button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b">
              <div />
              {days.map((d) => {
                const mins = bookedMinutes(data.events, d)
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
              <div ref={gridRef} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]" onPointerMove={moveEdit} onPointerUp={finishEdit} onPointerCancel={cancelEdit}>
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
                  const lanes = eventLanes(events, 30 * 60 / HOUR_PX)
                  const draft = drag?.date === d ? drag : null
                  return (
                    <div
                      key={d}
                      ref={(el) => { if (el) columns.current.set(d, el); else columns.current.delete(d) }}
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
                        <GridEvent key={e.id} event={e} lane={lanes.get(e.id)} dimmed={preview?.id === e.id} onEdit={beginEdit} onOpen={() => {
                          if (suppressClick.current === e.id) { suppressClick.current = null; return }
                          suppressClick.current = null
                          openBlock(e)
                        }} onKeyMove={(key, resize) => {
                          const patch = resize ? resizedWindow(e, key === "ArrowDown" ? 15 : -15)
                            : movedWindow(e, key === "ArrowLeft" ? addDays(e.date, -1) : key === "ArrowRight" ? addDays(e.date, 1) : e.date, e.startMin + (key === "ArrowUp" ? -15 : key === "ArrowDown" ? 15 : 0))
                          api.updateEvent(e.id, patch, e.seriesId ? "This occurrence updated" : "Block updated")
                        }} />
                      ))}
                      {preview?.date === d && <GridEvent event={preview} ghost onOpen={() => {}} />}
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

      <PlanDialog block={block} onClose={() => setBlock(null)} />
    </div>
  )
}

function GridEvent({ event, onOpen, onEdit, onKeyMove, lane, dimmed, ghost }: {
  event: CalendarEvent; onOpen: () => void;
  onEdit?: (event: CalendarEvent, mode: "move" | "resize", e: React.PointerEvent) => void;
  onKeyMove?: (key: string, resize: boolean) => void;
  lane?: { lane: number; lanes: number }; dimmed?: boolean; ghost?: boolean
}) {
  const { data } = useApp()
  const project = data.projects.find((p) => p.id === event.projectId)
  const color = project?.color ?? "#A8A29E"
  const top = ((Math.max(event.startMin, START_HOUR * 60) - START_HOUR * 60) / 60) * HOUR_PX
  const height = Math.max(28, ((Math.min(event.endMin, END_HOUR * 60) - Math.max(event.startMin, START_HOUR * 60)) / 60) * HOUR_PX - 2)
  const left = lane ? `calc(${lane.lane / lane.lanes * 100}% + 3px)` : "4px"
  const width = lane ? `calc(${100 / lane.lanes}% - 6px)` : "calc(100% - 8px)"
  return <div data-event className={cn("absolute z-10 rounded-md border-l-[3px] text-[11px] leading-tight", event.status === "skipped" && "opacity-45", dimmed && "opacity-25", ghost && "pointer-events-none z-20 ring-2 ring-primary")}
    style={{ top, height, left, width, backgroundColor: `${color}2e`, borderLeftColor: color }}>
    <button type="button" onClick={onOpen} onPointerDown={(e) => { if (e.pointerType !== "touch") onEdit?.(event, "move", e) }}
      aria-label={`${event.title}, ${formatRange(event.startMin, event.endMin)}. Open to edit.`}
      title={`${event.title} · ${formatRange(event.startMin, event.endMin)}${event.seriesId ? " · Drag edits this occurrence" : ""}`}
      className="h-full w-full overflow-hidden rounded-md px-1.5 py-1 pr-6 text-left outline-none hover:ring-1 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary">
      <span className={cn("block truncate font-medium", event.status === "skipped" && "line-through")}>{event.title}</span>
      {height > 40 && <span className="block truncate text-muted-foreground">{formatRange(event.startMin, event.endMin)}</span>}
    </button>
    {!ghost && <>
      <button type="button" aria-label={`Move ${event.title}. Arrow keys change time or day.`} title="Drag to move; arrow keys change time or day" onPointerDown={(e) => onEdit?.(event, "move", e)} onKeyDown={(e) => { if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); onKeyMove?.(e.key, false) } }} className="absolute top-0 right-0 flex size-6 touch-none cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-card focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"><GripVertical className="size-3.5" /></button>
      <button type="button" aria-label={`Resize ${event.title}. Up and down arrows change duration.`} title="Drag lower edge to resize" onPointerDown={(e) => onEdit?.(event, "resize", e)} onKeyDown={(e) => { if (["ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); onKeyMove?.(e.key, true) } }} className="absolute right-1 bottom-0 left-1 flex h-2 touch-none cursor-ns-resize items-center justify-center rounded-sm hover:bg-card/80 focus-visible:ring-2 focus-visible:ring-primary"><span className="h-0.5 w-4 rounded bg-foreground/35" /></button>
    </>}
  </div>
}
