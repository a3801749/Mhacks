import assert from "node:assert/strict"
import { test } from "node:test"
import { courseList } from "../src/lib/courses"
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
