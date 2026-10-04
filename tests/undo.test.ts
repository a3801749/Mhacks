import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import { memoryStore } from "../src/lib/store/memory"
import { appliedProposalItems, createdIdsByChange } from "../src/lib/proposals"
import { applyChanges } from "../src/lib/schedule"
import { scheduleUndo } from "../src/lib/undo"
import type { ScheduleChange } from "../src/lib/types"
import { event, week } from "./fixtures"

beforeEach(() => memoryStore.reset("2026-10-03"))

test("Undo removes only blocks created by its operation and restores move history", async () => {
  const before = await memoryStore.getWeek("2026-10-03")
  const target = before.events.find((e) => e.status === "planned")!
  const changes: ScheduleChange[] = [
    { action: "move", eventId: target.id, date: "2026-10-06", startMin: 600, endMin: 660, reason: "Move" },
    { action: "create", date: "2026-10-06", startMin: 700, endMin: 760, title: "New", kind: "work", reason: "Add" },
  ]
  const applied = await memoryStore.applyChanges(changes)
  assert.equal(applied.createdEventIds.length, 1)
  const unrelated = await memoryStore.applyChanges([{ ...changes[1], title: "Unrelated" }])
  const undo = scheduleUndo(before.events, unrelated.events, changes, applied.createdEventIds)
  for (const id of undo.remove) await memoryStore.deleteEvent(id)
  for (const restore of undo.restore) await memoryStore.updateEvent(restore.id, restore.patch)
  const result = await memoryStore.getWeek("2026-10-03")
  assert.deepEqual(result.events.find((e) => e.id === target.id), target)
  assert.ok(!result.events.some((e) => e.id === applied.createdEventIds[0]))
  assert.ok(result.events.some((e) => e.id === unrelated.createdEventIds[0]))
})

test("Undo cannot delete a newly created block after work has been recorded", async () => {
  const applied = await memoryStore.applyChanges([{ action: "create", date: "2026-10-06", startMin: 700, endMin: 760,
    title: "Focus", kind: "work", reason: "Add" }])
  const id = applied.createdEventIds[0]
  await memoryStore.logTime(id, 15, "")
  await assert.rejects(memoryStore.deleteEvent(id), /recorded work/)
})

test("Undo preserves the status implied by work logged after a move", () => {
  const before = event({ id: "e", date: "2026-10-03", startMin: 600, endMin: 660, status: "planned" as const,
    actualMinutes: 0, kind: "work" as const, taskId: null, projectId: null, title: "Focus",
    movedFromDate: null, movedFromStartMin: null })
  const change: ScheduleChange = { action: "move", eventId: "e", startMin: 700, endMin: 760, reason: "Move" }
  const [moved] = applyChanges([before], [change])
  const result = scheduleUndo([before], [{ ...moved, actualMinutes: 15, status: "partial" }], [change], [])
  assert.equal(result.restore[0].patch.status, "partial")
})

test("individual Undo matches same-time created blocks by their identity", () => {
  const changes: ScheduleChange[] = [
    { action: "create", title: "Dinner", date: "2026-10-06", startMin: 700, endMin: 760, kind: "life", reason: "Add" },
    { action: "create", title: "Make-up work", date: "2026-10-06", startMin: 700, endMin: 760, taskId: "t", reason: "Add" },
  ]
  const events = applyChanges([], changes)
  events[1].projectId = "p"
  const ids = createdIdsByChange(changes, { ...week(), events: [...events].reverse(), createdEventIds: events.map((e) => e.id).reverse(), previousEvents: [] })
  assert.deepEqual(ids, events.map((e) => [e.id]))
})

test("undoing the later item in a batch preserves an earlier shortening", () => {
  const before = event()
  const changes: ScheduleChange[] = [
    { action: "shorten", eventId: before.id, endMin: 630, reason: "Shorter" },
    { action: "move", eventId: before.id, date: "2026-10-06", startMin: 700, endMin: 730, reason: "Move" },
  ]
  const current = applyChanges([before], changes)
  const items = appliedProposalItems(changes, { ...week(), events: current, createdEventIds: [], previousEvents: [before] })
  const undo = scheduleUndo(items[1].before!, current, [items[1].change], [])
  assert.equal(undo.restore[0].patch.date, before.date)
  assert.equal(undo.restore[0].patch.endMin, 630)
  assert.throws(() => scheduleUndo(items[0].before!, current, [items[0].change], []), /changed after this proposal/)
})

test("an older Undo cannot overwrite a later move or explicit completion", () => {
  const before = event()
  const move: ScheduleChange = { action: "move", eventId: before.id, startMin: 700, endMin: 760, reason: "Move" }
  const moved = applyChanges([before], [move])
  assert.throws(() => scheduleUndo([before], [{ ...moved[0], startMin: 800, endMin: 860 }], [move], []), /changed after this proposal/)
  assert.throws(() => scheduleUndo([before], [{ ...moved[0], status: "completed" }], [move], []), /changed after this proposal/)
})
