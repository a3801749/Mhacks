import assert from "node:assert/strict"
import { test } from "node:test"
import { backtrack, displayedPercent, estimateProject, moodCorrelation, projectHealth, projectLogged, rhythmInsights } from "../src/lib/analytics"
import { recentMood } from "../src/lib/ai/planner"
import { event, project, today, week } from "./fixtures"

test("life commitments and work after the deadline cannot cover an assignment", () => {
  const data = week({ events: [
    event(),
    event({ id: "life", kind: "life", taskId: null, startMin: 700, endMin: 1000 }),
    event({ id: "late", date: "2026-10-06", startMin: 700, endMin: 1000 }),
    event({ id: "skipped", status: "skipped", startMin: 1000, endMin: 1200 }),
  ] })
  const health = projectHealth(data, today)[0]
  assert.equal(health.scheduledAhead, 60)
  assert.equal(health.pace, "behind")
})

test("logging past the estimate with explicitly zero progress does not finish the assignment", () => {
  const p = project({ targetMinutes: 120, progressPercent: 0 })
  const data = week({ projects: [p], logs: [
    { id: "l", taskId: "t", eventId: null, minutes: 180, note: "", createdAt: today },
  ] })
  assert.equal(estimateProject(p, data).uncertain, true)
  assert.equal(projectHealth(data, today)[0].pace, "behind")
})

test("fully reported completion still shows done", () => {
  assert.equal(projectHealth(week({ projects: [project({ progressPercent: 100 })] }), today)[0].pace, "done")
})

test("assignment focus without a task contributes to estimates without counting task logs twice", () => {
  const p = project({ progressPercent: 50 })
  const data = week({ projects: [p], events: [
    event({ actualMinutes: 15 }),
    event({ id: "assignment-focus", taskId: null, actualMinutes: 45 }),
    event({ id: "independent", projectId: null, taskId: null, actualMinutes: 60 }),
    event({ id: "life", kind: "life", taskId: null, actualMinutes: 90 }),
  ], logs: [{ id: "l", taskId: "t", eventId: "e", minutes: 15, note: "", createdAt: today }] })
  assert.equal(projectLogged(p.id, data.tasks, data.logs, data.events), 60)
  assert.equal(estimateProject(p, data).remaining, 60)
  assert.equal(projectHealth(data, today)[0].logged, 60)
  data.events[1].actualMinutes = 30 // A time removal reduces the stored total.
  assert.equal(projectHealth(data, today)[0].logged, 45)
})

test("disabled check-ins are excluded from both planning and rhythm", () => {
  const data = week({
    checkIns: [
      { date: "2026-09-28", rating: 8, note: "" },
      { date: "2026-09-29", rating: 3, note: "" },
      { date: "2026-09-30", rating: 3, note: "" },
      { date: "2026-10-01", rating: 8, note: "" },
      { date: "2026-10-02", rating: 8, note: "" },
    ],
    events: [
      event({ id: "late1", date: "2026-09-28", startMin: 1380, endMin: 1440, actualMinutes: 60 }),
      event({ id: "late2", date: "2026-09-29", startMin: 1380, endMin: 1440, actualMinutes: 60 }),
    ],
  })
  assert.ok(moodCorrelation(data, "2026-09-28", today))
  assert.equal(recentMood(data, today).length, 3)
  data.settings.checkInEnabled = false
  assert.equal(moodCorrelation(data, "2026-09-28", today), null)
  assert.deepEqual(recentMood(data, today), [])
  assert.ok(!rhythmInsights(data, today, 7).some((i) => i.title.includes("next day")))
})

test("an assignment finished with nothing logged does not zero out its category's estimates", () => {
  const finished = project({ id: "old", type: "exam", completedDate: "2026-09-20", progressPercent: 100 })
  const next = project({ id: "p", type: "exam" })
  const data = week({ projects: [finished, next] })
  const estimate = estimateProject(next, data)
  assert.equal(estimate.total, next.targetMinutes)
  assert.notEqual(projectHealth(data, today).find((h) => h.project.id === "p")!.pace, "done")
})

test("looking back ignores future blocks even after they are skipped", () => {
  const data = week({ events: [
    event({ id: "past", date: "2026-10-02", actualMinutes: 60, status: "completed" }),
    event({ id: "future", date: "2026-10-05", status: "skipped" }),
  ] })
  const stats = backtrack(data, today)
  assert.equal(stats.counts.total, 1)
  assert.equal(stats.windowEnd, "2026-10-02")
})

test("displayed progress falls back to logged share until progress is reported", () => {
  const p = project({ targetMinutes: 240 })
  const data = week({ projects: [p], logs: [{ id: "l", taskId: "t", eventId: null, minutes: 60, note: "", createdAt: today }] })
  assert.equal(displayedPercent(p, data), 25)
  assert.equal(displayedPercent({ ...p, progressPercent: 70 }, data), 70)
})
