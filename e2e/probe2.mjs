import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:4317"
const today = "2026-10-04"
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on("pageerror", (e) => console.log("PAGEERROR", e.message))

async function week() {
  return page.request.get(`${BASE}/api/week?today=${today}`).then((r) => r.json())
}
async function buttons() {
  return page.locator("button").evaluateAll((els) =>
    els.filter((el) => el.getBoundingClientRect().width > 2).map((el) => (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80)).filter(Boolean),
  )
}

await page.request.post(`${BASE}/api/reset`, { data: { today } })
await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
console.log("AGENDA BUTTONS", (await buttons()).filter((n) => /Event|Exam|Assign|Sort|EECS|month/i.test(n)))

const list = page.getByRole("region", { name: "Assignments and events" })
console.log("LIST BEFORE\n", (await list.innerText()).slice(0, 500))
await page.getByRole("button", { name: "Exam", exact: true }).click()
console.log("LIST AFTER EXAM\n", (await list.innerText()).slice(0, 700))
await page.getByRole("radio", { name: "Events" }).click()
console.log("LIST EVENTS\n", (await list.innerText()).slice(0, 700))

await page.goto(BASE + "/agenda?course=" + encodeURIComponent("EECS 281"), { waitUntil: "networkidle" })
const chips = page.getByRole("group", { name: "Classes" })
console.log("COURSE CHIPS\n", await chips.innerText())
console.log("LIST URL FILTER\n", (await list.innerText()).slice(0, 500))

// month click a day and next
await page.getByRole("button", { name: "Next month" }).click()
await page.waitForTimeout(200)
const days = await page.getByRole("button", { pressed: false }).evaluateAll((els) => els.slice(0, 3).map((el) => el.getAttribute("aria-label")))
console.log("sample days next month", days)
const nov1 = page.getByRole("button", { name: /November 1/ })
console.log("nov1 count", await nov1.count())
if (await nov1.count()) {
  await nov1.first().click()
  console.log("detail after nov1", await page.locator("text=/November|Today|Tomorrow/").allInnerTexts())
}

// timeline
await page.goto(BASE + "/timeline", { waitUntil: "networkidle" })
const hackInput = page.getByLabel("Due date for Hackathon prep")
console.log("input", await hackInput.inputValue())
const edge = page.getByRole("slider", { name: /Due date for Hackathon prep/ })
const box = await edge.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 10 })
console.log("during", await hackInput.inputValue(), "valuetext", await edge.getAttribute("aria-valuetext"))
await page.mouse.up()
await page.waitForTimeout(800)
const saved = (await week()).projects.find((p) => p.name === "Hackathon prep")
console.log("after up input", await hackInput.inputValue(), "saved", saved.dueDate, "valuetext", await edge.getAttribute("aria-valuetext"))

// type a different date without the drag having synced
await hackInput.fill("2026-10-20")
console.log("typed", await hackInput.inputValue(), "save visible", await page.getByRole("button", { name: "Save" }).count())

// plan drag resize
await page.goto(BASE + "/plan", { waitUntil: "networkidle" })
const data = await week()
const ev = data.events.find((e) => e.title === "Prototype voice flow" && e.date >= today)
console.log("event before", ev.date, ev.startMin, ev.endMin)
const handle = page.getByRole("button", { name: /Resize Prototype voice flow/ }).first()
const hb = await handle.boundingBox()
console.log("resize box", hb)
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
await page.mouse.down()
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 44, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(600)
const ev2 = (await week()).events.find((e) => e.id === ev.id)
console.log("event after +44px resize", ev2.date, ev2.startMin, ev2.endMin, "delta", ev2.endMin - ev.endMin)

const move = page.getByRole("button", { name: /Move Prototype voice flow/ }).first()
const mb = await move.boundingBox()
await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
await page.mouse.down()
await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2 + 44, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(600)
const ev3 = (await week()).events.find((e) => e.id === ev.id)
console.log("event after +44px move", ev3.date, ev3.startMin, ev3.endMin, "startDelta", ev3.startMin - ev2.startMin)

// click open again via keyboard? 
const card = page.locator("[data-event] button").filter({ hasText: "Prototype voice flow" }).first()
await card.click({ force: true })
await page.waitForTimeout(300)
console.log("force click dialogs", await page.getByRole("dialog").count())

// insights
await page.goto(BASE + "/", { waitUntil: "networkidle" })
const reqs = []
page.on("request", (r) => { if (r.url().includes("/api/reflect")) reqs.push(r.postData()) })
await page.waitForTimeout(1500)
console.log("reflect so far", reqs.length)
const refresh = page.getByRole("button", { name: "Refresh insights" })
console.log("refresh count", await refresh.count(), "disabled", await refresh.first().isDisabled())
const text1 = await page.locator("#" + (await page.getByRole("heading", { name: "Insights" }).first().getAttribute("id"))).locator("xpath=ancestor::section[1]").innerText().catch(async () => {
  return (await page.locator("text=Insights").first().locator("xpath=ancestor::div[1]").innerText())
})
console.log("INSIGHTS1", text1.slice(0, 350).replace(/\n/g, " | "))
await refresh.first().click()
await page.waitForTimeout(2000)
console.log("reflect after click", reqs.length, reqs.map((b) => b?.slice(0, 80)))
const text2 = await page.locator("text=Compiled").first().locator("xpath=ancestor::div[contains(@class,'space-y-4')][1]").innerText().catch(() => "no compiled")
console.log("INSIGHTS2", String(text2).slice(0, 350).replace(/\n/g, " | "))

// recurrence
await page.goto(BASE + "/agenda", { waitUntil: "networkidle" })
await page.getByRole("button", { name: "Schedule event" }).click()
await page.getByRole("button", { name: "Event", exact: true }).click()
await page.getByLabel("Title").fill("Bad repeat")
await page.getByLabel("Repeats").check()
for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
  const b = page.getByRole("button", { name: day, exact: true })
  if ((await b.getAttribute("aria-pressed")) === "true") await b.click()
}
const states = []
for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
  states.push(await page.getByRole("button", { name: day, exact: true }).getAttribute("aria-pressed"))
}
console.log("weekday states", states.join(","))
const posts = []
page.on("request", (r) => { if (r.url().includes("event-series")) posts.push(r.method() + " " + r.postData()) })
await page.getByRole("button", { name: "Add repeating event" }).click()
await page.waitForTimeout(800)
console.log("posts", posts)
console.log("alerts", await page.locator("[role=alert]").allInnerTexts())
console.log("dialog still", await page.getByRole("dialog").count())

await browser.close()
