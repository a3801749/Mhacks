import { chromium } from "@playwright/test"
const BASE = "http://127.0.0.1:4317"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const reqs = []
page.on("request", (r) => {
  if (r.url().includes("/api/schedule/adjust") || r.url().includes("/api/schedule/apply") || r.url().includes("/api/settings"))
    reqs.push(r.method() + " " + r.url().replace(BASE, "") + " " + (r.postData() || "").slice(0, 180))
})

await page.request.post(BASE + "/api/reset", { data: { today: "2026-10-04" } })
await page.goto(BASE + "/", { waitUntil: "networkidle" })

// open a planned work block and ask Tilly, count adjust calls
await page.locator("button", { hasText: "Prototype" }).first().click({ timeout: 5000 }).catch(async () => {
  console.log("no prototype button, buttons:", (await page.locator("button").allInnerTexts()).slice(0, 30))
})
await page.waitForTimeout(400)
const ask = page.getByRole("button", { name: /ask Tilly/i })
console.log("ask visible", await ask.isVisible().catch(() => false))
if (await ask.isVisible().catch(() => false)) {
  reqs.length = 0
  await ask.click()
  await page.waitForTimeout(2500)
  console.log("adjust calls after ask", reqs.filter(r => r.includes("adjust")))
}

// settings replay
await page.keyboard.press("Escape")
await page.waitForTimeout(200)
await page.getByRole("button", { name: /mode/ }).click()
const replay = page.getByRole("link", { name: "Replay the welcome tour" })
console.log("replay visible", await replay.isVisible())
await replay.click()
await page.waitForTimeout(800)
console.log("after replay url", page.url(), "h1", await page.locator("h1").first().innerText().catch(() => "none"))

// go to end of tour then click /welcome self link
for (let i = 0; i < 4; i++) {
  const cont = page.getByRole("button", { name: /Continue|Set me up|Skip — use/ })
  if (await cont.isVisible().catch(() => false)) {
    await cont.click()
    await page.waitForTimeout(400)
  }
}
console.log("at", await page.locator("h1").first().innerText())
const self = page.getByRole("link", { name: "/welcome" })
console.log("self link", await self.count())
if (await self.count()) {
  await self.click()
  await page.waitForTimeout(500)
  console.log("after self link h1", await page.locator("h1").first().innerText(), "url", page.url())
}

// guidance save from fresh
await page.request.post(BASE + "/api/reset", { data: { today: "2026-10-04" } })
await page.goto(BASE + "/welcome", { waitUntil: "networkidle" })
await page.getByRole("button", { name: /Set me up/ }).click()
await page.getByRole("radio", { name: /Anchor/ }).click()
await page.getByRole("button", { name: "Continue" }).click()
await page.waitForTimeout(700)
let week = await (await page.request.get(BASE + "/api/week?today=2026-10-04")).json()
console.log("after anchor continue", week.settings.guidanceMode)
await page.reload({ waitUntil: "networkidle" })
week = await (await page.request.get(BASE + "/api/week?today=2026-10-04")).json()
console.log("after reload", week.settings.guidanceMode, "h1", await page.locator("h1").first().innerText())

// extras toggle persist
const sw = page.getByRole("switch", { name: "Daily check-in" })
console.log("onboarding checkin", await sw.getAttribute("aria-checked"))
await sw.click()
await page.getByRole("button", { name: "Continue" }).click()
await page.waitForTimeout(700)
week = await (await page.request.get(BASE + "/api/week?today=2026-10-04")).json()
console.log("after extras continue", week.settings)

// tide auto apply via UI
await page.request.post(BASE + "/api/reset", { data: { today: "2026-10-04" } })
await page.request.put(BASE + "/api/settings", { data: { guidanceMode: "autopilot", today: "2026-10-04" } })
await page.goto(BASE + "/", { waitUntil: "networkidle" })
const before = await (await page.request.get(BASE + "/api/week?today=2026-10-04")).json()
const target = before.events.find(e => e.id === "e-50")
console.log("e-50 before", target.status, target.date, target.startMin)
reqs.length = 0
await page.getByRole("button", { name: /Talk to Tilly/ }).click()
await page.getByRole("button", { name: /ordering pizza/ }).click()
await page.waitForTimeout(2500)
const after = await (await page.request.get(BASE + "/api/week?today=2026-10-04")).json()
const t2 = after.events.find(e => e.id === "e-50")
console.log("e-50 after autopilot prompt", t2.status, t2.date, t2.startMin)
console.log("reqs", reqs)
const sheet = await page.locator("body").innerText()
console.log("has Sounds good", sheet.includes("Sounds good"), "has Applied", sheet.includes("Applied"), "has Undo", sheet.includes("Undo"))

await browser.close()
