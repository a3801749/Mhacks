import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:4317"
const today = "2026-10-04"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
let n = 0
await page.route("**/api/reflect", async (route) => {
  n += 1
  const body = JSON.stringify({ headline: `HEADLINE ${n}`, summary: `summary ${n}`, habits: [], suggestions: [], questions: [], source: "mock" })
  console.log("reflect hit", n)
  await route.fulfill({ status: 200, contentType: "application/json", body })
})
await page.goto(BASE + "/", { waitUntil: "networkidle" })
await page.getByText("HEADLINE").first().waitFor({ timeout: 8000 })
console.log("visible headlines", await page.getByText(/HEADLINE/).allInnerTexts())
console.log("html count", await page.locator("text=HEADLINE").count())
await page.getByRole("button", { name: "Refresh insights" }).click()
await page.waitForTimeout(1000)
console.log("after refresh headlines", await page.getByText(/HEADLINE/).allInnerTexts(), "n", n)

// narrower viewport where the other panel shows
await page.setViewportSize({ width: 1100, height: 900 })
await page.waitForTimeout(400)
console.log("at 1100 headlines", await page.getByText(/HEADLINE/).allInnerTexts(), "n", n)
await page.getByRole("button", { name: "Refresh insights" }).click()
await page.waitForTimeout(800)
console.log("after 1100 refresh", await page.getByText(/HEADLINE/).allInnerTexts(), "n", n)
await page.setViewportSize({ width: 1440, height: 1000 })
await page.waitForTimeout(300)
console.log("back to 1440", await page.getByText(/HEADLINE/).allInnerTexts(), "n", n)

// recurrence invalid submit
await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
await page.getByRole("button", { name: "Schedule event" }).click()
await page.getByRole("radio", { name: "Event", exact: true }).click()
await page.getByLabel("Title").fill("Bad repeat")
await page.getByLabel("Repeats").check()
const posts = []
page.on("request", (r) => { if (r.url().includes("event-series")) posts.push((r.postData() || "").slice(0, 300)) })
for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
  const b = page.getByRole("button", { name: day, exact: true })
  if ((await b.getAttribute("aria-pressed")) === "true") await b.click()
}
console.log("pressed", await page.getByRole("group", { name: "Repeat on weekdays" }).innerText())
await page.getByRole("button", { name: "Add repeating event" }).click()
await page.waitForTimeout(600)
console.log("posts", posts)
console.log("alert", await page.locator("[role=alert]").allInnerTexts())

// interval
const every = page.getByLabel("Every")
await every.fill("0")
console.log("interval now", await every.inputValue())
await page.getByRole("button", { name: "Add repeating event" }).click()
await page.waitForTimeout(400)
console.log("posts after 0", posts)
console.log("invalid inputs", await page.locator("input:invalid").count())

// clear weekdays was already done; set one day back then set until before start
await page.getByRole("button", { name: "Sunday", exact: true }).click()
await page.getByLabel("Ends").click()
await page.getByRole("option", { name: "On a date" }).click()
const end = page.getByLabel("Last series date")
console.log("until value", await end.inputValue(), "min", await end.getAttribute("min"))
await page.getByLabel("Date").fill("2026-12-01")
console.log("until after date change", await end.inputValue(), "start", await page.getByLabel("Date").inputValue())
posts.length = 0
await page.getByRole("button", { name: "Add repeating event" }).click()
await page.waitForTimeout(500)
console.log("posts after date mismatch", posts, "alert", await page.locator("[role=alert]").allInnerTexts())

await browser.close()
