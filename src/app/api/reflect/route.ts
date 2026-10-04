import type { NextRequest } from "next/server"
import { reflect } from "@/lib/ai/engine"
import { handle, todayFrom } from "@/lib/api"
import { RequestError } from "@/lib/errors"
import { getStore } from "@/lib/store"

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { today?: string; minute?: number } | null
  const today = todayFrom(body?.today)
  const requestedMinute = body?.minute
  const minute = typeof requestedMinute === "number" && Number.isInteger(requestedMinute) && requestedMinute >= 0 && requestedMinute < 1440
    ? requestedMinute
    : 0
  return handle(async () => {
    const data = await getStore().getWeek(today)
    if (!data.settings.todayInsightsEnabled) throw new RequestError("Today insights are disabled", 403)
    return reflect(data, today, minute)
  })
}
