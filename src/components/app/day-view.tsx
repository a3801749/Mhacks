"use client"

import { CalendarPlus, Plus, Sun } from "lucide-react"
import { formatClock, formatDuration, monthDay, weekdayLong, weekdayShort } from "@/lib/time"
import type { CalendarEvent, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { BlockCard } from "./block-card"

/** Vertical scale for the day timeline, so a 2h block reads as twice a 1h block. */
const PX_PER_MIN = 1.1
const MIN_CARD_PX = 84
const MIN_GAP_TO_ADD = 15

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
        const planned = data.events
          .filter((e) => e.date === date && e.kind === "work")
          .reduce((s, e) => s + e.endMin - e.startMin, 0)
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
              {planned ? formatDuration(planned) : "free"}
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
  const planned = work.reduce((s, e) => s + e.endMin - e.startMin, 0)
  const actual = work.reduce((s, e) => s + e.actualMinutes, 0)
  const isPastDay = date < today
  const isToday = date === today
  const canAdd = Boolean(onAddGap) && !isPastDay

  let summary: string
  if (work.length === 0) summary = "Nothing scheduled. A rare open sky"
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
            Ask Tilly to pull something forward, or just let it be a rest day.
          </p>
          {canAdd && (
            <button
              type="button"
              onClick={() => onAddGap!({ date, startMin: 14 * 60, endMin: 15 * 60 })}
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
            const gap = prev ? Math.max(0, event.startMin - prev.endMin) : 0
            const isNow = isToday && nowMinute >= event.startMin && nowMinute < event.endMin
            const showNowLine = isToday && nowMinute < event.startMin && (!prev || nowMinute >= prev.endMin)
            const gapAddable = canAdd && prev && gap >= MIN_GAP_TO_ADD && !(isToday && event.startMin <= nowMinute)
            return (
              <li key={event.id}>
                {showNowLine && <NowLine minute={nowMinute} />}
                {prev && !showNowLine && (
                  <Gap
                    minutes={gap}
                    onAdd={
                      gapAddable
                        ? () => {
                            const start = isToday ? Math.max(prev.endMin, Math.ceil(nowMinute / 15) * 15) : prev.endMin
                            onAddGap!({ date, startMin: start, endMin: Math.min(event.startMin, start + 60) })
                          }
                        : undefined
                    }
                  />
                )}
                {showNowLine && prev && <div className="h-2" />}
                <div
                  style={{ minHeight: Math.max(MIN_CARD_PX, (event.endMin - event.startMin) * PX_PER_MIN) + 8 }}
                  className="flex pb-2"
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
          {isToday && events.every((e) => e.endMin <= nowMinute) && (
            <li className="pt-2">
              <NowLine minute={nowMinute} />
            </li>
          )}
        </ol>
      )}

      {!isPastDay && events.length > 0 && (
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarPlus className="size-3.5" />
          Tap a block to log time, hover a gap to add one, or tell Tilly when plans change.
        </p>
      )}
    </section>
  )
}

function Gap({ minutes, onAdd }: { minutes: number; onAdd?: () => void }) {
  const height = Math.min(120, Math.max(10, minutes * PX_PER_MIN * 0.45))
  const label = minutes >= 30 ? `${formatDuration(minutes)} of breathing room` : null
  return (
    <div className="group relative flex items-center" style={{ height }}>
      {label && (
        <p className={cn("flex items-center gap-2 pl-3 text-sm text-muted-foreground", onAdd && "group-hover:opacity-0")}>
          <span className="h-px w-6 bg-border" />
          {label}
        </p>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-2 py-1 text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
        >
          <span className="h-px flex-1 bg-primary/30" />
          <span className="flex items-center gap-1 rounded-md border border-primary/30 bg-card px-2.5 py-1 font-medium">
            <Plus className="size-3.5" /> {label ? "Add something here" : "Add"}
          </span>
          <span className="h-px flex-1 bg-primary/30" />
        </button>
      )}
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
