import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:4317"
const today = "2026-10-04"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on("pageerror", (e) => console.log("PAGEERROR", e.message))

async function week() {
  return page.request.get(`${BASE}/api/week?today=${today}`).then((r) => r.json())
}

await page.request.post(`${BASE}/api/reset`, { data: { today } })

// --- Plan: click a block to open it ---
await page.goto(BASE + "/plan", { waitUntil: "networkidle" })
await page.waitForTimeout(400)
const block = page.locator("[data-event] button").first()
const label = await block.getAttribute("aria-label")
console.log("BLOCK", label)
await block.click()
await page.waitForTimeout(400)
const dialogText = await page.getByRole("dialog").innerText().catch(() => "")
console.log("after block click dialog", await page.getByRole("dialog").count(), dialogText.slice(0, 160))

// preference switch on plan page
const puts = []
page.on("request", (req) => {
  if (req.method() === "PUT" && req.url().includes("/api/settings")) puts.push(req.postData())
})
const tilly = page.getByRole("switch", { name: /Tilly suggestions/ })
console.log("tilly switch", await tilly.count(), await tilly.getAttribute("aria-checked").catch(() => null))
if (await tilly.count()) {
  await tilly.click()
  await page.waitForTimeout(600)
  console.log("after tilly switch click checked", await tilly.getAttribute("aria-checked"), "puts", puts)
}

// --- Agenda navigation + filters ---
await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
await page.waitForTimeout(300)
const heading = () => page.locator("h2").first().innerText()
console.log("month before", await heading())
await page.getByRole("button", { name: "Next month" }).click()
await page.waitForTimeout(200)
console.log("month after next", await heading())
await page.getByRole("button", { name: "Previous month" }).click()
await page.waitForTimeout(200)
console.log("month after prev", await heading())

const beforeFilter = await page.locator("ul li").count()
await page.getByRole("button", { name: "Exam", exact: true }).click()
await page.waitForTimeout(200)
const names = await page.locator("ul li button").allInnerTexts()
console.log("after exam filter count", names.length, names.slice(0, 8))
await page.getByRole("button", { name: "Events", exact: true }).click()
await page.waitForTimeout(200)
console.log("events view text", (await page.locator("section").nth(1).innerText()).slice(0, 300))

// course query
await page.goto(BASE + "/agenda?course=" + encodeURIComponent("EECS 281"), { waitUntil: "networkidle" })
await page.waitForTimeout(400)
const pressed = await page.getByRole("button", { name: "EECS 281" }).getAttribute("aria-pressed")
const visibleNames = await page.locator("ul li").allInnerTexts()
console.log("url course pressed", pressed, "rows", visibleNames.map(s => s.split("\n")[0]).slice(0, 6))

// --- Timeline due input vs drag ---
await page.goto(BASE + "/timeline", { waitUntil: "networkidle" })
await page.waitForTimeout(400)
const hackInput = page.getByLabel("Due date for Hackathon prep")
const inputBefore = await hackInput.inputValue()
const edge = page.getByRole("slider", { name: /Due date for Hackathon prep/ })
const box = await edge.boundingBox()
console.log("due input before", inputBefore, "edge", box)
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 })
  const during = await hackInput.inputValue()
  const preview = await page.locator("text=/Due /").allInnerTexts()
  console.log("during drag input", during, "preview texts", preview.slice(0, 4))
  await page.mouse.up()
  await page.waitForTimeout(700)
  const after = await hackInput.inputValue()
  const saved = (await week()).projects.find((p) => p.name === "Hackathon prep").dueDate
  console.log("after drag input", after, "saved", saved)
}

// keyboard arrow and input sync
const beforeKey = await hackInput.inputValue()
await edge.focus()
await page.keyboard.press("ArrowRight")
await page.waitForTimeout(500)
console.log("after arrow input", await hackInput.inputValue(), "was", beforeKey, "saved", (await week()).projects.find((p) => p.name === "Hackathon prep").dueDate)

// --- Insights refresh ---
await page.goto(BASE + "/", { waitUntil: "networkidle" })
await page.waitForTimeout(800)
const reflectReqs = []
page.on("request", (req) => {
  if (req.url().includes("/api/reflect")) reflectReqs.push({ t: Date.now(), body: req.postData() })
})
await page.waitForTimeout(1200)
console.log("initial reflect requests", reflectReqs.length)
const headline1 = await page.getByRole("heading", { name: "Insights" }).locator("xpath=following::p[1]").first().innerText().catch(() => "none")
console.log("headline area", headline1.slice(0, 160))
const refresh = page.getByRole("button", { name: "Refresh insights" }).first()
console.log("refresh visible", await refresh.isVisible(), "disabled", await refresh.isDisabled())
const n0 = reflectReqs.length
await refresh.click()
await page.waitForTimeout(1500)
console.log("reflect reqs after refresh", reflectReqs.length, "delta", reflectReqs.length - n0)
const headline2 = await page.locator("section").filter({ hasText: "Insights" }).last().innerText()
console.log("insights text after", headline2.slice(0, 400))

// --- Recurrence invalid ---
await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
await page.getByRole("button", { name: "Schedule event" }).click()
await page.getByRole("button", { name: "Event", exact: true }).click()
await page.getByLabel("Title").fill("Bad repeat")
await page.getByRole("checkbox", { name: "Repeats" }).check()
// clear all weekdays
for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
  const b = page.getByRole("button", { name: day, exact: true })
  if ((await b.getAttribute("aria-pressed")) === "true") await b.click()
}
const pressedDays = []
for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
  pressedDays.push(day + ":" + await page.getByRole("button", { name: day, exact: true }).getAttribute("aria-pressed"))
}
console.log("weekdays after clear", pressedDays.join(" "))
const seriesPosts = []
page.on("request", (req) => {
  if (req.url().includes("/api/event-series") && req.method() === "POST") seriesPosts.push(req.postData())
})
await page.getByRole("button", { name: "Add repeating event" }).click()
await page.waitForTimeout(600)
console.log("series posts", seriesPosts)
console.log("form alert", await page.locator("[role=alert]").allInnerTexts())

await browser.close()
