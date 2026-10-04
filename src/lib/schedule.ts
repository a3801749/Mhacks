import type { CalendarEvent, ScheduleChange } from "./types"

let createCounter = 0

/** Applies AI-proposed changes to a schedule. Unknown event ids and malformed changes are ignored. */
export function applyChanges(events: CalendarEvent[], changes: ScheduleChange[]): CalendarEvent[] {
  const next = events.map((e) => ({ ...e }))
  for (const change of changes) {
    if (change.action === "create") {
      if (!change.date || change.startMin == null || change.endMin == null) continue
      next.push({
        id: `e-new-${Date.now().toString(36)}-${createCounter++}`,
        projectId: change.projectId ?? null,
        taskId: change.taskId ?? null,
        title: change.title ?? "New block",
        date: change.date,
        startMin: change.startMin,
        endMin: change.endMin,
        status: "planned",
        actualMinutes: 0,
        kind: change.kind ?? (change.taskId ? "work" : "life"),
        movedFromDate: null,
        movedFromStartMin: null,
        location: change.location ?? "", meetingUrl: change.meetingUrl ?? "", notes: change.notes ?? "", seriesId: null, occurrenceDate: null, isException: false,
      })
      continue
    }
    const event = next.find((e) => e.id === change.eventId)
    if (!event) continue
    if (event.seriesId) event.isException = true
    if (change.action === "skip") {
      event.status = "skipped"
    } else if (change.action === "move") {
      if (event.movedFromDate == null) {
        event.movedFromDate = event.date
        event.movedFromStartMin = event.startMin
      }
      const length = event.endMin - event.startMin
      event.date = change.date ?? event.date
      event.startMin = change.startMin ?? event.startMin
      event.endMin = change.endMin ?? event.startMin + length
    } else if (change.action === "shorten") {
      if (change.startMin != null) event.startMin = change.startMin
      if (change.endMin != null) event.endMin = change.endMin
    }
    if (event.endMin <= event.startMin) event.endMin = event.startMin + 15
  }
  return next
}

/** Status implied by logged time; taking every minute back returns a block to "planned". */
export function statusForActual(actual: number, length: number): CalendarEvent["status"] {
  if (actual <= 0) return "planned"
  return actual >= length ? "completed" : "partial"
}

/** Finds the earliest open slot of `length` minutes on or after a given day/time, within waking hours. */
export function findOpenSlot(
  events: CalendarEvent[],
  dates: string[],
  length: number,
  earliest: { date: string; minute: number },
  ignoreId?: string,
): { date: string; startMin: number } | null {
  const DAY_START = 9 * 60
  const DAY_END = 20 * 60
  for (const date of dates) {
    if (date < earliest.date) continue
    const busy = events
      .filter((e) => e.date === date && e.id !== ignoreId && e.status !== "skipped")
      .sort((a, b) => a.startMin - b.startMin)
    let cursor = Math.max(DAY_START, date === earliest.date ? roundUp(earliest.minute) : DAY_START)
    for (const block of busy) {
      if (Math.min(block.startMin, DAY_END) - cursor >= length) return { date, startMin: cursor }
      cursor = Math.max(cursor, block.endMin + 15)
    }
    if (DAY_END - cursor >= length) return { date, startMin: cursor }
  }
  return null
}

function roundUp(min: number) {
  return Math.ceil(min / 15) * 15
}
