/** E2E_BASE=http://127.0.0.1:4318 npm run e2e:tilly (isolated memory server, API keys disabled). */
import assert from "node:assert/strict"
import { chromium, expect } from "@playwright/test"

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:4318"
const TODAY = "2026-10-04"
const WEDNESDAY = "2026-10-07"
const MESSAGE = "I wanna have lunch with sam again on wednesday at 3pm for an hour,"
const NOW = { date: TODAY, minute: 720 }
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ timezoneId: "America/Detroit", viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
let canReset = false
page.on("pageerror", (error) => errors.push(error.message))
await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00-04:00`))
// Exercise the browser's final-transcript callback without needing a real microphone.
await context.addInitScript(() => {
  window.SpeechRecognition = class {
    constructor() { window.__tillyRecognition = this }
    start() {}
    stop() { this.onend?.() }
  }
})

async function api(path, body, method = "POST") {
  const response = await context.request.fetch(`${BASE}${path}`, { method, data: body })
  assert.equal(response.status(), 200, `${method} ${path}: ${await response.text()}`)
  return response.json()
}
async function week() {
  const response = await context.request.get(`${BASE}/api/week?today=${TODAY}`)
  assert.equal(response.status(), 200)
  return response.json()
}
async function prepare(mode, freeSlot = false) {
  await api("/api/reset", { today: TODAY })
  await api("/api/settings", { today: TODAY, guidanceMode: mode, todayInsightsEnabled: false }, "PUT")
  if (freeSlot) {
    for (const event of (await week()).events.filter((e) => e.date === WEDNESDAY && e.startMin < 960 && e.endMin > 900)) {
      await api(`/api/events/${event.id}`, { today: TODAY, startMin: 480, endMin: 480 + event.endMin - event.startMin }, "PATCH")
    }
  }
  return week()
}
async function openTilly() {
  await page.goto(BASE)
  await page.getByRole("button", { name: /Talk to Tilly Plans changed/ }).click()
  await page.getByRole("button", { name: "Mute voice", exact: true }).click()
}
async function send(message) {
  await page.getByPlaceholder(/Or type:/).fill(message)
  const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/schedule/adjust")
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const response = await pending
  assert.equal(response.status(), 200)
  return response.json()
}
function lunch(changes) {
  const create = changes.find((c) => c.action === "create")
  assert.equal(create?.title, "Lunch with Sam")
  assert.equal(create.date, WEDNESDAY)
  assert.equal(create.startMin, 900)
  assert.equal(create.endMin, 960)
  assert.equal(create.kind, "life")
  assert.equal(create.taskId, null)
  assert.equal(create.projectId, null)
}
function savedLunch(data) {
  const saved = data.events.filter((e) => e.title === "Lunch with Sam")
  assert.equal(saved.length, 1)
  lunch([{ ...saved[0], action: "create" }])
}

try {
  const initial = await week()
  assert.equal(initial.source, "memory", "This test resets data; use an isolated memory server")
  assert.equal(initial.integrations.gemini, false, "Disable Gemini for deterministic browser checks")
  assert.equal(initial.integrations.elevenlabs, false, "Disable ElevenLabs for browser checks")
  canReset = true

  const before = await prepare("coach", true)
  await openTilly()
  const proposed = await send(MESSAGE)
  lunch(proposed.changes)
  assert.equal(proposed.changes.length, 1)
  assert.equal(proposed.autoApplied, false)
  assert.match(proposed.reply, /I can add Lunch with Sam/)
  assert.match(proposed.reply, /Apply/)
  assert.deepEqual((await week()).events, before.events)
  const apply = page.getByRole("button", { name: "Apply: Add Lunch with Sam", exact: true })
  await expect(apply).toBeVisible()
  const written = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/schedule/apply")
  await apply.click()
  assert.equal((await written).status(), 200)
  const after = await week()
  savedLunch(after)
  assert.deepEqual(after.events.filter((e) => e.title !== "Lunch with Sam"), before.events)
  await expect(page.getByRole("button", { name: "Undo: Add Lunch with Sam", exact: true })).toBeVisible()
  console.log("PASS exact Lighthouse request, no unrelated moves, Apply persists lunch")

  await prepare("coach", true)
  await openTilly()
  await send(MESSAGE)
  const spokenResponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/schedule/adjust")
  await page.getByRole("button", { name: "Talk to Tilly", exact: true }).click()
  await page.evaluate(() => {
    const recognition = window.__tillyRecognition
    const result = [{ transcript: "I want to have lunch with Sam on Wednesday" }]
    result.isFinal = true
    recognition.onresult({ results: [result] })
    recognition.onend()
  })
  const voiceResponse = await spokenResponse
  assert.equal(voiceResponse.status(), 200)
  const voice = await voiceResponse.json()
  const payload = voiceResponse.request().postDataJSON()
  assert.equal(payload.message, "I want to have lunch with Sam on Wednesday")
  assert.equal(payload.history[0].text, MESSAGE)
  lunch(voice.changes)
  assert.equal(voice.changes.length, 1)
  assert.equal(voice.autoApplied, false)
  assert.match(voice.reply, /Apply/)
  console.log("PASS final speech transcript retains the typed request's time and history")

  for (const mode of ["anchor", "autopilot"]) {
    const baseline = await prepare(mode, true)
    await openTilly()
    const response = await send(MESSAGE)
    lunch(response.changes)
    assert.equal(response.changes.length, 1)
    assert.equal(response.autoApplied, mode === "autopilot")
    if (mode === "autopilot") {
      assert.match(response.reply, /I added Lunch with Sam/)
      assert.doesNotMatch(response.reply, /Apply/)
      savedLunch(await week())
      await expect(page.getByRole("button", { name: "Undo: Add Lunch with Sam", exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Apply: Add Lunch with Sam", exact: true })).toHaveCount(0)
    } else {
      assert.deepEqual((await week()).events, baseline.events)
      await expect(page.getByRole("button", { name: "Apply: Add Lunch with Sam", exact: true })).toBeVisible()
    }
    console.log(`PASS exact request in ${mode}, correct persistence and reply`)
  }

  const unchanged = await prepare("autopilot", true)
  const question = await api("/api/schedule/adjust", { message: "I want to have lunch with Sam on Wednesday", history: [], now: NOW })
  assert.deepEqual(question.changes, [])
  assert.equal(question.autoApplied, false)
  assert.match(question.reply, /What time/)
  const answered = await api("/api/schedule/adjust", { message: "3pm for an hour", history: [
    { role: "user", text: "I want to have lunch with Sam on Wednesday" }, { role: "agent", text: question.reply },
  ], now: NOW })
  lunch(answered.changes)
  assert.equal(answered.autoApplied, true)
  savedLunch(await week())
  assert.deepEqual((await week()).events.filter((e) => e.title !== "Lunch with Sam"), unchanged.events)
  console.log("PASS missing time asks a question; short answer creates the pending event")

  const conflict = await prepare("autopilot")
  const accommodated = await api("/api/schedule/adjust", { message: MESSAGE, history: [], now: NOW })
  lunch(accommodated.changes)
  assert.equal(accommodated.autoApplied, true)
  assert.ok(accommodated.changes.some((c) => c.action === "move"))
  for (const c of accommodated.changes.filter((c) => c.action !== "create")) {
    const original = conflict.events.find((e) => e.id === c.eventId)
    assert.equal(c.action, "move")
    assert.ok(original.date === WEDNESDAY && original.startMin < 960 && original.endMin > 900)
    assert.equal(c.endMin - c.startMin, original.endMin - original.startMin)
    assert.ok(c.date !== original.date || c.startMin !== original.startMin)
  }
  savedLunch(await week())
  console.log("PASS only real clashes move, preserving their duration, with lunch persisted")

  const unmodified = await prepare("autopilot")
  for (const message of ["Hello", "What's on my calendar Wednesday?", "Don't move my work"]) {
    const response = await api("/api/schedule/adjust", { message, history: [], now: NOW })
    assert.deepEqual(response.changes, [])
    assert.equal(response.autoApplied, false)
    assert.deepEqual((await week()).events, unmodified.events)
  }
  assert.deepEqual(errors, [])
  console.log("PASS greetings, questions, and declined edits do not mutate the calendar")
} finally {
  try { if (canReset) await api("/api/reset", { today: TODAY }) }
  finally { await browser.close() }
}
