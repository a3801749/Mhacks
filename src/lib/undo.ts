import { statusForActual } from "./schedule"
import type { EventPatch } from "./store/types"
import type { CalendarEvent, ScheduleChange } from "./types"

export function scheduleUndo(before: CalendarEvent[], current: CalendarEvent[], changes: ScheduleChange[], createdEventIds: string[]) {
  const ids = new Set(changes.filter((c) => c.action !== "create").map((c) => c.eventId))
  const restore = before.filter((e) => ids.has(e.id)).map((e) => {
    const live = current.find((c) => c.id === e.id)
    const patch: EventPatch = {
      date: e.date, startMin: e.startMin, endMin: e.endMin,
      status: live && live.actualMinutes !== e.actualMinutes ? statusForActual(live.actualMinutes, e.endMin - e.startMin) : e.status,
      movedFromDate: e.movedFromDate, movedFromStartMin: e.movedFromStartMin,
      isException: e.isException,
    }
    return { id: e.id, patch }
  })
  return { restore, remove: [...new Set(createdEventIds)] }
}
