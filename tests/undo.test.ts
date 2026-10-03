import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import { memoryStore } from "../src/lib/store/memory"
import { scheduleUndo } from "../src/lib/undo"
import type { ScheduleChange } from "../src/lib/types"

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
  const before = { id: "e", date: "2026-10-03", startMin: 600, endMin: 660, status: "planned" as const,
    actualMinutes: 0, kind: "work" as const, taskId: null, projectId: null, title: "Focus",
    movedFromDate: null, movedFromStartMin: null }
  const result = scheduleUndo([before], [{ ...before, actualMinutes: 15, status: "partial" }],
    [{ action: "move", eventId: "e", reason: "Move" }], [])
  assert.equal(result.restore[0].patch.status, "partial")
})
