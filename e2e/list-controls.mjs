import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:4317"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
for (const path of ["/", "/agenda", "/plan", "/rhythm", "/timeline"]) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(600)
  const names = await page.locator("button, a[href], [role='switch']").evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden"
      })
      .map((el) => (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70))
      .filter(Boolean),
  )
  console.log(`\n== ${path} (${names.length})`)
  for (const n of [...new Set(names)]) console.log(" -", n)
}
await browser.close()
