/** Run against an isolated no-key server: E2E_BASE=http://127.0.0.1:4318 npm run e2e:readiness */
import assert from "node:assert/strict"
import { chromium, expect } from "@playwright/test"

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:4318"
const TODAY = "2026-10-04"
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Detroit" })
const page = await context.newPage()
const errors = []
let canReset = false
page.on("pageerror", (err) => errors.push(err.message))
await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00-04:00`))

async function api(path, body, method = "POST", status = 200) {
  const response = await context.request.fetch(`${BASE}${path}`, { method, data: body, headers: { "Content-Type": "application/json" } })
  assert.equal(response.status(), status, `${method} ${path}: ${await response.text()}`)
  return response.json()
}
async function week() {
  const response = await context.request.get(`${BASE}/api/week?today=${TODAY}`)
  assert.equal(response.status(), 200)
  return response.json()
}
async function clickWrite(locator, path, method = "POST") {
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === path && r.request().method() === method)
  await locator.click()
  assert.equal((await response).status(), 200)
}
async function openTilly() {
  await page.getByRole("button", { name: /Talk to Tilly Plans changed/ }).click()
  await page.getByRole("button", { name: "Mute voice", exact: true }).click()
}
async function send(message) {
  await page.getByPlaceholder(/Or type:/).fill(message)
  await clickWrite(page.getByRole("button", { name: "Send", exact: true }), "/api/schedule/adjust")
}

try {
  const initial = await week()
  assert.equal(initial.source, "memory", "Use an isolated memory server; this test resets its data")
  assert.equal(initial.integrations.gemini, false, "Disable Gemini for deterministic browser checks")
  assert.equal(initial.integrations.elevenlabs, false, "Disable ElevenLabs for browser checks")
  canReset = true
  await api("/api/reset", { today: TODAY })
  await api("/api/courses", { today: TODAY, name: "CHEM 101", color: "#5FA3B8" })
  for (const [name, course] of [["Review chemistry notes", "chem 101"], ["Prepare chemistry lab", " CHEM   101 "]]) {
    await api("/api/projects", { name, course, type: "reading", targetMinutes: 120, assignedDate: TODAY, dueDate: "2026-10-12", firstTask: "Read", today: TODAY })
  }
  await page.goto(`${BASE}/agenda`)
  await page.getByRole("button", { name: "CHEM 101", exact: true }).click()
  await expect(page.getByRole("button", { name: "Review chemistry notes", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Prepare chemistry lab", exact: true })).toBeVisible()
  await page.goto(`${BASE}/`)
  const courseRow = page.getByRole("link", { name: /CHEM 101 2 tasks/ })
  await expect(courseRow).toHaveCount(1)
  assert.equal(await courseRow.locator("span[aria-hidden]").evaluate((el) => el.style.backgroundColor), "rgb(95, 163, 184)")
  console.log("PASS course filtering, overview grouping, and saved color")

  await page.getByRole("button", { name: "New assignment", exact: true }).click()
  const combo = page.getByRole("combobox", { name: "Course", exact: true })
  await combo.fill("chem   101")
  await expect(page.getByRole("option", { name: "CHEM 101", exact: true })).toBeVisible()
  await expect(page.getByRole("option", { name: /Create course/ })).toHaveCount(0)
  await combo.press("ArrowDown")
  const active = await combo.getAttribute("aria-activedescendant")
  assert.equal(await page.locator(`[id="${active}"]`).textContent(), "CHEM 101")
  await combo.press("Enter")
  await expect(combo).toHaveValue("CHEM 101")
  await page.keyboard.press("Escape")
  console.log("PASS course picker keyboard navigation and duplicate prevention")

  await page.goto(`${BASE}/plan`)
  await page.getByRole("button", { name: "Previous week" }).click()
  await page.getByRole("button", { name: "Add a block", exact: true }).click()
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue("2026-09-27")
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Next week" }).click()
  await page.getByRole("button", { name: "Next week" }).click()
  await page.getByRole("button", { name: "Add a block", exact: true }).click()
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue("2026-10-11")
  await page.keyboard.press("Escape")
  console.log("PASS previous and next week block dates")

  await page.getByRole("button", { name: "New course", exact: true }).click()
  await page.getByRole("combobox", { name: "Course", exact: true }).fill("BIO 101")
  await page.getByRole("button", { name: "Add class times (lecture, section, lab)", exact: true }).click()
  await page.getByLabel("Room", { exact: true }).fill("1749 BBB")
  await page.getByRole("button", { name: "Add course and class times", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "New course", exact: true })).toBeHidden()
  const classes = await week()
  assert.ok(classes.courses.some((c) => c.name === "BIO 101"))
  const series = classes.series.find((s) => s.title === "BIO 101 Lecture")
  assert.deepEqual(series.rule.weekdays, [1, 3])
  assert.equal(classes.events.find((e) => e.seriesId === series.id && e.date === "2026-10-05").location, "1749 BBB")
  console.log("PASS course creation with recurring class times")

  for (const [path, method] of [["/api/projects", "POST"], ["/api/checkins", "PUT"], ["/api/events/unused/log", "POST"], ["/api/logs/unused", "PATCH"], ["/api/schedule/adjust", "POST"]]) {
    await api(path, "null", method, 400)
  }
  await api("/api/projects", { name: 123 }, "POST", 400)
  await api("/api/schedule/adjust", { message: "Hello", now: { date: TODAY, minute: -1 } }, "POST", 400)
  await api("/api/schedule/adjust", { message: "Hello", history: [null, {}, { role: "user", text: "Hi" }], now: { date: TODAY, minute: 720 } })
  console.log("PASS malformed request validation")

  for (let i = (await week()).courses.length; i < 100; i++) await api("/api/courses", { name: `Course ${i}`, today: TODAY })
  const updated = await api("/api/courses", { name: "CHEM 101", color: "#6F9E80", today: TODAY })
  assert.equal(updated.courses.length, 100)
  const preserved = await api("/api/courses", { name: "chem 101", today: TODAY })
  assert.equal(preserved.courses.find((c) => c.name === "CHEM 101").color, "#6F9E80")
  await api("/api/courses", { name: "Course 101", today: TODAY }, "POST", 400)
  console.log("PASS course limit updates and color preservation")

  await api("/api/reset", { today: TODAY })
  await page.goto(`${BASE}/`)
  const creates = ["Dinner", "Coffee"].map((title) => ({ action: "create", title, kind: "life", date: "2026-10-07", startMin: 800, endMin: 860, reason: "Add" }))
  await page.route("**/api/schedule/adjust", (route) => route.fulfill({ json: { reply: "Two changes to review", changes: creates, source: "mock", autoApplied: false, week: null } }))
  await page.route("**/api/schedule/apply", async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.events.reverse()
    body.createdEventIds.reverse()
    await route.fulfill({ response, json: body })
  })
  await openTilly()
  await send("Add these events")
  await clickWrite(page.getByRole("button", { name: "Apply all 2", exact: true }), "/api/schedule/apply")
  const added = await week()
  const dinner = added.events.find((e) => e.title === "Dinner")
  const coffee = added.events.find((e) => e.title === "Coffee")
  await clickWrite(page.getByRole("button", { name: "Undo: Add Dinner", exact: true }), `/api/events/${dinner.id}`, "DELETE")
  const undone = await week()
  assert.ok(!undone.events.some((e) => e.id === dinner.id))
  assert.ok(undone.events.some((e) => e.id === coffee.id))
  console.log("PASS individual Undo with unordered same-time creates")
  await page.unroute("**/api/schedule/apply")
  await page.unroute("**/api/schedule/adjust")

  await api("/api/reset", { today: TODAY })
  await page.reload()
  const target = (await week()).events.find((e) => e.kind === "work" && e.status === "planned" && e.date >= TODAY)
  let startMin = 800
  await page.route("**/api/schedule/adjust", (route) => route.fulfill({ json: { reply: "Move this block", changes: [{ action: "move", eventId: target.id, date: "2026-10-07", startMin, endMin: startMin + 60, reason: "Move" }], source: "mock", autoApplied: false, week: null } }))
  await openTilly()
  for (const minute of [800, 900]) {
    startMin = minute
    await send("Move this block")
    await clickWrite(page.getByRole("button", { name: `Apply: Move ${target.title}`, exact: true }), "/api/schedule/apply")
  }
  const undoButtons = page.getByRole("button", { name: `Undo: Move ${target.title}`, exact: true })
  await undoButtons.nth(0).click()
  await expect(page.getByText("This block changed after this proposal. Undo its later changes first.", { exact: true })).toBeVisible()
  assert.equal((await week()).events.find((e) => e.id === target.id).startMin, 900)
  await clickWrite(undoButtons.nth(1), `/api/events/${target.id}`, "PATCH")
  await clickWrite(undoButtons.nth(0), `/api/events/${target.id}`, "PATCH")
  const restored = (await week()).events.find((e) => e.id === target.id)
  assert.deepEqual(restored, target)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileControl = page.getByRole("button", { name: `Apply: Move ${target.title}`, exact: true }).first()
  await mobileControl.scrollIntoViewIfNeeded()
  await expect(mobileControl).toBeInViewport()
  assert.deepEqual(errors, [])
  console.log("PASS later-change protection, sequential Undo, and mobile controls")
} finally {
  try { if (canReset) await api("/api/reset", { today: TODAY }) }
  finally { await browser.close() }
}
