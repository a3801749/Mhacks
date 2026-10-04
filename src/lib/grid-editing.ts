import type { CalendarEvent } from "./types"

const snap = (minute: number) => Math.round(minute / 15) * 15

export function movedWindow(event: CalendarEvent, date: string, pointerMinute: number, grabOffset = 0) {
  const duration = event.endMin - event.startMin
  const startMin = Math.max(0, Math.min(1440 - duration, snap(pointerMinute - grabOffset)))
  return { date, startMin, endMin: startMin + duration }
}

export function resizedWindow(event: CalendarEvent, minuteDelta: number) {
  return { date: event.date, startMin: event.startMin, endMin: Math.min(1440, Math.max(event.startMin + 15, snap(event.endMin + minuteDelta))) }
}

/** Place overlapping cards in separate lanes, including their minimum rendered height. */
export function eventLanes(events: CalendarEvent[], minimumMinutes = 0) {
  const result = new Map<string, { lane: number; lanes: number }>()
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  let group: CalendarEvent[] = []
  let ends: number[] = []
  const finish = () => {
    for (const e of group) result.get(e.id)!.lanes = ends.length
    group = []
    ends = []
  }
  for (const e of sorted) {
    if (group.length && e.startMin >= Math.max(...ends)) finish()
    let lane = ends.findIndex((end) => end <= e.startMin)
    if (lane === -1) lane = ends.length
    ends[lane] = Math.max(e.endMin, e.startMin + minimumMinutes)
    group.push(e)
    result.set(e.id, { lane, lanes: 1 })
  }
  finish()
  return result
}
