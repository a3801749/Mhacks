import { eventDetails } from "./recurrence"
import { applyChanges } from "./schedule"
import { validDate } from "./time"
export { validDate } from "./time"
import type { ScheduleChange, WeekData } from "./types"

export interface ScheduleNow {
  date: string
  minute: number
}

function normalizeChange(value: unknown, data: WeekData): ScheduleChange {
  if (!value || typeof value !== "object") throw new Error("Invalid schedule change")
  const raw = value as ScheduleChange
  // Models fill optional ids with "" rather than leaving them out.
  const c = { ...raw, taskId: raw.taskId === "" ? null : raw.taskId, projectId: raw.projectId === "" ? null : raw.projectId }
  if (!["create", "move", "shorten", "skip"].includes(c.action)) throw new Error("Unknown schedule action")
  if (typeof c.reason !== "string") throw new Error("A schedule change needs a reason")
  if (c.date !== undefined && !validDate(c.date)) throw new Error("Invalid block date")
  for (const minute of [c.startMin, c.endMin]) {
    if (minute !== undefined && (!Number.isInteger(minute) || minute < 0 || minute > 1440)) throw new Error("Invalid block time")
  }

  const reason = c.reason.slice(0, 280)
  if (c.action === "create") {
    if (!validDate(c.date) || c.startMin == null || c.endMin == null || c.endMin <= c.startMin) throw new Error("Invalid block interval")
    const task = c.taskId == null ? null : data.tasks.find((t) => t.id === c.taskId)
    if (c.taskId != null && (!task || task.done)) throw new Error("Pick an open task")
    if (c.projectId != null && !data.projects.some((p) => p.id === c.projectId)) throw new Error("Unknown assignment")
    if (task && c.projectId != null && task.projectId !== c.projectId) throw new Error("Task does not belong to that assignment")
    const kind = c.kind ?? (task ? "work" : "life")
    if (!["work", "life"].includes(kind) || (task && kind !== "work")) throw new Error("Invalid block kind")
    if (c.title !== undefined && typeof c.title !== "string") throw new Error("Invalid block title")
    return { action: "create", date: c.date, startMin: c.startMin, endMin: c.endMin,
      taskId: task?.id ?? null, projectId: task?.projectId ?? c.projectId ?? null, kind,
      title: c.title?.trim().slice(0, 80) || "New block", ...eventDetails(c), reason }
  }

  const event = data.events.find((e) => e.id === c.eventId)
  if (!event) throw new Error("Block not found")
  if (event.status !== "planned") throw new Error("That block is no longer planned. Refresh and try again.")
  if (c.action === "skip") return { action: "skip", eventId: event.id, reason }
  const date = c.date ?? event.date
  if (c.action === "shorten" && date !== event.date) throw new Error("Shorten the block on its existing date")
  const startMin = c.startMin ?? event.startMin
  const endMin = c.endMin ?? (c.action === "move" ? startMin + event.endMin - event.startMin : event.endMin)
  if (endMin <= startMin || endMin > 1440) throw new Error("Invalid block interval")
  if (c.action === "shorten" && (startMin < event.startMin || endMin > event.endMin)) throw new Error("Shortening cannot extend a block")
  return { action: c.action, eventId: event.id, date, startMin, endMin, reason }
}

/** Manual scheduling allows overlaps; all changes must still name valid blocks and intervals. */
export function validateScheduleChanges(changes: unknown, data: WeekData): ScheduleChange[] {
  if (!Array.isArray(changes) || changes.length > 100) throw new Error("changes must be an array of at most 100 items")
  let events = data.events
  return changes.map((value) => {
    const change = normalizeChange(value, { ...data, events })
    events = applyChanges(events, [change])
    return change
  })
}

/**
 * Model proposals additionally protect past work, waking hours, and occupied slots.
 * Models list changes in any order (often the requested event before the move that frees
 * its slot), so a change that clashes is retried after the others have been applied.
 */
export function sanitizeScheduleChanges(changes: unknown, data: WeekData, now: ScheduleNow): ScheduleChange[] {
  if (!Array.isArray(changes)) return []
  let events = data.events
  const out: ScheduleChange[] = []
  let pending = changes.slice(0, 100)
  while (pending.length) {
    const retry: unknown[] = []
    for (const value of pending) {
      let change: ScheduleChange
      try {
        change = normalizeChange(value, { ...data, events })
      } catch {
        continue // Invalid model output is discarded, rather than reaching persistence.
      }
      const verdict = check(change, events, now)
      if (verdict === "drop") continue
      if (verdict === "clash") { retry.push(value); continue }
      events = applyChanges(events, [change])
      out.push(change)
    }
    if (retry.length === pending.length) {
      // A personal event the user asked for is still worth proposing; the preview flags the overlap.
      for (const value of retry) {
        const change = normalizeChange(value, { ...data, events })
        if (change.action !== "create" || change.kind !== "life" || check(change, [], now) !== "ok") continue
        events = applyChanges(events, [change])
        out.push(change)
      }
      break
    }
    pending = retry
  }
  return out
}

function check(change: ScheduleChange, events: WeekData["events"], now: ScheduleNow): "ok" | "drop" | "clash" {
  const original = events.find((e) => e.id === change.eventId)
  if (original && (original.date < now.date || (original.date === now.date && original.endMin <= now.minute))) return "drop"
  if (change.action === "skip") return "ok"
  const { date, startMin, endMin } = change as ScheduleChange & { date: string; startMin: number; endMin: number }
  // Focus work stays in study hours; personal events the user asks for (a late dinner) may not.
  const [earliest, latest] = change.action === "create" && change.kind === "life" ? [360, 1440] : [480, 1320]
  if (date < now.date || startMin < earliest || endMin > latest) return "drop"
  const continuing = change.action === "shorten" && startMin === original?.startMin && endMin > now.minute
  if (date === now.date && startMin < now.minute && !continuing) return "drop"
  if ((change.action === "move" || change.action === "shorten") && date === original?.date && startMin === original.startMin && endMin === original.endMin) return "drop"
  if (events.some((e) => e.id !== change.eventId && e.status !== "skipped" && e.date === date && e.startMin < endMin && e.endMin > startMin)) return "clash"
  return "ok"
}
