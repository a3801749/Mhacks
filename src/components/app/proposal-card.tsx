"use client"

import { ArrowRight, Check, Loader2, RotateCcw, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { describeChange } from "@/lib/describe"
import { applyChanges } from "@/lib/schedule"
import { formatRange, monthDay, weekdayShort } from "@/lib/time"
import type { AppliedWeek, CalendarEvent, ScheduleChange } from "@/lib/types"
import { cn } from "@/lib/utils"

export type ProposalState = "pending" | "applied" | "declined"

export interface ProposalItem {
  change: ScheduleChange
  state: ProposalState
  /** The calendar before this item was applied, used to describe and undo it. */
  before?: CalendarEvent[]
  createdEventIds?: string[]
}

/** The store reports created ids unordered, so pair each create with the block it produced. */
export function createdIdsByChange(changes: ScheduleChange[], week: AppliedWeek): string[][] {
  const unclaimed = new Set(week.createdEventIds)
  return changes.map((c) => {
    if (c.action !== "create") return []
    const hit = week.events.find((e) => unclaimed.has(e.id) && e.date === c.date && e.startMin === c.startMin && e.endMin === c.endMin)
    if (!hit) return []
    unclaimed.delete(hit.id)
    return [hit.id]
  })
}

export function ProposalCard({ items, events, busy, applying, onApply, onDecline, onRestore, onUndo }: {
  items: ProposalItem[]
  events: CalendarEvent[]
  busy: boolean
  applying: number[] | null
  onApply: (indices: number[]) => void
  onDecline: (index: number) => void
  onRestore: (index: number) => void
  onUndo: (index: number) => void
}) {
  const pending = items.flatMap((item, i) => (item.state === "pending" ? [i] : []))
  return (
    <div className="mt-2.5 space-y-2 rounded-xl bg-background/80 p-2.5 text-foreground">
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const d = describeChange(item.change, item.before ?? events)
          const inFlight = applying?.includes(i)
          return (
            <li key={i} className={cn("flex items-start gap-2 rounded-lg border bg-card px-2.5 py-2 text-xs", item.state === "declined" && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium", item.state === "declined" && "line-through")}>
                  {d.verb} · {d.title}
                </p>
                <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
                  {d.from && <span>{d.from}</span>}
                  {d.from && d.to && <ArrowRight className="size-3" />}
                  {d.to && <span className="text-foreground">{d.to}</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.state === "pending" && <>
                  <Button size="icon-xs" disabled={busy} onClick={() => onApply([i])} aria-label={`Apply: ${d.verb} ${d.title}`} title="Apply this change">
                    {inFlight ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                  <Button size="icon-xs" variant="ghost" disabled={busy} onClick={() => onDecline(i)} aria-label={`Leave out: ${d.verb} ${d.title}`} title="Leave this out">
                    <X />
                  </Button>
                </>}
                {item.state === "applied" && <>
                  <span className="flex items-center gap-1 text-emerald-700"><Check className="size-3" />Done</span>
                  <Button size="icon-xs" variant="ghost" disabled={busy} onClick={() => onUndo(i)} aria-label={`Undo: ${d.verb} ${d.title}`} title="Undo this change">
                    <Undo2 />
                  </Button>
                </>}
                {item.state === "declined" && (
                  <Button size="icon-xs" variant="ghost" disabled={busy} onClick={() => onRestore(i)} aria-label={`Bring back: ${d.verb} ${d.title}`} title="Bring this back">
                    <RotateCcw />
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {pending.length > 1 && (
        <Button size="xs" className="w-full" disabled={busy} onClick={() => onApply(pending)}>
          {applying && applying.length > 1 ? <Loader2 className="animate-spin" /> : <Check />} Apply all {pending.length}
        </Button>
      )}
      <DayPreview items={items} events={events} />
    </div>
  )
}

type Row = { key: string; title: string; startMin: number; endMin: number; tag?: string; tone: "plain" | "pending" | "done" | "gone" }

/** The touched days as they would look with every change that is still on the table. */
function DayPreview({ items, events }: { items: ProposalItem[]; events: CalendarEvent[] }) {
  const pending = items.filter((i) => i.state === "pending").map((i) => i.change)
  const preview = applyChanges(events, pending)
  const live = new Set(events.map((e) => e.id))
  const added = new Set(items.filter((i) => i.state === "applied").flatMap((i) => i.createdEventIds ?? []))
  const tagFor = new Map<string, { tag: string; tone: Row["tone"] }>()
  for (const item of items) {
    if (!item.change.eventId || item.state === "declined") continue
    const verb = item.change.action === "shorten" ? "Shortened" : item.change.action === "skip" ? "Skipped" : "Moved"
    if (item.state === "applied") tagFor.set(item.change.eventId, { tag: verb, tone: "done" })
    else tagFor.set(item.change.eventId, { tag: item.change.action === "shorten" ? "Shorter" : "Moves here", tone: "pending" })
  }

  const dates = new Set<string>()
  for (const item of items) {
    if (item.state === "declined") continue
    const original = (item.before ?? events).find((e) => e.id === item.change.eventId)
    if (original) dates.add(original.date)
    if (item.change.date) dates.add(item.change.date)
  }

  const days = [...dates].sort().slice(0, 3).map((date) => {
    const rows: Row[] = preview
      .filter((e) => e.date === date && e.status !== "skipped")
      .map((e) => {
        const isNew = !live.has(e.id) || added.has(e.id)
        const tag = isNew ? { tag: live.has(e.id) ? "Added" : "New", tone: (live.has(e.id) ? "done" : "pending") as Row["tone"] } : tagFor.get(e.id)
        return { key: e.id, title: e.title, startMin: e.startMin, endMin: e.endMin, tag: tag?.tag, tone: tag?.tone ?? "plain" }
      })
    for (const change of pending) {
      const original = events.find((e) => e.id === change.eventId)
      if (!original || original.date !== date || change.action === "shorten") continue
      rows.push({
        key: `was-${original.id}`, title: original.title, startMin: original.startMin, endMin: original.endMin, tone: "gone",
        tag: change.action === "skip" ? "Skipping" : change.date && change.date !== date ? `To ${weekdayShort(change.date)}` : "Moving",
      })
    }
    rows.sort((a, b) => a.startMin - b.startMin || (a.tone === "gone" ? -1 : 1))
    const solid = rows.filter((r) => r.tone !== "gone")
    const overlaps = new Set(solid.filter((r) => solid.some((o) => o !== r && o.startMin < r.endMin && o.endMin > r.startMin)).map((r) => r.key))
    return { date, rows, overlaps }
  })

  if (days.length === 0) return null
  return (
    <div className="space-y-2 border-t pt-2">
      {days.map(({ date, rows, overlaps }) => (
        <section key={date} aria-label={`${weekdayShort(date)} ${monthDay(date)} preview`}>
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{weekdayShort(date)} {monthDay(date)}</p>
          {rows.length === 0 ? <p className="text-xs text-muted-foreground">Nothing else that day</p> : (
            <ol className="space-y-0.5">
              {rows.map((r) => (
                <li key={r.key} className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                  r.tone === "pending" && "bg-primary/10",
                  r.tone === "done" && "bg-emerald-50",
                  r.tone === "gone" && "text-muted-foreground",
                  overlaps.has(r.key) && "ring-1 ring-amber-400",
                )}>
                  <span className={cn("w-[7.5rem] shrink-0 tabular-nums", r.tone === "gone" && "line-through")}>{formatRange(r.startMin, r.endMin)}</span>
                  <span className={cn("min-w-0 flex-1 truncate", r.tone !== "plain" && r.tone !== "gone" && "font-medium", r.tone === "gone" && "line-through")}>{r.title}</span>
                  {overlaps.has(r.key) && <span className="shrink-0 text-amber-700">Overlaps</span>}
                  {r.tag && <span className={cn("shrink-0", r.tone === "pending" && "text-primary", r.tone === "done" && "text-emerald-700")}>{r.tag}</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  )
}
