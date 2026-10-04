import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:4317"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on("pageerror", (err) => console.log("PAGEERROR", err.message))
page.on("console", (msg) => { if (msg.type() === "error") console.log("CONSOLE", msg.text().slice(0, 200)) })

async function settings() {
  const res = await page.request.get(BASE + "/api/week?today=2026-10-04")
  const j = await res.json()
  return j.settings
}

await page.request.post(BASE + "/api/reset", { data: { today: "2026-10-04" } })
await page.goto(BASE + "/", { waitUntil: "networkidle" })
await page.waitForTimeout(500)

// Nav
for (const name of ["Agenda", "Plan", "Analytics", "Timeline", "Today"]) {
  const link = page.getByRole("link", { name, exact: true }).first()
  const visible = await link.isVisible()
  await link.click()
  await page.waitForTimeout(400)
  console.log("NAV", name, "visible", visible, "url", page.url())
}

// Settings guidance
await page.getByRole("button", { name: /mode/ }).click()
await page.waitForTimeout(300)
console.log("dialog open", await page.getByRole("dialog").isVisible())
const puts = []
page.on("request", (req) => {
  if (req.url().includes("/api/settings") && req.method() === "PUT") puts.push(req.postData())
})
await page.getByRole("radio", { name: /Tide/ }).click()
await page.waitForTimeout(800)
console.log("after tide click settings", JSON.stringify(await settings()))
console.log("settings PUTs", puts)

puts.length = 0
const sw = page.getByRole("switch", { name: "Daily check-in" })
console.log("checkin switch count", await page.getByRole("switch").count())
const switches = page.getByRole("switch")
const n = await switches.count()
for (let i = 0; i < n; i++) {
  const s = switches.nth(i)
  const label = await s.evaluate(el => el.getAttribute("aria-label") || el.closest("label")?.innerText?.slice(0,60) || el.parentElement?.innerText?.slice(0,60))
  const checked = await s.getAttribute("aria-checked")
  console.log("SWITCH", i, checked, JSON.stringify(label))
}
// click the first switch (daily check-in) on the control itself
const first = switches.first()
await first.click()
await page.waitForTimeout(800)
console.log("after switch click PUTs", puts)
console.log("settings now", JSON.stringify(await settings()))

// click label text of second toggle
puts.length = 0
const dialog = page.getByRole("dialog")
await dialog.getByText("Tilly planner suggestions", { exact: true }).click()
await page.waitForTimeout(800)
console.log("after label text click PUTs", puts)
console.log("settings now", JSON.stringify(await settings()))

await page.keyboard.press("Escape")
await page.waitForTimeout(300)

// Welcome tour
await page.goto(BASE + "/welcome", { waitUntil: "networkidle" })
await page.waitForTimeout(400)
console.log("welcome url", page.url(), "h1", await page.locator("h1").first().innerText())
await page.getByRole("button", { name: /Set me up/ }).click()
await page.waitForTimeout(300)
console.log("step1 h1", await page.locator("h1").first().innerText())
await page.getByRole("radio", { name: /Tide/ }).click()
await page.getByRole("button", { name: "Continue" }).click()
await page.waitForTimeout(800)
console.log("after guidance continue settings", JSON.stringify(await settings()))
console.log("step2 h1", await page.locator("h1").first().innerText())

// toggles on extras
const extraSwitches = page.getByRole("switch")
console.log("extra switch count", await extraSwitches.count())
for (let i = 0; i < await extraSwitches.count(); i++) {
  const s = extraSwitches.nth(i)
  console.log("extra", i, await s.getAttribute("aria-checked"), await s.getAttribute("aria-label"), "disabled", await s.isDisabled())
}
await page.getByRole("button", { name: "Continue" }).click()
await page.waitForTimeout(500)
console.log("step3 h1", await page.locator("h1").first().innerText().catch(() => "none"))
await page.getByRole("button", { name: /Skip/ }).click()
await page.waitForTimeout(400)
console.log("step4 h1", await page.locator("h1").first().innerText().catch(() => "none"))
const openToday = page.getByRole("button", { name: "Open Today" })
console.log("open today visible", await openToday.isVisible())
await openToday.click()
await page.waitForTimeout(600)
console.log("after open today url", page.url())

// Voice agent
await page.request.post(BASE + "/api/reset", { data: { today: "2026-10-04" } })
await page.goto(BASE + "/", { waitUntil: "networkidle" })
await page.getByRole("button", { name: /Talk to Tilly/ }).click()
await page.waitForTimeout(400)
const before = await page.request.get(BASE + "/api/week?today=2026-10-04").then(r => r.json())
const target = before.events.find(e => e.kind === "work" && e.status === "planned" && e.date >= "2026-10-04")
console.log("target before", target?.id, target?.title, target?.date, target?.startMin)
await page.getByRole("button", { name: /ordering pizza/ }).click()
await page.waitForTimeout(1500)
const mid = await page.request.get(BASE + "/api/week?today=2026-10-04").then(r => r.json())
const midEv = mid.events.find(e => e.id === target.id)
console.log("mode", mid.settings.guidanceMode, "after proposal", midEv?.date, midEv?.startMin, "changed", midEv?.date !== target.date || midEv?.startMin !== target.startMin)
console.log("agent text", (await page.locator("[data-slot=sheet-content], [role=dialog]").innerText()).slice(0, 500))

await browser.close()
