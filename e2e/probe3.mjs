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

// Agenda day selection + month days
await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
const cal = page.locator("div.rounded-lg.border.bg-card").first()
console.log("CAL\n", (await cal.innerText()).slice(0, 400))
await page.getByRole("button", { name: "Next month" }).click()
console.log("CAL NEXT\n", (await cal.innerText()).slice(0, 400))
const novDay = page.getByRole("button", { name: /Sunday Nov 1/ })
console.log("nov day", await novDay.count(), await novDay.first().getAttribute("aria-label").catch(() => ""))
if (await novDay.count()) {
  await novDay.first().click()
  const detail = page.locator("h2").nth(1)
  console.log("detail h2", await detail.innerText())
}

// click today-ish in october
await page.getByRole("button", { name: "Previous month" }).click()
const oct6 = page.getByRole("button", { name: /Oct 6/ })
console.log("oct6", await oct6.count(), await oct6.first().getAttribute("aria-label").catch(() => ""))
await oct6.first().click()
console.log("detail after oct6", await page.locator("h2").nth(1).innerText())

// Timeline drag vs input
await page.goto(BASE + "/timeline", { waitUntil: "networkidle" })
const hackInput = page.locator("input[aria-label='Due date for Hackathon prep']")
const edge = page.getByRole("slider", { name: /Due date for Hackathon prep/ })
console.log("input before", await hackInput.inputValue(), "valuetext", await edge.getAttribute("aria-valuetext"))
const box = await edge.boundingBox()
await page.mouse.move(box.x + 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + 140, box.y + box.height / 2, { steps: 12 })
console.log("during input", await hackInput.inputValue(), "valuetext", await edge.getAttribute("aria-valuetext"))
await page.mouse.up()
await page.waitForTimeout(900)
const saved = (await week()).projects.find((p) => p.name === "Hackathon prep")
console.log("after input", await hackInput.inputValue(), "saved", saved.dueDate, "valuetext", await edge.getAttribute("aria-valuetext"))

// arrow vs input
const before = await hackInput.inputValue()
await edge.focus()
await page.keyboard.press("ArrowLeft")
await page.waitForTimeout(700)
console.log("arrow input", await hackInput.inputValue(), "from", before, "saved", (await week()).projects.find((p) => p.name === "Hackathon prep").dueDate)

// Plan resize/move
await page.goto(BASE + "/plan", { waitUntil: "networkidle" })
let data = await week()
const ev = data.events.find((e) => e.title === "Prototype voice flow" && e.date >= today && e.status === "planned")
console.log("before", ev.id, ev.date, ev.startMin, ev.endMin)
const handle = page.getByRole("button", { name: /Resize Prototype voice flow/ }).first()
await handle.scrollIntoViewIfNeeded()
const hb = await handle.boundingBox()
console.log("resize box", hb)
await page.mouse.move(hb.x + hb.width / 2, hb.y + 1)
await page.mouse.down()
await page.mouse.move(hb.x + hb.width / 2, hb.y + 1 + 44, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(700)
let ev2 = (await week()).events.find((e) => e.id === ev.id)
console.log("after resize +44px", ev2.startMin, ev2.endMin, "deltaEnd", ev2.endMin - ev.endMin)

const move = page.getByRole("button", { name: /Move Prototype voice flow/ }).first()
await move.scrollIntoViewIfNeeded()
const mb = await move.boundingBox()
console.log("move box", mb)
await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
await page.mouse.down()
await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2 + 44, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(700)
const ev3 = (await week()).events.find((e) => e.id === ev.id)
console.log("after move +44px", ev3.date, ev3.startMin, ev3.endMin, "startDelta", ev3.startMin - ev2.startMin, "endDelta", ev3.endMin - ev2.endMin)

// draw a selection and see the dialog times
const col = page.locator(".cursor-crosshair").nth(1)
const cb = await col.boundingBox()
console.log("col box", cb)
// 9am is 3 hours below top = 132px
const y9 = cb.y + 3 * 44 + 4
const y11 = cb.y + 5 * 44 + 4
await page.mouse.move(cb.x + 20, y9)
await page.mouse.down()
await page.mouse.move(cb.x + 20, y11, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)
console.log("draft dialog", await page.getByRole("dialog").innerText().catch(() => "none"))
const from = await page.getByLabel("From").inputValue().catch(() => "?")
const to = await page.getByLabel("To").inputValue().catch(() => "?")
console.log("draft times", from, to)

// insights
await page.keyboard.press("Escape")
await page.goto(BASE + "/", { waitUntil: "networkidle" })
const reqs = []
page.on("request", (r) => { if (r.url().includes("/api/reflect") && r.method() === "POST") reqs.push(r.postData()) })
await page.getByRole("button", { name: "Refresh insights" }).first().waitFor({ timeout: 8000 })
console.log("reqs before click", reqs.length)
const block = page.locator("text=Compiled").first()
const t1 = await block.locator("xpath=ancestor::div[1]").innerText()
console.log("T1", t1.replace(/\n/g, " | ").slice(0, 280))
await page.getByRole("button", { name: "Refresh insights" }).first().click()
await page.waitForTimeout(2500)
console.log("reqs after", reqs.length, reqs)
const t2 = await page.locator("text=Compiled").first().locator("xpath=ancestor::div[1]").innerText()
console.log("T2", t2.replace(/\n/g, " | ").slice(0, 280))
console.log("same", t1 === t2)

// recurrence
await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
await page.getByRole("button", { name: "Schedule event" }).click()
await page.getByRole("button", { name: "Event", exact: true }).click()
await page.getByLabel("Title").fill("Bad repeat")
await page.getByLabel("Repeats").check()
const interval = page.getByLabel("Every")
await interval.fill("")
await interval.fill("0")
console.log("interval value", await interval.inputValue())
for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
  const b = page.getByRole("button", { name: day, exact: true })
  if ((await b.getAttribute("aria-pressed")) === "true") await b.click()
}
console.log("pressed", await Promise.all(["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(async d => d[0] + (await page.getByRole("button", { name: d, exact: true }).getAttribute("aria-pressed")))))
const posts = []
page.on("request", (r) => { if (r.url().includes("event-series")) posts.push(r.method()+" "+(r.postData()||"").slice(0,180)) })
await page.getByRole("button", { name: "Add repeating event" }).click()
await page.waitForTimeout(800)
console.log("posts", posts)
console.log("alerts", await page.locator("[role=alert]").allInnerTexts())
console.log("validation", await page.locator("input:invalid").evaluateAll(els => els.map(e => e.getAttribute("aria-label") || e.id)))

await browser.close()
