import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:4317"
const today = new Date().toISOString().slice(0, 10)
const fails = []
const fail = (m) => { fails.push(m); console.log("FAIL", m) }
const ok = (m) => console.log("ok", m)

async function week() {
  return (await fetch(`${BASE}/api/week?today=${today}`)).json()
}
async function reset() {
  await fetch(`${BASE}/api/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ today }) })
}

await reset()
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const crashes = []
page.on("pageerror", (e) => crashes.push(e.message))
page.on("response", (r) => { if (r.status() >= 500) crashes.push(`${r.status()} ${r.url()}`) })

await page.goto(BASE + "/", { waitUntil: "networkidle" })
const dialog = () => page.getByRole("dialog")

await page.getByRole("button", { name: /Prototype voice flow/ }).click()
await dialog().getByRole("button", { name: "+15m" }).click()
await page.waitForResponse((r) => r.url().includes("/log") && r.ok())
const proto = (await week()).events.find((e) => e.id === "e-48")
if (proto?.actualMinutes !== 15) fail(`+15m left actual at ${proto?.actualMinutes}`)
else ok("+15m")

const slider = dialog().getByRole("slider", { name: "Assignment progress" })
if (!(await slider.isVisible())) fail("progress slider has no accessible name")
else {
  await slider.focus()
  await page.keyboard.press("ArrowRight")
  await dialog().getByRole("button", { name: "Save progress" }).click()
  await page.waitForResponse((r) => r.url().includes("/api/projects/") && r.request().method() === "PATCH")
  const hack = (await week()).projects.find((p) => p.name === "Hackathon prep")
  if (hack.progressPercent == null || hack.progressPercent <= 20) fail(`progress did not increase (now ${hack.progressPercent})`)
  else ok(`progress ${hack.progressPercent}%`)
}

await dialog().getByRole("button", { name: "Skip" }).click()
await page.waitForResponse((r) => r.url().includes("/api/events/") && r.request().method() === "PATCH")
if ((await week()).events.find((e) => e.id === "e-48")?.status !== "skipped") fail("skip did not stick")
else ok("skip")
await page.keyboard.press("Escape")

await page.getByRole("button", { name: "New assignment" }).click()
await dialog().getByLabel("Name").fill("Playwright quiz")
await dialog().getByRole("radio", { name: "Exam", exact: true }).click()
await dialog().getByRole("button", { name: "Add assignment" }).click()
await page.waitForResponse((r) => r.url().endsWith("/api/projects") && r.request().method() === "POST")
if (!(await week()).projects.some((p) => p.name === "Playwright quiz" && p.type === "exam")) fail("new exam assignment did not save")
else ok("new assignment")

await page.getByRole("button", { name: /mode$/ }).click()
await page.getByRole("radio", { name: /Anchor/ }).click()
await page.waitForResponse((r) => r.url().includes("/api/settings"))
await page.reload({ waitUntil: "networkidle" })
if (!(await page.getByRole("button", { name: /Anchor mode/ }).isVisible())) fail("guidance mode did not persist")
else ok("anchor mode")

await page.goto(BASE + "/timeline", { waitUntil: "networkidle" })
const beforeDue = (await week()).projects.find((p) => p.name === "SI 206 · Reading 5").dueDate
await page.getByRole("slider", { name: /Due date for SI 206/ }).focus()
await page.keyboard.press("ArrowRight")
await page.waitForResponse((r) => r.url().includes("/api/projects/") && r.request().method() === "PATCH")
const afterDue = (await week()).projects.find((p) => p.name === "SI 206 · Reading 5").dueDate
if (afterDue <= beforeDue) fail(`timeline due date did not move (${beforeDue} -> ${afterDue})`)
else ok(`due ${beforeDue} -> ${afterDue}`)
const finished = page.getByRole("switch", { name: /Show finished/ })
if (!(await finished.isVisible())) fail("Show finished switch is unnamed or missing")
else {
  await finished.click()
  if (!(await page.getByText("Finished").first().isVisible())) fail("Show finished did not reveal finished assignments")
  else ok("show finished")
}

await page.goto(BASE + "/plan", { waitUntil: "networkidle" })
const gymsBefore = (await week()).events.filter((e) => e.title === "Climbing gym").map((e) => e.date).sort()
await page.getByRole("button", { name: /Move Climbing gym/ }).focus()
await page.keyboard.press("ArrowRight")
await page.waitForTimeout(700)
const gymsAfter = (await week()).events.filter((e) => e.title === "Climbing gym").map((e) => e.date).sort()
if (gymsBefore.join() === gymsAfter.join()) fail(`climbing gym did not move (${gymsBefore.join(", ")})`)
else ok(`gym ${gymsBefore.join(", ")} -> ${gymsAfter.join(", ")}`)

await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
await page.getByRole("button", { name: "Exam", exact: true }).click()
if (!(await page.getByText("EECS 281 · Midterm").first().isVisible())) fail("exam filter hid the midterm")
if (await page.getByText("Hackathon prep").first().isVisible().catch(() => false)) fail("exam filter still shows a project")
else ok("exam filter")
await page.getByRole("button", { name: "Schedule event" }).click()
await dialog().getByRole("radio", { name: "Event", exact: true }).click()
await dialog().getByLabel("Title").fill("Playwright lunch")
await dialog().getByRole("button", { name: "Add to calendar" }).click()
await page.waitForResponse((r) => r.request().method() === "POST" && r.ok())
if (!(await week()).events.some((e) => e.title === "Playwright lunch")) fail("event did not save")
else ok("event scheduled")

await page.goto(BASE + "/rhythm", { waitUntil: "networkidle" })
await page.getByRole("radio", { name: "Month", exact: true }).click()
await page.getByRole("radio", { name: "Course", exact: true }).click()
await page.waitForTimeout(300)
ok("analytics toggles")

if (crashes.length) fail("crashes: " + [...new Set(crashes)].join(" | "))
console.log(`\n${fails.length} failures`)
await browser.close()
await reset()
process.exit(fails.length ? 1 : 0)
