import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:4317"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on("pageerror", (e) => errors.push("pageerror " + e.message))
page.on("console", (m) => {
  if (m.type() === "error" && !/DevTools|hydration|favicon/i.test(m.text())) errors.push("console " + m.text().slice(0, 200))
})
page.on("response", (r) => {
  if (r.status() >= 500) errors.push(`http ${r.status()} ${r.url()}`)
})

async function dump(title) {
  const names = await page.locator("button, [role='switch'], [role='tab']").evaluateAll((els) =>
    els
      .filter((el) => el.getBoundingClientRect().width > 2)
      .map((el) => (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 90))
      .filter(Boolean),
  )
  console.log(`\n# ${title}`)
  for (const n of [...new Set(names)]) console.log(" -", n)
}

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" })
await page.waitForTimeout(500)
await page.getByRole("button", { name: /Draft methods/ }).click()
await page.waitForTimeout(400)
await dump("block dialog")

await page.keyboard.press("Escape")
await page.getByRole("button", { name: "New assignment" }).click()
await page.waitForTimeout(300)
await dump("new assignment")

await page.keyboard.press("Escape")
await page.getByRole("button", { name: /Lighthouse mode/ }).click()
await page.waitForTimeout(300)
await dump("settings")

await page.keyboard.press("Escape")
await page.goto(BASE + "/agenda")
await page.waitForTimeout(400)
await page.getByRole("button", { name: "Schedule event" }).click()
await page.waitForTimeout(300)
await dump("schedule")

await page.keyboard.press("Escape")
await page.goto(BASE + "/plan")
await page.waitForTimeout(400)
await page.getByRole("button", { name: "Add a block" }).click()
await page.waitForTimeout(400)
await dump("plan add")

console.log("\n# errors")
for (const e of errors) console.log(e)
await browser.close()
