import assert from "node:assert/strict"
import { test } from "node:test"
import { adjustmentChanges } from "../src/lib/ai/adjustment"
import { parseScheduleRequest } from "../src/lib/ai/fallback"
import { event, today, week } from "./fixtures"

const now = { date: today, minute: 540 }
const date = "2026-10-07"
const request = parseScheduleRequest("Create a lunch with Sam event for Wednesday at noon", [], today)!

test("incomplete lunch output is repaired without moving unrelated Prototype or reading blocks", () => {
  const data = week({ events: [
    event({ title: "Prototype voice flow", startMin: 780, endMin: 870 }),
    event({ id: "reading", title: "Reading notes", date, startMin: 480, endMin: 570 }),
  ] })
  const changes = adjustmentChanges([
    { action: "create", title: "Lunch With Sam", kind: "life", reason: "Lunch requested" },
    { action: "move", eventId: "e", date: today, startMin: 705, endMin: 795, reason: "Make room" },
    { action: "move", eventId: "reading", date, startMin: 480, endMin: 570, reason: "Move earlier" },
  ], data, request, now)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].action, "create")
  assert.equal(changes[0].title, "Lunch With Sam")
  assert.equal(changes[0].date, date)
  assert.equal(changes[0].startMin, 720)
  assert.equal(changes[0].endMin, 780)
})

test("personal lunch stays independent when the model incorrectly attaches an assignment", () => {
  const changes = adjustmentChanges([
    { action: "create", title: "Lunch with Sam", kind: "work", taskId: "t", projectId: "p",
      date, startMin: 720, endMin: 840, reason: "Requested" },
  ], week(), request, now)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].kind, "life")
  assert.equal(changes[0].taskId, null)
  assert.equal(changes[0].projectId, null)
  assert.equal(changes[0].endMin, 780)
})

test("the user's stated duration takes precedence over the model's invented duration", () => {
  const halfHour = parseScheduleRequest("schedule lunch with Sam Wednesday at noon for 30 minutes", [], today)!
  const changes = adjustmentChanges([
    { action: "create", title: "Lunch with Sam", date, startMin: 720, endMin: 840, kind: "life", reason: "Lunch" },
  ], week(), halfHour, now)
  assert.equal(changes[0].endMin, 750)
})

test("the requested lunch excludes extra make-up work the model was not asked to create", () => {
  const changes = adjustmentChanges([
    { action: "create", title: "Make-up work", kind: "work", taskId: "t", projectId: "p",
      date, startMin: 600, endMin: 660, reason: "Catch up" },
  ], week(), request, now)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].title, "Lunch with Sam")
})

test("a dropped requested event cannot leave behind a move to accommodate it", () => {
  const data = week({ events: [event({ date, startMin: 720, endMin: 900 })] })
  const changes = adjustmentChanges([
    { action: "move", eventId: "e", date: "2026-10-08", startMin: 600, endMin: 780, reason: "Room" },
  ], data, request, { date, minute: 800 })
  assert.deepEqual(changes, [])
})

test("a no-op model move is replaced only when a real block overlaps the requested lunch", () => {
  const data = week({ events: [event({ date, startMin: 720, endMin: 780 })] })
  const changes = adjustmentChanges([
    { action: "move", eventId: "e", date, startMin: 720, endMin: 780, reason: "Earlier" },
  ], data, request, now)
  const create = changes.find((c) => c.action === "create")!
  const move = changes.find((c) => c.action === "move")!
  assert.equal(changes.length, 2)
  assert.equal(create.startMin, 720)
  assert.equal(move.eventId, "e")
  assert.notEqual(move.startMin, 720)
  assert.equal(move.endMin! - move.startMin!, 60)
})
