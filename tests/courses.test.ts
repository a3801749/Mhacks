import assert from "node:assert/strict"
import { test } from "node:test"
import { attentionWeight, categoryStats, estimateProject, groupKey, pinPreferences, rhythmBins } from "../src/lib/analytics"
import { courseList, matchesCourse } from "../src/lib/courses"
import { event, project, week } from "./fixtures"

test("course list merges standalone courses with ones named by assignments", () => {
  const data = week({
    courses: [{ name: "Spanish 102", color: "#111111" }, { name: "eecs", color: "#222222" }],
    projects: [project({ course: "EECS", color: "#333333" }), project({ id: "p2", course: "Math 215", color: "#444444" })],
  })
  assert.deepEqual(courseList(data).map((c) => [c.name, c.color, c.standalone]), [
    ["eecs", "#222222", true],
    ["Math 215", "#444444", false],
    ["Spanish 102", "#111111", true],
  ])
})

test("one course filter includes differently capitalized or spaced assignment names", () => {
  const selected = new Set(["CHEM 101"])
  assert.equal(matchesCourse("chem 101", selected), true)
  assert.equal(matchesCourse(" CHEM   101 ", selected), true)
  assert.equal(matchesCourse("CHEM 102", selected), false)
  assert.equal(matchesCourse("CHEM 101", new Set()), true)
})

test("course analytics merge matching names and use the saved course color", () => {
  const data = week({
    courses: [{ name: "CHEM 101", color: "#5FA3B8" }],
    projects: [project({ course: "chem 101" }), project({ id: "p2", course: " CHEM   101 " })],
  })
  const groups = ["p", "p2"].map((id) => groupKey(id, data, "course"))
  assert.deepEqual(groups[0], { key: "chem 101", label: "CHEM 101", color: "#5FA3B8" })
  assert.deepEqual(groups[0], groups[1])
  assert.equal(courseList(data).length, 1)
  const result = rhythmBins(["p", "p2"].map((projectId) => ({ date: "2026-10-03", start: 600, end: 630, minutes: 30, projectId })), data, "course")
  assert.equal(result.legend.length, 1)
  assert.equal(result.legend[0].minutes, 60)
})

test("estimates learn from the same course despite different capitalization and spacing", () => {
  const next = project({ course: "chem 101", targetMinutes: 120 })
  const data = week({
    courses: [{ name: "CHEM 101", color: "#5FA3B8" }],
    projects: [next, ...["CHEM 101", " CHEM   101 ", "MATH 101"].map((course, i) => project({
      id: `old-${i}`, course, targetMinutes: 60, completedDate: "2026-10-01",
    }))],
    events: [120, 120, 30].map((actualMinutes, i) => event({
      id: `worked-${i}`, projectId: `old-${i}`, taskId: null, actualMinutes, status: "completed",
    })),
  })
  const stats = categoryStats(data)
  assert.equal(stats.find((s) => s.key === "chem 101|project")?.samples, 2)
  assert.equal(stats.find((s) => s.key === "chem 101|project")?.course, "CHEM 101")
  assert.equal(estimateProject(next, data, stats).total, 240)
})

test("pin habits merge course names and weight all assignments in that course", () => {
  const data = week({
    courses: [{ name: "CHEM 101", color: "#5FA3B8" }],
    projects: [
      project({ course: "CHEM 101", pinCount: 2 }),
      project({ id: "p2", course: " chem   101 ", pinCount: 2 }),
      project({ id: "p3", course: "MATH 101", pinCount: 3 }),
    ],
  })
  const prefs = pinPreferences(data)!
  assert.equal(prefs.course, "CHEM 101")
  assert.equal(prefs.courseShare, 4 / 7)
  assert.equal(prefs.totalPins, 7)
  assert.equal(attentionWeight(data.projects[0], prefs), attentionWeight(data.projects[1], prefs))
  assert.ok(attentionWeight(data.projects[1], prefs) > attentionWeight(data.projects[2], prefs))
})
