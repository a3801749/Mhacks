import test from "node:test"
import assert from "node:assert/strict"
import { progressFill, progressLag, timelineTicks } from "../src/lib/timeline-layout"

test("short timelines retain daily labels and Monday grid lines", () => {
  const layout = timelineTicks("2026-10-03", "2026-10-10")
  assert.equal(layout.labels.length, 7)
  assert.deepEqual(layout.grid, ["2026-10-05"])
})

test("extending a deadline by years keeps chart marks bounded", () => {
  const layout = timelineTicks("2026-10-03", "9999-12-31")
  assert.ok(layout.labels.length <= 12)
  assert.ok(layout.grid.length <= 12)
  assert.ok(layout.days > 2_000_000)
})

test("progress fill tracks small percentage changes without day rounding", () => {
  const forty = progressFill("2026-10-01", "2026-10-04", "2026-10-01", 40)
  const fifty = progressFill("2026-10-01", "2026-10-04", "2026-10-01", 50)
  assert.equal(forty.span, 4)
  assert.ok(fifty.length > forty.length)
  assert.equal(fifty.length, 2)
})

test("reported progress fills from the assigned date when nothing is logged", () => {
  const fill = progressFill("2026-10-01", "2026-10-10", null, 30)
  assert.equal(fill.origin, "2026-10-01")
  assert.equal(fill.length, 3)
})

test("dragging the due date before the first logged day keeps the fill inside the bar", () => {
  const fill = progressFill("2026-10-01", "2026-10-03", "2026-10-06", 80)
  assert.equal(fill.origin, "2026-10-03")
  assert.equal(fill.span, 1)
  assert.ok(fill.length <= fill.span)
})

test("logging before the assigned date does not start the fill early", () => {
  const fill = progressFill("2026-10-05", "2026-10-14", "2026-10-02", 50)
  assert.equal(fill.origin, "2026-10-05")
  assert.equal(fill.length, 5)
})

test("out-of-range percentages clamp to the bar", () => {
  assert.equal(progressFill("2026-10-01", "2026-10-04", null, 150).length, 4)
  assert.equal(progressFill("2026-10-01", "2026-10-04", null, -20).length, 0)
})

test("pace lag compares the fill end with today", () => {
  const fill = progressFill("2026-10-01", "2026-10-10", "2026-10-01", 50)
  assert.equal(progressLag(fill, "2026-10-04"), -2)
  assert.equal(progressLag(fill, "2026-10-08"), 2)
})
