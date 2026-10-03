"use client"

import { CalendarPlus, Sun } from "lucide-react"
import { formatClock, formatDuration, monthDay, weekdayLong, weekdayShort } from "@/lib/time"
import type { CalendarEvent, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { BlockCard } from "./block-card"

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
        const work = data.events.filter((e) => e.date === date && e.kind === "work")
        const planned = work.reduce((s, e) => s + e.endMin - e.startMin, 0)
        const actual = work.reduce((s, e) => s + e.actualMinutes, 0)
        const past = date < today
        const fill = planned ? Math.min(1, actual / planned) : 0
        const isToday = date === today
        return (
          <button
            key={date}
            role="tab"
            aria-selected={selected === date}
            onClick={() => onSelect(date)}
            className={cn(
              "relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border px-1 py-2.5 transition-colors",
              selected === date ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            <span className={cn("text-[11px] uppercase tracking-wide", selected !== date && "text-muted-foreground")}>
              {isToday ? "Today" : weekdayShort(date)}
            </span>
            <span className="font-heading text-lg leading-none tabular-nums">{Number(date.slice(8))}</span>
            <span className="relative mt-0.5 h-1 w-8 overflow-hidden rounded-full bg-current/15">
              <span
                className={cn("absolute inset-y-0 left-0 rounded-full", selected === date ? "bg-white" : "bg-primary")}
                style={{ width: `${(past || isToday ? fill : 0) * 100}%` }}
              />
            </span>
            <span className={cn("text-[10px] tabular-nums", selected !== date && "text-muted-foreground")}>
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
}: {
  data: WeekData
  date: string
  today: string
  nowMinute: number
  onOpen: (e: CalendarEvent) => void
}) {
  const events = data.events.filter((e) => e.date === date).sort((a, b) => a.startMin - b.startMin)
  const work = events.filter((e) => e.kind === "work")
  const planned = work.reduce((s, e) => s + e.endMin - e.startMin, 0)
  const actual = work.reduce((s, e) => s + e.actualMinutes, 0)
  const isPastDay = date < today
  const isToday = date === today

  let summary: string
  if (work.length === 0) summary = "Nothing scheduled. A rare open sky."
  else if (isPastDay) summary = `You planned ${formatDuration(planned)} of work and did ${formatDuration(actual)}.`
  else if (isToday) summary = `${formatDuration(actual)} done so far · ${formatDuration(planned)} planned today.`
  else summary = `${work.length} work block${work.length === 1 ? "" : "s"} · ${formatDuration(planned)} planned.`

  return (
    <section aria-label={`Schedule for ${weekdayLong(date)}`}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-2xl font-medium tracking-tight">
            {isToday ? "Today" : weekdayLong(date)}
            <span className="ml-2 text-base font-normal text-muted-foreground">{monthDay(date)}</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>
        </div>
        {isPastDay && (
          <span className="rounded-sm bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
            Looking back
          </span>
        )}
      </header>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
          <Sun className="size-8 text-amber-400" />
          <p className="mt-3 font-medium">A wide-open day</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Ask Tilly to pull something forward, or just let it be a rest day.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-2.5">
          {events.map((event, i) => {
            const prev = events[i - 1]
            const gap = prev ? event.startMin - prev.endMin : 0
            const isNow = isToday && nowMinute >= event.startMin && nowMinute < event.endMin
            const showNowLine =
              isToday && nowMinute < event.startMin && (!prev || nowMinute >= prev.endMin)
            return (
              <li key={event.id} className="space-y-2.5">
                {showNowLine && <NowLine minute={nowMinute} />}
                {gap >= 60 && !showNowLine && (
                  <p className="flex items-center gap-2 pl-3 text-xs text-muted-foreground/80">
                    <span className="h-px w-6 bg-border" />
                    {formatDuration(gap)} of breathing room
                  </p>
                )}
                <BlockCard
                  event={event}
                  data={data}
                  isNow={isNow}
                  isPast={isPastDay || (isToday && event.endMin <= nowMinute)}
                  onOpen={() => onOpen(event)}
                />
              </li>
            )
          })}
          {isToday && events.every((e) => e.endMin <= nowMinute) && (
            <li>
              <NowLine minute={nowMinute} />
            </li>
          )}
        </ol>
      )}

      {!isPastDay && events.length > 0 && (
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarPlus className="size-3.5" />
          Tap a block to log time, or tell Tilly when plans change.
        </p>
      )}
    </section>
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
