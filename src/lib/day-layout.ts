import type { CalendarEvent } from "./types"

/** Booked time includes personal events as well as focus blocks. */
export function bookedMinutes(events: CalendarEvent[], date: string) {
  return events.filter((e) => e.date === date && e.status !== "skipped")
    .reduce((sum, e) => sum + e.endMin - e.startMin, 0)
}

/** Use the furthest visible block end when laying out overlapping or skipped cards. */
export function gapBefore(events: CalendarEvent[], index: number) {
  return Math.max(0, ...events.slice(0, index).map((e) => e.endMin))
}

export function addableSlot(start: number, end: number, nowMinute?: number) {
  const from = Math.max(start, nowMinute === undefined ? 0 : Math.ceil(nowMinute / 15) * 15)
  return end - from >= 15 ? { startMin: from, endMin: Math.min(end, from + 60) } : null
}
