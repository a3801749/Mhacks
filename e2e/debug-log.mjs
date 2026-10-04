import { chromium } from "@playwright/test"
const BASE = "http://127.0.0.1:4317"
const today = new Date().toISOString().slice(0, 10)
await fetch(`${BASE}/api/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ today }) })
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on("response", async (r) => {
  if (r.url().includes("/log") || r.url().includes("/projects/")) console.log("RES", r.status(), r.request().method(), r.url())
})
await page.goto(BASE + "/", { waitUntil: "networkidle" })
await page.getByRole("button", { name: /Prototype voice flow/ }).click()
await page.getByRole("dialog").getByRole("button", { name: "+15m" }).click()
await page.waitForTimeout(1000)
const data = await (await fetch(`${BASE}/api/week?today=${today}`)).json()
for (const e of data.events.filter((e) => e.title.includes("Prototype"))) console.log(e.date, e.id, e.actualMinutes, e.status)
const dialogText = await page.getByRole("dialog").innerText()
console.log(dialogText.slice(0, 500))
await browser.close()
