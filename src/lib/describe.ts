import { formatClock, formatRange, monthDay, weekdayShort } from "./time"
import type { CalendarEvent, ScheduleChange } from "./types"

export function describeChange(change: ScheduleChange, events: CalendarEvent[]) {
  const e = events.find((x) => x.id === change.eventId)
  const title = e?.title ?? change.title ?? "Block"
  const when = (date?: string, start?: number) =>
    date && start != null ? `${weekdayShort(date)} ${monthDay(date)}, ${formatClock(start)}` : ""
  switch (change.action) {
    case "move":
      return {
        title,
        from: e ? when(e.date, e.startMin) : "",
        to: when(change.date ?? e?.date, change.startMin),
        verb: "Move",
      }
    case "shorten":
      return {
        title,
        from: e ? formatRange(e.startMin, e.endMin) : "",
        to: change.startMin != null && change.endMin != null ? formatRange(change.startMin, change.endMin) : "",
        verb: "Shorten",
      }
    case "skip":
      return { title, from: e ? when(e.date, e.startMin) : "", to: "", verb: "Skip" }
    case "create":
      return { title, from: "", to: when(change.date, change.startMin), verb: "Add" }
  }
}
