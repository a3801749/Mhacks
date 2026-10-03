import type { NextRequest } from "next/server"
import { adjustSchedule } from "@/lib/ai/engine"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"
import type { ChatTurn } from "@/lib/types"

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    message: string
    history?: ChatTurn[]
    now?: { date: string; minute: number }
  }
  const message = (body.message ?? "").trim().slice(0, 500)
  if (!message) return Response.json({ error: "Say something first" }, { status: 400 })
  const now = { date: todayFrom(body.now?.date), minute: Number(body.now?.minute) || 0 }

  return handle(async () => {
    const store = getStore()
    const week = await store.getWeek(now.date)
    const result = await adjustSchedule(week, message, body.history ?? [], now)
    const autoApplied = week.settings.guidanceMode === "autopilot" && result.changes.length > 0
    const updated = autoApplied ? await store.applyChanges(result.changes) : null
    return { ...result, autoApplied, week: updated }
  })
}
