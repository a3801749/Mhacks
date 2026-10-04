import assert from "node:assert/strict"
import { test } from "node:test"
import { mockAdjust, parseScheduleRequest } from "../src/lib/ai/fallback"
import { sanitizeScheduleChanges } from "../src/lib/schedule-validation"
import { event, today, week } from "./fixtures"

const wednesday = "2026-10-07"

test("a requested event survives even when listed before the move that frees its slot", () => {
  const study = event({ id: "study", kind: "life", projectId: null, taskId: null, title: "Study group", date: wednesday, startMin: 1140, endMin: 1260 })
  const data = week({ events: [study] })
  const out = sanitizeScheduleChanges([
    { action: "create", kind: "life", title: "Dinner with Sam", date: wednesday, startMin: 1200, endMin: 1260, reason: "Asked" },
    { action: "move", eventId: "study", date: wednesday, startMin: 1020, endMin: 1140, reason: "Room" },
  ], data, { date: today, minute: 600 })
  assert.deepEqual(out.map((c) => c.action), ["move", "create"])
})

test("personal events may run late; focus work keeps study hours", () => {
  const data = week()
  const late = { action: "create", date: wednesday, startMin: 1320, endMin: 1380, reason: "Asked" }
  assert.equal(sanitizeScheduleChanges([{ ...late, kind: "life", title: "Movie" }], data, { date: today, minute: 600 }).length, 1)
  assert.equal(sanitizeScheduleChanges([{ ...late, taskId: "t", projectId: "p" }], data, { date: today, minute: 600 }).length, 0)
})

test("schedule requests resolve the title, weekday, and time", () => {
  const history = [{ role: "user" as const, text: "I wasn't able to get dinner with sam yesterday." }]
  assert.deepEqual(parseScheduleRequest("can you schedule something for 8pm on wednesday?", history, today),
    { title: "Dinner with Sam", date: wednesday, startMin: 1200, endMin: 1260 })
  assert.deepEqual(parseScheduleRequest("I missed dinner with sam. Can you schedule something for 8pm on wednesday?", [], today)?.title, "Dinner with Sam")
  assert.equal(parseScheduleRequest("add coffee at 9:30am tomorrow", [], today)?.startMin, 570)
  assert.equal(parseScheduleRequest("move my evening work to tomorrow", [], today), null)
})

test("the offline fallback creates the event and moves what is in the way", () => {
  const study = event({ id: "study", kind: "life", projectId: null, taskId: null, title: "Study group", date: wednesday, startMin: 1140, endMin: 1260 })
  const res = mockAdjust(week({ events: [study] }), "I wasn't able to get dinner with sam yesterday. can you schedule something for 8pm on wednesday?", [], { date: today, minute: 600 })
  assert.equal(res.changes[0].action, "create")
  assert.equal(res.changes[0].title, "Dinner with Sam")
  assert.deepEqual(res.changes.slice(1).map((c) => [c.action, c.eventId, c.startMin]), [["move", "study", 1080]])
})

test("a requested personal event is kept even when nothing makes room for it", () => {
  const study = event({ id: "study", kind: "life", projectId: null, taskId: null, title: "Study group", date: wednesday, startMin: 1140, endMin: 1260 })
  const dinner = { action: "create", kind: "life", title: "Dinner with Sam", date: wednesday, startMin: 1200, endMin: 1260, reason: "Asked" }
  assert.equal(sanitizeScheduleChanges([dinner], week({ events: [study] }), { date: today, minute: 600 }).length, 1)
  const work = { action: "create", taskId: "t", projectId: "p", date: wednesday, startMin: 1200, endMin: 1260, reason: "Make-up" }
  assert.equal(sanitizeScheduleChanges([work], week({ events: [study] }), { date: today, minute: 600 }).length, 0)
})
