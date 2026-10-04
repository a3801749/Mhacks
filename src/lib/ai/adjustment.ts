import { sanitizeScheduleChanges, type ScheduleNow } from "../schedule-validation"
import type { ScheduleChange, WeekData } from "../types"
import { makeRoom, parseScheduleRequest, withRequestedEvent } from "./fallback"

/** A new event must survive validation before any changes made to accommodate it can survive. */
export function adjustmentChanges(raw: unknown, data: WeekData, request: ReturnType<typeof parseScheduleRequest>, now: ScheduleNow): ScheduleChange[] {
  if (!request) return sanitizeScheduleChanges(raw, data, now)
  const candidates = Array.isArray(raw) ? raw.filter((c): c is ScheduleChange => c && typeof c === "object") : []
  const filled = withRequestedEvent(candidates, request)
  const create = filled.find((c) => c.action === "create" &&
    (request.title === "New event" || c.title?.toLowerCase().startsWith(request.title.toLowerCase())))
  if (!create) return []
  const clashes = new Set(data.events.filter((e) => e.status === "planned" && e.date === create.date &&
    e.startMin < create.endMin! && e.endMin > create.startMin!).map((e) => e.id))
  const scoped = [create, ...filled.filter((c) => (c.action === "move" || c.action === "shorten") && clashes.has(c.eventId!))]
  let changes = sanitizeScheduleChanges(scoped, data, now)
  if (!changes.some((c) => c.action === "create")) return []
  changes = sanitizeScheduleChanges([...changes, ...makeRoom(data, changes, now)], data, now)
  return changes.some((c) => c.action === "create") ? changes : []
}
