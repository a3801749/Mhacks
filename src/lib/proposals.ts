import { applyChanges } from "./schedule"
import type { AppliedWeek, CalendarEvent, ScheduleChange } from "./types"

export type ProposalState = "pending" | "applied" | "declined"

export interface ProposalItem {
  change: ScheduleChange
  state: ProposalState
  before?: CalendarEvent[]
  createdEventIds?: string[]
}

/** Created ids are unordered; equal time windows can still belong to different blocks. */
export function createdIdsByChange(changes: ScheduleChange[], week: AppliedWeek): string[][] {
  const unclaimed = new Set(week.createdEventIds)
  return changes.map((c) => {
    if (c.action !== "create") return []
    const taskId = c.taskId || null
    const projectId = taskId ? week.tasks.find((t) => t.id === taskId)?.projectId : c.projectId ?? null
    const hit = week.events.find((e) => unclaimed.has(e.id) &&
      e.date === c.date && e.startMin === c.startMin && e.endMin === c.endMin &&
      e.title === (c.title?.trim().slice(0, 80) || "New block") &&
      e.kind === (c.kind ?? (taskId ? "work" : "life")) && e.taskId === taskId && e.projectId === projectId &&
      e.location === (c.location?.trim() ?? "") && e.meetingUrl === (c.meetingUrl?.trim() ?? "") && e.notes === (c.notes?.trim() ?? ""))
    if (!hit) return []
    unclaimed.delete(hit.id)
    return [hit.id]
  })
}

export function appliedProposalItems(changes: ScheduleChange[], week: AppliedWeek): ProposalItem[] {
  const created = createdIdsByChange(changes, week)
  let events = week.previousEvents
  return changes.map((change, i) => {
    const before = events
    events = applyChanges(events, [change])
    return { change, state: "applied", before, createdEventIds: created[i] }
  })
}
