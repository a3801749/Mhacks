import { sanitizeScheduleChanges, type ScheduleNow } from "../schedule-validation"
import { applyChanges } from "../schedule"
import { formatDuration } from "../time"
import type { AdjustResponse, ScheduleChange, WeekData } from "../types"
import { makeRoom, parseScheduleRequest, speakTime, withRequestedEvent } from "./fallback"

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

/** Speak about validated changes, and claim persistence only after the store has applied them. */
export function adjustmentReply(result: Pick<AdjustResponse, "reply" | "changes">, data: Pick<WeekData, "events">,
  now: ScheduleNow, { applied = false, discarded = false }: { applied?: boolean; discarded?: boolean } = {}) {
  if (result.changes.length === 0) {
    const claimsAction = /\bi(?:'ve| have)?\s+(?:added|created|scheduled|set up|moved|rescheduled|shortened|skipped|booked|proposed)\b/i.test(result.reply)
    return discarded || claimsAction ? "No calendar changes are ready to apply. Tell me the event, day, and time you want." : result.reply
  }
  const descriptions = result.changes.slice(0, 3).map((c) => {
    const event = data.events.find((e) => e.id === c.eventId)
    const title = event?.title ?? c.title ?? "this block"
    switch (c.action) {
      case "create": return `${applied ? "added" : "add"} ${title} for ${speakTime(c.date!, c.startMin!, now.date)}`
      case "move": return `${applied ? "moved" : "move"} ${title} to ${speakTime(c.date!, c.startMin!, now.date)}`
      case "shorten": return `${applied ? "shortened" : "shorten"} ${title} to ${formatDuration(c.endMin! - c.startMin!)}`
      case "skip": return `${applied ? "skipped" : "skip"} ${title}`
    }
  })
  const extra = result.changes.length > 3 ? ` There are ${result.changes.length - 3} more changes ${applied ? "applied" : "in the preview"}.` : ""
  const after = applied ? data.events : applyChanges(data.events, result.changes)
  const touched = after.filter((e) => e.status !== "skipped" && result.changes.some((c) => c.action === "create"
    ? e.title === c.title && e.date === c.date && e.startMin === c.startMin && e.endMin === c.endMin : e.id === c.eventId))
  const overlap = touched.some((e) => after.some((other) => other.id !== e.id && other.status !== "skipped" &&
    other.date === e.date && other.startMin < e.endMin && other.endMin > e.startMin))
  const warning = overlap ? " An overlap remains; check the calendar preview." : ""
  return `I ${applied ? "" : "can "}${descriptions.join("; ")}.${extra}${warning}${applied ? "" : " Apply the changes below to save them."}`
}
