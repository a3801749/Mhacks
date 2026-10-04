/**
 * Clicks every visible button, switch, tab, and in-app link on each page.
 * Records page crashes, console errors, failed requests, and clicks that throw.
 *
 *   node e2e/click-through.mjs
 */
import { chromium } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:4317"
const PAGES = ["/", "/agenda", "/plan", "/rhythm", "/timeline", "/welcome"]
const OUT = "/tmp/andy-e2e"

const IGNORE_CONSOLE = /Download the React DevTools|hydration|favicon|Grammarly|data-gr-/i
const SKIP_NAME = /^(Andy|Today|Agenda|Plan|Analytics|Timeline)$/

const issues = []
function issue(kind, detail) {
  issues.push({ kind, ...detail })
  console.log(`ISSUE ${kind}: ${detail.page ?? ""} ${detail.name ?? ""} ${detail.message ?? ""}`.slice(0, 240))
}

async function reset() {
  await fetch(`${BASE}/api/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ today: new Date().toISOString().slice(0, 10) }),
  })
}

async function labelOf(locator) {
  const aria = await locator.getAttribute("aria-label")
  if (aria?.trim()) return aria.trim()
  const text = (await locator.innerText().catch(() => "")).replace(/\s+/g, " ").trim()
  return text.slice(0, 80)
}

async function targets(page) {
  const loc = page.locator("button, a[href], [role='switch'], [role='tab'], [role='slider']")
  const count = await loc.count()
  const found = []
  for (let i = 0; i < count; i++) {
    const el = loc.nth(i)
    if (!(await el.isVisible().catch(() => false))) continue
    if (!(await el.isEnabled().catch(() => false))) continue
    const href = await el.getAttribute("href")
    if (href && /^https?:/i.test(href)) continue
    const name = await labelOf(el)
    if (!name) continue
    const box = await el.boundingBox()
    if (!box || box.width < 2 || box.height < 2) continue
    found.push({ name, href: href ?? "" })
  }
  return found
}

async function clickNamed(page, name, href) {
  const loc = page.locator("button, a[href], [role='switch'], [role='tab'], [role='slider']")
  const count = await loc.count()
  for (let i = 0; i < count; i++) {
    const el = loc.nth(i)
    if (!(await el.isVisible().catch(() => false))) continue
    const elHref = (await el.getAttribute("href")) ?? ""
    if (href && elHref !== href) continue
    if ((await labelOf(el)) !== name) continue
    await el.click({ timeout: 2500 })
    return true
  }
  return false
}

async function sweep(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(700)
  const clicked = new Set()
  for (let step = 0; step < 60; step++) {
    if (!page.url().startsWith(BASE)) {
      await page.goto(`${BASE}${path}`)
    }
    const list = await targets(page)
    const next = list.find((t) => !clicked.has(`${t.name}|${t.href}`) && !SKIP_NAME.test(t.name))
    if (!next) break
    clicked.add(`${next.name}|${next.href}`)
    const before = page.url()
    try {
      const ok = await clickNamed(page, next.name, next.href)
      if (!ok) continue
      await page.waitForTimeout(350)
    } catch (err) {
      issue("click", { page: path, name: next.name, message: String(err).split("\n")[0] })
      await page.keyboard.press("Escape").catch(() => {})
      continue
    }
    // Leave in-app navigation alone; the other pages are swept on their own.
    if (page.url() !== before && !page.url().includes(path === "/" ? BASE + "/" : path)) {
      await page.goto(`${BASE}${path}`)
      await page.waitForTimeout(400)
      continue
    }
    await page.keyboard.press("Escape").catch(() => {})
    await page.waitForTimeout(150)
  }
  return clicked.size
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on("pageerror", (err) => issue("pageerror", { page: page.url(), message: err.message }))
page.on("console", (msg) => {
  if (msg.type() !== "error") return
  const text = msg.text()
  if (IGNORE_CONSOLE.test(text)) return
  issue("console", { page: page.url(), message: text.slice(0, 300) })
})
page.on("response", (res) => {
  if (res.status() >= 500) issue("http", { page: page.url(), message: `${res.status()} ${res.url()}` })
})

await mkdir(OUT, { recursive: true })
await reset()

const summary = []
for (const path of PAGES) {
  console.log(`\n== ${path}`)
  const n = await sweep(page, path)
  summary.push({ path, clicks: n })
  console.log(`clicked ${n}`)
  await page.screenshot({ path: `${OUT}${path.replace(/\//g, "_") || "_home"}.png`, fullPage: true })
}

await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${BASE}/`)
await page.waitForTimeout(500)
const mobileNav = await page.getByRole("link", { name: "Agenda" }).last().isVisible()
if (!mobileNav) issue("mobile-nav", { page: "/", message: "Agenda link not visible at 390px" })
await page.screenshot({ path: `${OUT}/mobile.png` })

await reset()
await browser.close()
await writeFile(`${OUT}/report.json`, JSON.stringify({ summary, issues }, null, 2))
console.log(`\n${issues.length} issues, report ${OUT}/report.json`)
process.exit(issues.length ? 1 : 0)
