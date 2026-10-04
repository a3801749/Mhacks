import type { NextRequest } from "next/server"
import { reflect } from "@/lib/ai/engine"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { today?: string; minute?: number } | null
  const today = todayFrom(body?.today)
  const requestedMinute = body?.minute
  const minute = typeof requestedMinute === "number" && Number.isInteger(requestedMinute) && requestedMinute >= 0 && requestedMinute < 1440
    ? requestedMinute
    : 0
  return handle(async () => reflect(await getStore().getWeek(today), today, minute))
}
