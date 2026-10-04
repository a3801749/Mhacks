import test from "node:test"
import assert from "node:assert/strict"
import { eventLanes, movedWindow, resizedWindow } from "../src/lib/grid-editing"
import { event } from "./fixtures"

test("moving snaps to quarter hours and preserves length at both midnight boundaries", () => {
  const e = event({ startMin: 600, endMin: 720, actualMinutes: 45 })
  assert.deepEqual(movedWindow(e, "2026-10-04", 1430), { date: "2026-10-04", startMin: 1320, endMin: 1440 })
  assert.deepEqual(movedWindow(e, e.date, -60), { date: e.date, startMin: 0, endMin: 120 })
  assert.equal(movedWindow(e, e.date, 738, 20).startMin, 720)
  assert.equal(e.actualMinutes, 45)
})

test("resize keeps the start, a minimum duration, and a same-day end", () => {
  const e = event()
  assert.equal(resizedWindow(e, -100).endMin, 615)
  assert.equal(resizedWindow(e, 1000).endMin, 1440)
  assert.equal(resizedWindow(e, 23).endMin, 690)
})

test("overlapping and short cards stay reachable in independent lanes", () => {
  const rows = [event({ id: "a", endMin: 900 }), event({ id: "b", startMin: 630, endMin: 660 }), event({ id: "c", startMin: 720, endMin: 780 }), event({ id: "d", startMin: 900, endMin: 960 })]
  const lanes = eventLanes(rows)
  assert.deepEqual(lanes.get("a"), { lane: 0, lanes: 2 })
  assert.deepEqual(lanes.get("c"), { lane: 1, lanes: 2 })
  assert.deepEqual(lanes.get("d"), { lane: 0, lanes: 1 })
  assert.equal(eventLanes([event({ id: "x", endMin: 615 }), event({ id: "y", startMin: 615, endMin: 630 })], 40).get("x")?.lanes, 2)
})
