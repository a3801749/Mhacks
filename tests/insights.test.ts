import assert from "node:assert/strict"
import { test } from "node:test"
import { createInsightCache, insightKey } from "../src/lib/insights"
import type { Reflection } from "../src/lib/types"
import { event, today, week } from "./fixtures"

const reflection: Reflection = { headline: "A week", summary: "", habits: [], suggestions: [], questions: [], source: "mock" }

test("insights change with work, progress, and settings, but ignore response metadata", () => {
  const data = week()
  const key = insightKey(data, today)
  assert.notEqual(insightKey({ ...data, events: [event()] }, today), key)
  assert.notEqual(insightKey({ ...data, projects: data.projects.map((p) => ({ ...p, progressPercent: 50 })) }, today), key)
  assert.notEqual(insightKey({ ...data, settings: { ...data.settings, checkInEnabled: false } }, today), key)
  const response = { ...data, source: "neon" as const, createdEventIds: ["created"], previousEvents: [event()] }
  assert.equal(insightKey(response, today), key)
  assert.notEqual(insightKey(data, "2026-10-04"), key)
})

test("desktop and mobile panels share a request for the same calendar snapshot", async () => {
  const cache = createInsightCache()
  let calls = 0
  const load = async () => { calls++; return reflection }
  const first = cache.load("snapshot", load)
  const second = cache.load("snapshot", load)
  assert.equal(first, second)
  await Promise.all([first, second])
  assert.equal(calls, 1)
  await cache.load("changed snapshot", load)
  assert.equal(calls, 2)
})

test("failure of an older request cannot discard a newer refresh", async () => {
  const cache = createInsightCache()
  let rejectOlder!: (reason: Error) => void
  const older = cache.load("snapshot", () => new Promise<Reflection>((_, reject) => { rejectOlder = reject }))
  const rejected = assert.rejects(older, /old request/)
  const refreshed = cache.load("snapshot", async () => reflection, true)
  await refreshed
  rejectOlder(new Error("old request"))
  await rejected
  assert.equal(cache.load("snapshot", async () => { throw new Error("should use refresh") }), refreshed)
})
