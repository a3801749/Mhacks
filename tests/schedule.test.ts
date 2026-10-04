import assert from "node:assert/strict"
import { test } from "node:test"
import { findOpenSlot } from "../src/lib/schedule"
import { sanitizeScheduleChanges, validateScheduleChanges } from "../src/lib/schedule-validation"
import { event, today, week } from "./fixtures"

const now = { date: today, minute: 600 }
const create = { action: "create", date: today, startMin: 700, endMin: 760, taskId: "t", projectId: "p", reason: "Work" }

test("model proposals reject invalid references, dates, intervals, and past destinations", () => {
  const invalid = [
    null, { ...create, action: "delete" }, { ...create, taskId: "invented" },
    { ...create, projectId: "invented" }, { ...create, date: "2026-02-31" },
    { ...create, startMin: 900 }, { ...create, startMin: 599 },
    { ...create, startMin: 700.5 }, { ...create, endMin: NaN },
    { ...create, startMin: 100, endMin: 200 },
  ]
  assert.deepEqual(sanitizeScheduleChanges(invalid, week(), now), [])
  assert.deepEqual(sanitizeScheduleChanges([
    { action: "move", eventId: "e", date: today, startMin: 500, endMin: 560, reason: "Move" },
  ], week({ events: [event({ date: "2026-10-04" })] }), now), [])
})

test("model proposals respect life commitments and other changes in the same batch", () => {
  const data = week({ events: [event({ kind: "life", taskId: null, startMin: 700, endMin: 720 })] })
  assert.deepEqual(sanitizeScheduleChanges([create], data, now), [])
  const accepted = sanitizeScheduleChanges([create, { ...create, startMin: 750, endMin: 800 }], week(), now)
  assert.equal(accepted.length, 1)
})

test("manual scheduling preserves unassigned focus blocks and deliberately allowed overlaps", () => {
  const data = week({ events: [event({ startMin: 700, endMin: 760 })] })
  const [change] = validateScheduleChanges([{ ...create, taskId: null, projectId: null, kind: "work" }], data)
  assert.equal(change.kind, "work")
  assert.equal(change.taskId, null)
})

test("stale proposals cannot move completed blocks", () => {
  const change = { action: "move", eventId: "e", date: today, startMin: 800, endMin: 860, reason: "Move" }
  const data = week({ events: [event({ status: "completed" })] })
  assert.throws(() => validateScheduleChanges([change], data), /no longer planned/)
})

test("open-slot search never extends past its waking-hours boundary", () => {
  assert.equal(findOpenSlot([event({ startMin: 1320, endMin: 1380 })], [today], 120, { date: today, minute: 1170 }), null)
})
