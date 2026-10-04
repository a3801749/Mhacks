import test from "node:test"
import assert from "node:assert/strict"
import { timelineTicks } from "../src/lib/timeline-layout"

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
