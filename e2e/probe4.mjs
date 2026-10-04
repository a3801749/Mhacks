import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:4317"
const today = "2026-10-04"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on("pageerror", (e) => console.log("PAGEERROR", e.message))

await page.request.post(`${BASE}/api/reset`, { data: { today } })

// sort
await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
const names = async () => page.locator("section ul li button.truncate, section ul li button[class*='truncate']").allInnerTexts().catch(async () => {
  const t = await page.getByRole("region", { name: "Assignments and events" }).innerText()
  return t.split("\n").filter((l) => l.includes("·") && !l.includes("Work") && !l.includes("Event") && l.length < 40)
})
console.log("due order", await names())
await page.getByLabel("Sort assignments").click()
await page.getByRole("option", { name: "Priority" }).click()
await page.waitForTimeout(200)
console.log("priority order", await names())

await page.getByRole("checkbox", { name: "Show finished" }).check()
console.log("finished includes ch2", (await page.getByRole("region", { name: "Assignments and events" }).innerText()).includes("Chapter 2"))

// day detail vs filter
await page.getByRole("button", { name: "Exam", exact: true }).click()
const aside = page.locator("aside")
console.log("ASIDE after exam\n", (await aside.innerText()).slice(0, 500))

// rhythm
await page.goto(BASE + "/rhythm", { waitUntil: "networkidle" })
const rows = () => page.locator("section").filter({ hasText: "Day by day" }).locator("div.flex.items-center").count()
console.log("week rows", await rows())
await page.getByRole("radio", { name: "Month" }).click()
await page.waitForTimeout(200)
console.log("month rows", await rows(), "checked", await page.getByRole("radio", { name: "Month" }).getAttribute("aria-checked"))
await page.getByRole("radio", { name: "Assignment" }).click()
console.log("assignment checked", await page.getByRole("radio", { name: "Assignment" }).getAttribute("aria-checked"))

// label text toggle
await page.goto(BASE + "/plan", { waitUntil: "networkidle" })
const sw = page.getByRole("switch", { name: /Tilly suggestions/ })
console.log("switch before", await sw.getAttribute("aria-checked"))
await page.getByText("Tilly suggestions", { exact: true }).click()
await page.waitForTimeout(500)
console.log("switch after label click", await sw.getAttribute("aria-checked"))

// schedule dialog buttons
await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
await page.getByRole("button", { name: "Schedule event" }).click()
await page.waitForTimeout(400)
console.log("dialog", await page.getByRole("dialog").innerText().catch(() => "NO DIALOG").then(t => t.slice(0, 400)))
const ev = page.getByRole("button", { name: "Event", exact: true })
console.log("event btn", await ev.count(), await ev.isVisible().catch(() => false))

// insights two panels
let n = 0
await page.route("**/api/reflect", async (route) => {
  n += 1
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ headline: `HEADLINE ${n}`, summary: `summary ${n}`, habits: [], suggestions: [], questions: [], source: "mock" }),
  })
})
await page.goto(BASE + "/", { waitUntil: "networkidle" })
await page.getByRole("button", { name: "Refresh insights" }).first().waitFor()
const headlines = () => page.getByText(/HEADLINE/).allInnerTexts()
console.log("panels initial", await headlines(), "requests", n, "refresh buttons", await page.getByRole("button", { name: "Refresh insights" }).count())
await page.getByRole("button", { name: "Refresh insights" }).nth(1).click()
await page.waitForTimeout(800)
console.log("after visible refresh", await headlines(), "requests", n)
await page.getByRole("button", { name: "Refresh insights" }).nth(0).click()
await page.waitForTimeout(800)
console.log("after first refresh", await headlines(), "requests", n)

await browser.close()
