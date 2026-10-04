import type { NextRequest } from "next/server"
import { adjustSchedule } from "@/lib/ai/engine"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"
import { sanitizeScheduleChanges } from "@/lib/schedule-validation"
import type { ChatTurn } from "@/lib/types"

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    message: string
    history?: ChatTurn[]
    now?: { date: string; minute: number }
  } | null
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid scheduling request" }, { status: 400 })
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : ""
  const history: ChatTurn[] = Array.isArray(body.history) ? body.history
    .filter((t) => t && ["user", "agent"].includes(t.role) && typeof t.text === "string")
    .slice(-8).map((t) => ({ role: t.role, text: t.text.slice(0, 500) })) : []
  if (!message) return Response.json({ error: "Say something first" }, { status: 400 })
  const minute = body.now?.minute ?? 0
  if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) return Response.json({ error: "Invalid current time" }, { status: 400 })
  const now = { date: todayFrom(body.now?.date), minute }

  return handle(async () => {
    const store = getStore()
    const week = await store.getWeek(now.date)
    const result = await adjustSchedule(week, message, history, now)
    // Model requests can take seconds. Respect changes to the calendar and guidance made meanwhile.
    const latest = await store.getWeek(now.date)
    const changes = sanitizeScheduleChanges(result.changes, latest, now)
    const autoApplied = latest.settings.guidanceMode === "autopilot" && changes.length > 0
    const updated = autoApplied ? await store.applyChanges(changes) : null
    const reply = changes.length === result.changes.length ? result.reply
      : "Your calendar changed while I was planning. Review the remaining changes, or ask me again."
    return { ...result, reply, changes, autoApplied, week: updated }
  })
}
