import { eventDetails } from "./recurrence"
import { RequestError } from "./errors"
import { validDate } from "./schedule-validation"
import type { EventPatch } from "./store/types"
import type { WeekData } from "./types"

export function validateEventPatch(value: unknown, data: WeekData, id: string): EventPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("Invalid block update")
  const body = value as EventPatch
  const event = data.events.find((e) => e.id === id)
  if (!event) throw new RequestError("Block not found", 404)
  const patch: EventPatch = {}
  if (body.status !== undefined) {
    if (!["planned", "completed", "partial", "skipped"].includes(body.status)) throw new RequestError("Invalid block status")
    patch.status = body.status
  }
  if (body.date !== undefined) {
    if (!validDate(body.date)) throw new RequestError("Invalid block date")
    patch.date = body.date
  }
  for (const key of ["startMin", "endMin"] as const) {
    const v = body[key]
    if (v !== undefined) {
      if (!Number.isInteger(v) || v < 0 || v > 1440) throw new RequestError("Invalid block time")
      patch[key] = v
    }
  }
  if ((patch.endMin ?? event.endMin) <= (patch.startMin ?? event.startMin)) throw new RequestError("End time must be after the start")
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 80) throw new RequestError("Enter a title of at most 80 characters")
    patch.title = body.title.trim()
  }
  const details = eventDetails({ location: body.location ?? event.location, meetingUrl: body.meetingUrl ?? event.meetingUrl, notes: body.notes ?? event.notes })
  for (const key of ["location", "meetingUrl", "notes"] as const) if (body[key] !== undefined) patch[key] = details[key]
  if (body.kind !== undefined) {
    if (!["work", "life"].includes(body.kind) || event.seriesId && body.kind !== "life") throw new RequestError("Invalid block kind")
    patch.kind = body.kind
  }
  for (const key of ["projectId", "taskId"] as const) if (body[key] !== undefined) patch[key] = body[key]
  const taskId = patch.taskId === undefined ? event.taskId : patch.taskId
  const projectId = patch.projectId === undefined ? event.projectId : patch.projectId
  const task = taskId === null ? null : data.tasks.find((t) => t.id === taskId)
  if (taskId && !task || projectId && !data.projects.some((p) => p.id === projectId)) throw new RequestError("Unknown assignment or task")
  if (task && (task.projectId !== projectId || (patch.kind ?? event.kind) !== "work")) throw new RequestError("Task does not belong to this focus block")
  if (event.seriesId && (taskId || projectId)) throw new RequestError("Repeating personal events are independent of assignments")
  if ((taskId !== event.taskId || projectId !== event.projectId || patch.kind && patch.kind !== event.kind) &&
      (event.actualMinutes > 0 || data.logs.some((l) => l.eventId === id))) throw new RequestError("This block has recorded work. Keep its assignment and type so the time stays attached to the right work.", 409)
  if (body.movedFromDate !== undefined) {
    if (body.movedFromDate !== null && !validDate(body.movedFromDate)) throw new RequestError("Invalid original date")
    patch.movedFromDate = body.movedFromDate
  }
  if (body.movedFromStartMin !== undefined) {
    if (body.movedFromStartMin !== null && (!Number.isInteger(body.movedFromStartMin) || body.movedFromStartMin < 0 || body.movedFromStartMin >= 1440)) throw new RequestError("Invalid original time")
    patch.movedFromStartMin = body.movedFromStartMin
  }
  if ((patch.date && patch.date !== event.date || patch.startMin !== undefined && patch.startMin !== event.startMin) && event.movedFromDate === null && body.movedFromDate === undefined) {
    patch.movedFromDate = event.date
    patch.movedFromStartMin = event.startMin
  }
  if (body.isException !== undefined) {
    if (typeof body.isException !== "boolean") throw new RequestError("Invalid occurrence update")
    patch.isException = body.isException
  }
  return patch
}
