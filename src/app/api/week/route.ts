import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore, integrations } from "@/lib/store"

export async function GET(req: NextRequest) {
  const today = todayFrom(req.nextUrl.searchParams.get("today"))
  return handle(async () => ({ ...(await getStore().getWeek(today)), integrations: integrations() }))
}
