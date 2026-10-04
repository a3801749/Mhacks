import assert from "node:assert/strict"
import { test } from "node:test"
import { groupKey, rhythmBins } from "../src/lib/analytics"
import { courseList, matchesCourse } from "../src/lib/courses"
import { project, week } from "./fixtures"

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
