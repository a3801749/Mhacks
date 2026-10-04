import assert from "node:assert/strict"
import { test } from "node:test"
import { mockAdjust, parseScheduleRequest, scheduleClarification, withRequestedEvent } from "../src/lib/ai/fallback"
import type { ScheduleChange } from "../src/lib/types"
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

test("new-event wording and spoken clock times identify the requested lunch", () => {
  for (const message of [
    "Create a lunch with Sam event for Wednesday at noon.",
    "I'd like a new lunch with Sam event on Wednesday at noon.",
    "Can you schedule lunch with Sam this Wednesday at twelve pm?",
  ]) {
    const request = parseScheduleRequest(message, [], today)
    assert.equal(request?.title, "Lunch with Sam")
    assert.equal(request?.date, wednesday)
    assert.equal(request?.startMin, 720)
  }
  assert.equal(parseScheduleRequest("schedule lunch with Sam Wednesday at one thirty pm", [], today)?.startMin, 810)
  assert.equal(parseScheduleRequest("schedule lunch with Sam Wednesday at 13:30", [], today)?.startMin, 810)
})

test("the reported wanna-have-lunch request creates lunch instead of moving Prototype voice flow", () => {
  const message = "I wanna have lunch with sam again on wednesday at 3pm for an hour,"
  const data = week({ events: [event({ title: "Prototype voice flow" })] })
  assert.deepEqual(parseScheduleRequest(message, [], today),
    { title: "Lunch with Sam", date: wednesday, startMin: 900, endMin: 960 })
  const result = mockAdjust(data, message, [], { date: today, minute: 540 })
  assert.deepEqual(result.changes.map((c) => c.action), ["create"])
  assert.equal(result.changes[0].title, "Lunch with Sam")
  assert.equal(result.changes[0].startMin, 900)
})

test("the reported spoken repeat retains the same lunch's time from the user's prior turn", () => {
  const history = [
    { role: "user" as const, text: "I wanna have lunch with sam again on wednesday at 3pm for an hour," },
    { role: "agent" as const, text: "No stress. How about Prototype voice flow at 11:45 a.m. today? That's when you tend to actually get things done." },
  ]
  assert.deepEqual(parseScheduleRequest("I want to have lunch with Sam on Wednesday", history, today),
    { title: "Lunch with Sam", date: wednesday, startMin: 900, endMin: 960 })
  assert.equal(parseScheduleRequest("I want to have coffee with Sam on Wednesday", history, today), null)
})

test("missing lunch times ask for that detail instead of moving unrelated work", () => {
  for (const guidanceMode of ["anchor", "coach", "autopilot"] as const) {
    const data = week({ events: [event({ title: "Prototype voice flow" })] })
    data.settings.guidanceMode = guidanceMode
    for (const message of ["Schedule a new lunch with Sam on Wednesday.", "I'd like a new lunch with Sam event on Wednesday."]) {
      const result = mockAdjust(data, message, [], { date: today, minute: 540 })
      assert.deepEqual(result.changes, [])
      assert.match(result.reply, /what time/i)
      assert.match(result.reply, /Lunch with Sam/)
      assert.match(result.reply, /Wednesday/)
    }
  }
})

test("a short answer completes the pending lunch request without reusing finished requests", () => {
  const history = [
    { role: "user" as const, text: "Schedule a new lunch with Sam on Wednesday." },
    { role: "agent" as const, text: "What time on Wednesday should I set for Lunch with Sam?" },
  ]
  assert.deepEqual(parseScheduleRequest("Noon please", history, today),
    { title: "Lunch with Sam", date: wednesday, startMin: 720, endMin: 780 })
  assert.equal(parseScheduleRequest("noon", [{ ...history[0], text: "schedule lunch Wednesday at noon" },
    { ...history[1], text: "Lunch is ready to add." }], today), null)
  assert.equal(parseScheduleRequest("move my work instead", history, today), null)
})

test("negated and hypothetical scheduling messages do not force a new event", () => {
  for (const message of ["don't schedule dinner at 8pm Wednesday", "do not add coffee at 9am tomorrow", "What if I schedule dinner at 8pm?", "Should I schedule a call at 2pm?"]) {
    assert.equal(parseScheduleRequest(message, [], today), null)
  }
})

test("the offline fallback leaves work alone when scheduling is declined or only a question", () => {
  for (const guidanceMode of ["coach", "autopilot"] as const) {
    const data = week({ events: [event()] })
    data.settings.guidanceMode = guidanceMode
    for (const message of ["don't schedule dinner at 8pm Wednesday", "do not add coffee at 9am tomorrow", "What if I schedule dinner at 8pm?", "Should I schedule a call at 2pm?"]) {
      assert.deepEqual(mockAdjust(data, message, [], { date: today, minute: 540 }).changes, [])
    }
  }
})

test("declined and hypothetical edits are handled before Gemini or fallback can move work", () => {
  for (const message of ["Don't move my work", "Do not skip Prototype voice flow", "What if I reschedule my work?", "Should I cancel reading?", "I don't want lunch with Sam"]) {
    assert.ok(scheduleClarification(message, [], today), message)
    const result = mockAdjust(week({ events: [event()] }), message, [], { date: today, minute: 540 })
    assert.deepEqual(result.changes, [], message)
  }
})

test("unsupported messages never default to moving the first work block", () => {
  for (const guidanceMode of ["anchor", "coach", "autopilot"] as const) {
    const data = week({ events: [event({ title: "Prototype voice flow" })] })
    data.settings.guidanceMode = guidanceMode
    for (const message of ["Hello", "What's on my calendar Wednesday?", "I don't want lunch with Sam", "Please explain my calendar", "Yes please"]) {
      const result = mockAdjust(data, message, [], { date: today, minute: 540 })
      assert.deepEqual(result.changes, [], message)
      assert.doesNotMatch(result.reply, /Prototype voice flow/)
    }
  }
})

test("explicit work adjustments and the existing quick prompts still work offline", () => {
  const data = week({ events: [event()] })
  for (const message of ["I'm ordering pizza instead", "I'm not doing this right now, move it", "Move my evening work to tomorrow morning"]) {
    assert.equal(mockAdjust(data, message, [], { date: today, minute: 540 }).changes[0]?.action, "move")
  }
  const shorter = mockAdjust(data, "Can we just do 25 minutes?", [], { date: today, minute: 540 })
  assert.equal(shorter.changes[0]?.action, "shorten")
  assert.equal(shorter.changes[0]?.endMin, 625)
})

test("an Anchor confirmation continues its pending move, not an unrelated conversation", () => {
  const data = week({ events: [event()] })
  data.settings.guidanceMode = "anchor"
  const first = mockAdjust(data, "Move my work to tomorrow", [], { date: today, minute: 540 })
  assert.deepEqual(first.changes, [])
  const confirmed = mockAdjust(data, "Yes please", [{ role: "user", text: "Move my work to tomorrow" }, { role: "agent", text: first.reply }], { date: today, minute: 540 })
  assert.equal(confirmed.changes[0]?.action, "move")
  const unrelated = mockAdjust(data, "Yes please", [{ role: "agent", text: "What time should I set for lunch?" }], { date: today, minute: 540 })
  assert.deepEqual(unrelated.changes, [])
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

test("a make-up work create does not replace the dinner the user requested", () => {
  const request = parseScheduleRequest("schedule dinner with Sam at 8pm Wednesday", [], today)
  const makeup: ScheduleChange = { action: "create", taskId: "t", projectId: "p", title: "Make-up work", date: wednesday, startMin: 600, endMin: 660, reason: "Catch up" }
  const changes = withRequestedEvent([makeup], request)
  assert.equal(changes.length, 2)
  assert.deepEqual(changes[0], { action: "create", kind: "life", title: "Dinner with Sam", date: wednesday, startMin: 1200, endMin: 1260, reason: "You asked for it." })
  assert.deepEqual(changes[1], makeup)
  assert.equal(sanitizeScheduleChanges(changes, week(), { date: today, minute: 600 }).length, 2)
})

test("only the requested create is filled, at the user's requested date and time", () => {
  const request = parseScheduleRequest("schedule dinner with Sam at 8pm Wednesday", [], today)
  const changes: ScheduleChange[] = [
    { action: "create", title: "Dinner with Sam", startMin: 1260, endMin: 1350, date: "2026-10-08", reason: "Asked" },
    { action: "create", taskId: "t", projectId: "p", reason: "Make up work" },
  ]
  const result = withRequestedEvent(changes, request)
  assert.equal(result[0].date, wednesday)
  assert.equal(result[0].startMin, 1200)
  assert.equal(result[0].endMin, 1260)
  assert.deepEqual(result[1], changes[1])
  assert.equal(sanitizeScheduleChanges(result, week(), { date: today, minute: 600 }).length, 1)
})

test("the local reply acknowledges an overlap when a commitment cannot be moved", () => {
  const commitment = event({ title: "All-day commitment", kind: "life", taskId: null, projectId: null, date: wednesday, startMin: 360, endMin: 1440 })
  const result = mockAdjust(week({ events: [commitment] }), "schedule dinner at 8pm Wednesday", [], { date: today, minute: 600 })
  assert.equal(result.changes.length, 1)
  assert.match(result.reply, /still an overlap/)
  assert.doesNotMatch(result.reply, /already free/)
})
