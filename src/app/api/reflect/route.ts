import type { NextRequest } from "next/server"
import { reflect } from "@/lib/ai/engine"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { today?: string }
  const today = todayFrom(body.today)
  return handle(async () => reflect(await getStore().getWeek(today), today))
}
