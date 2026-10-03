import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import { memoryStore } from "../src/lib/store/memory"
import type { WeekData } from "../src/lib/types"

let eventId: string

beforeEach(async () => {
  const week = await memoryStore.reset("2026-10-03")
  eventId = week.events.find((e) => e.taskId && e.status === "planned")!.id
})

function assertLedger(week: WeekData, expected: number) {
  assert.equal(week.events.find((e) => e.id === eventId)!.actualMinutes, expected)
  assert.equal(week.logs.filter((l) => l.eventId === eventId).reduce((sum, l) => sum + l.minutes, 0), expected)
}

test("removing more than logged records only the applied removal", async () => {
  await memoryStore.logTime(eventId, 25, "")
  const week = await memoryStore.logTime(eventId, -45, "")
  assertLedger(week, 0)
  assert.equal(week.logs.at(-1)!.minutes, -25)
  assert.equal(week.events.find((e) => e.id === eventId)!.status, "planned")
})

test("an edit cannot invalidate a later removal or partially save its note", async () => {
  const added = await memoryStore.logTime(eventId, 60, "original")
  const log = added.logs.at(-1)!
  await memoryStore.logTime(eventId, -60, "removal")
  await assert.rejects(memoryStore.updateLog(log.id, { minutes: 10, note: "changed" }), /negative/)
  const week = await memoryStore.getWeek("2026-10-03")
  assertLedger(week, 0)
  assert.equal(week.logs.find((l) => l.id === log.id)!.note, "original")
})

test("deleting an addition that supports a later removal is rejected", async () => {
  const added = await memoryStore.logTime(eventId, 60, "")
  const log = added.logs.at(-1)!
  await memoryStore.logTime(eventId, -60, "")
  await assert.rejects(memoryStore.deleteLog(log.id), /negative/)
  assertLedger(await memoryStore.getWeek("2026-10-03"), 0)
})

test("editing and deleting signed entries preserve the block total and status", async () => {
  const added = await memoryStore.logTime(eventId, 60, "")
  const addition = added.logs.at(-1)!
  const removed = await memoryStore.logTime(eventId, -25, "")
  const removal = removed.logs.at(-1)!
  assertLedger(await memoryStore.updateLog(removal.id, { minutes: -15 }), 45)
  assertLedger(await memoryStore.deleteLog(removal.id), 60)
  const week = await memoryStore.deleteLog(addition.id)
  assertLedger(week, 0)
  assert.equal(week.events.find((e) => e.id === eventId)!.status, "planned")
})
