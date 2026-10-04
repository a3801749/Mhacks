"use client"

import { CalendarPlus, Plus, Sun } from "lucide-react"
import { formatClock, formatDuration, monthDay, weekdayLong, weekdayShort } from "@/lib/time"
import type { CalendarEvent, WeekData } from "@/lib/types"
import { addableSlot, bookedMinutes, gapBefore, leadingSlot } from "@/lib/day-layout"
import { cn } from "@/lib/utils"
import { BlockCard } from "./block-card"

/** Vertical scale for the day timeline, so a 2h block reads as twice a 1h block. */
const PX_PER_MIN = 1.1
const MIN_CARD_PX = 84

export function DayStrip({
  data,
  dates,
  today,
  selected,
  onSelect,
}: {
  data: WeekData
  dates: string[]
  today: string
  selected: string
  onSelect: (d: string) => void
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="tablist" aria-label="Days">
      {dates.map((date) => {
        const planned = bookedMinutes(data.events, date)
        const isToday = date === today
        const isSelected = selected === date
        return (
          <button
            key={date}
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(date)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5 transition-colors",
              isSelected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
              isToday && !isSelected && "border-primary/60",
            )}
          >
            <span className={cn("text-[11px] tracking-wide uppercase", !isSelected && "text-muted-foreground")}>
              {isToday ? "Today" : weekdayShort(date)}
            </span>
            <span className="font-heading text-lg leading-none tabular-nums">{Number(date.slice(8))}</span>
            <span className={cn("text-[10px] tabular-nums", !isSelected && "text-muted-foreground")}>
              {planned ? formatDuration(planned) : "open"}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function DayTimeline({
  data,
  date,
  today,
  nowMinute,
  onOpen,
  onAddGap,
}: {
  data: WeekData
  date: string
  today: string
  nowMinute: number
  onOpen: (e: CalendarEvent) => void
  onAddGap?: (slot: { date: string; startMin: number; endMin: number }) => void
}) {
  const events = data.events.filter((e) => e.date === date).sort((a, b) => a.startMin - b.startMin)
  const work = events.filter((e) => e.kind === "work")
  const planned = work.filter((e) => e.status !== "skipped").reduce((s, e) => s + e.endMin - e.startMin, 0)
  const actual = work.reduce((s, e) => s + e.actualMinutes, 0)
  const isPastDay = date < today
  const isToday = date === today
  const canAdd = Boolean(onAddGap) && !isPastDay

  let summary: string
  if (!planned && !actual) summary = events.some((e) => e.status !== "skipped") ? `${formatDuration(bookedMinutes(events, date))} booked` : "Nothing scheduled"
  else if (isPastDay) summary = `You planned ${formatDuration(planned)} of work and did ${formatDuration(actual)}`
  else if (isToday) summary = `${formatDuration(actual)} done so far · ${formatDuration(planned)} planned today`
  else summary = `${work.length} work block${work.length === 1 ? "" : "s"} · ${formatDuration(planned)} planned`

  const showProgress = (isPastDay || isToday) && planned > 0
  const pct = planned ? Math.round((actual / planned) * 100) : 0

  return (
    <section aria-label={`Schedule for ${weekdayLong(date)}`}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="font-heading text-2xl font-medium tracking-tight">
            {isToday ? "Today" : weekdayLong(date)}
            <span className="ml-2 text-base font-normal text-muted-foreground">{monthDay(date)}</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {isPastDay && (
            <span className="rounded-sm bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">Looking back</span>
          )}
          {showProgress && (
            <div className="flex w-40 items-center gap-2" aria-label={`${pct}% of planned work done`}>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span>
            </div>
          )}
        </div>
      </header>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center">
          <Sun className="size-8 text-amber-400" />
          <p className="mt-3 font-medium">A wide-open day</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Add a focus block or event, or leave the day open.
          </p>
          {canAdd && addableSlot(14 * 60, 1440, isToday ? nowMinute : undefined) && (
            <button
              type="button"
              onClick={() => onAddGap!({ date, ...addableSlot(14 * 60, 1440, isToday ? nowMinute : undefined)! })}
              className="mt-4 flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-secondary"
            >
              <Plus className="size-4" /> Add a block
            </button>
          )}
        </div>
      ) : (
        <ol className="relative">
          {events.map((event, i) => {
            const prev = events[i - 1]
            const frontier = gapBefore(events, i)
            const gap = prev ? Math.max(0, event.startMin - frontier) : 0
            const isNow = isToday && event.status !== "skipped" && nowMinute >= event.startMin && nowMinute < event.endMin
            const showNowLine = isToday && nowMinute < event.startMin && (!prev || nowMinute >= frontier)
            const slot = !canAdd ? null
              : prev ? addableSlot(frontier, event.startMin, isToday ? nowMinute : undefined)
              : leadingSlot(event.startMin, isToday ? nowMinute : undefined)
            return (
              <li key={event.id}>
                {prev || slot
                  ? <Gap minutes={gap} onAdd={slot ? () => onAddGap!({ date, ...slot }) : undefined} leading={!prev} nowLine={showNowLine ? nowMinute : undefined} />
                  : showNowLine && <NowLine minute={nowMinute} />}
                <div
                  style={{ minHeight: Math.max(MIN_CARD_PX, (event.endMin - event.startMin) * PX_PER_MIN) }}
                  className="flex"
                >
                  <BlockCard
                    event={event}
                    data={data}
                    isNow={isNow}
                    isPast={isPastDay || (isToday && event.endMin <= nowMinute)}
                    onOpen={() => onOpen(event)}
                  />
                </div>
              </li>
            )
          })}
          {canAdd && (() => {
            const frontier = gapBefore(events, events.length)
            const slot = addableSlot(frontier, 1440, isToday ? nowMinute : undefined)
            return slot ? <li><Gap minutes={1440 - slot.startMin} onAdd={() => onAddGap!({ date, ...slot })} trailing nowLine={isToday && nowMinute >= frontier ? nowMinute : undefined} /></li> : null
          })()}
        </ol>
      )}

      {!isPastDay && events.length > 0 && (
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarPlus className="size-3.5" />
          Open a block to edit it or log time. Use a gap to add something.
        </p>
      )}
    </section>
  )
}

function Gap({ minutes, onAdd, trailing, leading, nowLine }: {
  minutes: number; onAdd?: () => void; trailing?: boolean; leading?: boolean; nowLine?: number
}) {
  const height = leading ? 56 : Math.min(120, Math.max(onAdd ? 72 : 20, minutes * PX_PER_MIN * 0.45))
  const label = !trailing && !leading && minutes >= 30 ? `${formatDuration(minutes)} of breathing room` : null
  return (
    <div className="group relative flex flex-col justify-center py-3" style={{ minHeight: height }}>
      {nowLine !== undefined && <NowLine minute={nowLine} />}
      {/* Label and button share one grid cell so hovering swaps them in place. Opacity, not display,
          keeps the button reachable by Tab; touch screens have no hover, so they show the button. */}
      {(label || onAdd) && <div className="grid flex-1 place-items-center">
        {label && <p className={cn("col-start-1 row-start-1 text-xs text-muted-foreground transition-opacity", onAdd && "group-focus-within:opacity-0 group-hover:opacity-0 [@media(hover:none)]:opacity-0")}>{label}</p>}
        {onAdd && <button type="button" onClick={onAdd} className="col-start-1 row-start-1 flex items-center gap-1.5 rounded-md border border-primary/30 bg-card px-3 py-1.5 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-secondary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:opacity-100">
          <Plus className="size-3.5" /> {leading ? "Add something before this" : "Add something here"}
        </button>}
      </div>}
    </div>
  )
}

function NowLine({ minute }: { minute: number }) {
  return (
    <div className="flex items-center gap-2 py-1" aria-label="Current time">
      <span className="text-[11px] font-medium text-primary tabular-nums">{formatClock(minute)}</span>
      <span className="h-px flex-1 bg-primary/60" />
      <span className="size-1.5 rounded-full bg-primary" />
    </div>
  )
}
