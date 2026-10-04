import test from "node:test"
import assert from "node:assert/strict"
import { addableSlot, bookedMinutes, gapBefore } from "../src/lib/day-layout"
import { event, today } from "./fixtures"

test("booked totals include personal events after skip and restore", () => {
  const life = event({ kind: "life", projectId: null, taskId: null, startMin: 600, endMin: 780 })
  assert.equal(bookedMinutes([life], today), 180)
  assert.equal(bookedMinutes([{ ...life, status: "skipped" }], today), 0)
  assert.equal(bookedMinutes([{ ...life, status: "planned" }], today), 180)
})

test("nested blocks do not create false gaps inside a longer block", () => {
  const blocks = [event({ endMin: 900 }), event({ startMin: 630, endMin: 660 }), event({ startMin: 720 })]
  assert.equal(gapBefore(blocks, 2), 900)
  assert.equal(addableSlot(gapBefore(blocks, 2), 720), null)
})

test("gap creation respects the current minute, midnight, and minimum duration", () => {
  assert.deepEqual(addableSlot(660, 1440, 1410), { startMin: 1410, endMin: 1440 })
  assert.equal(addableSlot(660, 1440, 1430), null)
  assert.equal(addableSlot(660, 680, 670), null)
  assert.deepEqual(addableSlot(660, 720), { startMin: 660, endMin: 720 })
})
