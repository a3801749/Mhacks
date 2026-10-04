import { RequestError } from "./errors"
import { applyChanges, statusForActual } from "./schedule"
import type { EventPatch } from "./store/types"
import type { CalendarEvent, ScheduleChange } from "./types"

export function scheduleUndo(before: CalendarEvent[], current: CalendarEvent[], changes: ScheduleChange[], createdEventIds: string[]) {
  const ids = new Set(changes.filter((c) => c.action !== "create").map((c) => c.eventId))
  const expected = applyChanges(before, changes)
  const restore = before.filter((e) => ids.has(e.id)).map((e) => {
    const live = current.find((c) => c.id === e.id)
    const after = expected.find((c) => c.id === e.id)!
    if (!live || live.date !== after.date || live.startMin !== after.startMin || live.endMin !== after.endMin ||
      live.movedFromDate !== after.movedFromDate || live.movedFromStartMin !== after.movedFromStartMin ||
      live.actualMinutes === e.actualMinutes && live.status !== after.status) {
      throw new RequestError("This block changed after this proposal. Undo its later changes first.", 409)
    }
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
