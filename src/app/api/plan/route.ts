import type { NextRequest } from "next/server"
import { planBlock } from "@/lib/ai/engine"
import { handle, todayFrom } from "@/lib/api"
import { RequestError } from "@/lib/errors"
import { validDate } from "@/lib/time"
import { getStore } from "@/lib/store"

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { date: string; startMin: number; endMin: number; today?: string }
  const startMin = Math.round(Number(body.startMin))
  const endMin = Math.round(Number(body.endMin))
  if (!validDate(body.date) || !(startMin >= 0 && endMin <= 1440 && endMin - startMin >= 15)) {
    return Response.json({ error: "Invalid block" }, { status: 400 })
  }
  const today = todayFrom(body.today)
  return handle(async () => {
    const data = await getStore().getWeek(today)
    if (!data.settings.aiPlannerEnabled) throw new RequestError("Tilly planner suggestions are disabled", 403)
    return planBlock(data, { date: body.date, startMin, endMin }, today)
  })
}
