import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore, integrations } from "@/lib/store"
import { addDays, validDate } from "@/lib/time"

export async function GET(req: NextRequest) {
  const today = todayFrom(req.nextUrl.searchParams.get("today"))
  const through = req.nextUrl.searchParams.get("through")
  if (through && (!validDate(through) || through > addDays(today, 5 * 366))) return Response.json({ error: "Calendar browsing supports up to five years ahead" }, { status: 400 })
  return handle(async () => ({ ...(await getStore().getWeek(today, through ?? undefined)), integrations: integrations() }))
}
