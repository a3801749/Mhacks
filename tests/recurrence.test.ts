import test from "node:test"
import assert from "node:assert/strict"
import { changeSeries, materializeSeries, occurrenceDates, removeOccurrences, seriesEvent, validateSeries } from "../src/lib/recurrence"
import { validateEventPatch } from "../src/lib/event-update"
import type { EventSeries } from "../src/lib/types"
import { memoryStore } from "../src/lib/store/memory"
import { event, today, week } from "./fixtures"

function series(patch: Partial<EventSeries> = {}): EventSeries {
  return { id: "series", title: "Seminar", location: "Room 101", meetingUrl: "https://example.com/meet", notes: "Bring notes",
    startDate: "2026-10-03", startMin: 600, endMin: 660, stopBefore: null, excludedDates: [],
    rule: { frequency: "daily", interval: 1, weekdays: [6], monthlyMode: "date", ordinal: 1, end: { type: "count", count: 5 } }, ...patch }
}

test("weekly custom days and multiweek intervals have stable Monday anchors", () => {
  const s = series()
  s.rule = { ...s.rule, frequency: "weekly", interval: 2, weekdays: [1, 3], end: { type: "count", count: 4 } }
  assert.deepEqual(occurrenceDates(s, "2026-11-01"), ["2026-10-12", "2026-10-14", "2026-10-26", "2026-10-28"])
})

test("monthly dates skip missing days and yearly leap days skip non-leap years", () => {
  const s = series({ startDate: "2026-01-31" })
  s.rule = { ...s.rule, frequency: "monthly", end: { type: "count", count: 3 } }
  assert.deepEqual(occurrenceDates(s, "2026-06-30"), ["2026-01-31", "2026-03-31", "2026-05-31"])
  s.startDate = "2024-02-29"
  s.rule.frequency = "yearly"
  assert.deepEqual(occurrenceDates(s, "2032-12-31"), ["2024-02-29", "2028-02-29", "2032-02-29"])
})

test("monthly ordinal and last-weekday rules include inclusive date endings", () => {
  const s = series({ startDate: "2026-10-03" })
  s.rule = { ...s.rule, frequency: "monthly", monthlyMode: "weekday", ordinal: -1, end: { type: "until", date: "2026-11-28" } }
  assert.deepEqual(occurrenceDates(s, "2027-01-01"), ["2026-10-31", "2026-11-28"])
})

test("cancelled occurrences count toward the count ending; moves do not duplicate", () => {
  const s = series({ excludedDates: [today] })
  assert.equal(occurrenceDates(s, "2026-11-01").length, 4)
  const moved = { ...seriesEvent(s, "2026-10-04"), date: "2026-10-10", isException: true }
  const result = materializeSeries([moved], [s], "2026-11-01")
  assert.equal(result.length, 4)
  assert.equal(result.filter((e) => e.occurrenceDate === "2026-10-04").length, 1)
  assert.deepEqual(materializeSeries(result, [s], "2026-11-01"), result)
})

test("following edit splits the series and preserves exceptions and remaining count", () => {
  const s = series()
  const events = materializeSeries([], [s], "2026-10-10")
  events[3] = { ...events[3], date: "2026-10-20", isException: true, location: "Changed room" }
  const next = changeSeries(week({ series: [s], events }), events[2].id, { ...s, startDate: events[2].date, startMin: 720, endMin: 780 }, "following", "split", today)
  assert.equal(next.series[0].stopBefore, "2026-10-05")
  assert.deepEqual(next.series[1].rule.end, { type: "count", count: 3 })
  assert.equal(next.events.length, 5)
  assert.equal(next.events.find((e) => e.isException)?.location, "Changed room")
  assert.equal(next.events.find((e) => e.date === "2026-10-07")?.startMin, 720)
  assert.equal(next.events.find((e) => e.date === today)?.startMin, 600)
})

test("all edit keeps past and completed history; future unedited occurrences update", () => {
  const s = series()
  const events = materializeSeries([], [s], "2026-10-10")
  events[1].status = "completed"
  const next = changeSeries(week({ series: [s], events }), events[2].id, { ...s, title: "Updated" }, "all", "unused", "2026-10-05")
  assert.equal(next.events.find((e) => e.date === today)?.title, "Seminar")
  assert.equal(next.events.find((e) => e.date === "2026-10-04")?.title, "Seminar")
  assert.equal(next.events.find((e) => e.date === "2026-10-05")?.title, "Updated")
})

test("this, following, and all deletion survive future materialization", () => {
  const s = series()
  const data = week({ series: [s], events: materializeSeries([], [s], "2026-10-10") })
  const one = removeOccurrences(data, data.events[1].id, "this")
  assert.equal(materializeSeries(one.events, one.series, "2026-11-01").length, 4)
  const following = removeOccurrences(data, data.events[2].id, "following")
  assert.equal(materializeSeries(following.events, following.series, "2026-11-01").length, 2)
  const all = removeOccurrences(data, data.events[2].id, "all")
  assert.equal(all.events.length, 0)
  assert.equal(all.series.length, 0)
})

test("invalid rules, unsafe links, and reassignment of recorded work are rejected", () => {
  assert.throws(() => validateSeries({ ...series(), meetingUrl: "javascript:alert(1)" }), /http/)
  const s = series()
  assert.throws(() => validateSeries({ ...s, rule: { ...s.rule, interval: 0 } }), /interval/)
  assert.throws(() => validateSeries({ ...s, rule: { ...s.rule, end: { type: "until", date: "2026-02-30" } } }), /end/)
  const data = week({ events: [event({ actualMinutes: 15 })] })
  assert.throws(() => validateEventPatch({ taskId: null, projectId: null }, data, "e"), /recorded work/)
  assert.equal(validateEventPatch({ date: "2026-10-04" }, data, "e").movedFromDate, today)
})

test("a moved exception outside a changed weekday pattern still consumes one occurrence", () => {
  const s = series()
  s.rule = { ...s.rule, frequency: "weekly", weekdays: [1, 3], end: { type: "count", count: 4 } }
  s.startDate = "2026-10-05"
  const events = materializeSeries([], [s], "2026-11-01")
  events[0] = { ...events[0], date: "2026-10-06", isException: true }
  const next = changeSeries(week({ series: [s], events }), events[0].id, { ...s, startDate: "2026-10-06" }, "following", "split", today)
  assert.equal(next.events.length, 4)
  assert.equal(next.events.filter((e) => e.date === "2026-10-06").length, 1)
  assert.equal(materializeSeries(next.events, next.series, "2027-11-01").length, 4)
})

test("shifting a series with preserved history creates no colliding occurrence IDs", () => {
  const s = series()
  const events = materializeSeries([], [s], "2026-10-10")
  const next = changeSeries(week({ series: [s], events }), events[2].id, { ...s, startDate: "2026-10-04" }, "all", "new-generation", "2026-10-05")
  assert.equal(new Set(next.events.map((e) => e.id)).size, next.events.length)
  assert.equal(next.events.length, 5)
})

test("ongoing repeats expand on demand without duplicating skipped occurrences", () => {
  const s = series()
  s.rule.end = { type: "never" }
  const initial = materializeSeries([], [s], "2026-10-05")
  initial[1] = { ...initial[1], status: "skipped", isException: true }
  const expanded = materializeSeries(initial, [s], "2026-10-08")
  assert.equal(expanded.length, 6)
  assert.equal(expanded.find((e) => e.occurrenceDate === "2026-10-04")?.status, "skipped")
})

test("daily wall-clock occurrences stay on calendar days across daylight saving changes", () => {
  const s = series({ startDate: "2026-10-31" })
  assert.deepEqual(occurrenceDates(s, "2026-11-04"), ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"])
  assert.equal(seriesEvent(s, "2026-11-01").startMin, 600)
})

test("resizing and restoring logged blocks derive status without changing logs", async () => {
  await memoryStore.reset(today)
  const created = await memoryStore.applyChanges([{ action: "create", kind: "work", date: today, startMin: 600, endMin: 660, taskId: "t-draft", projectId: "p-thesis", reason: "Test" }])
  const id = created.createdEventIds[0]
  await memoryStore.logTime(id, 45, "Logged")
  let data = await memoryStore.updateEvent(id, { endMin: 630 })
  assert.equal(data.events.find((e) => e.id === id)?.status, "completed")
  await memoryStore.updateEvent(id, { status: "skipped" })
  data = await memoryStore.updateEvent(id, { status: "planned" })
  assert.equal(data.events.find((e) => e.id === id)?.status, "completed")
  assert.equal(data.logs.filter((l) => l.eventId === id)[0].minutes, 45)
})

test("focus without a task retains optional associations when edited and signed time is recorded", async () => {
  await memoryStore.reset(today)
  const created = await memoryStore.applyChanges([{ action: "create", kind: "work", date: today, startMin: 600, endMin: 660, projectId: "p-thesis", taskId: null, title: "Assignment focus", reason: "Test" }])
  const id = created.createdEventIds[0]
  await memoryStore.logTime(id, 45, "")
  let data = await memoryStore.logTime(id, -15, "")
  const patch = validateEventPatch({ title: "Renamed focus", endMin: 630, projectId: "p-thesis", taskId: null }, data, id)
  data = await memoryStore.updateEvent(id, patch)
  const focus = data.events.find((e) => e.id === id)!
  assert.equal(focus.projectId, "p-thesis")
  assert.equal(focus.taskId, null)
  assert.equal(focus.actualMinutes, 30)
  assert.equal(focus.status, "completed")
  assert.throws(() => validateEventPatch({ projectId: null }, data, id), /recorded work/)
})
