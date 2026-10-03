import type { NextRequest } from "next/server"
import { planBlock } from "@/lib/ai/engine"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { date: string; startMin: number; endMin: number; today?: string }
  const startMin = Math.round(Number(body.startMin))
  const endMin = Math.round(Number(body.endMin))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") || !(startMin >= 0 && endMin <= 1440 && endMin - startMin >= 15)) {
    return Response.json({ error: "Invalid block" }, { status: 400 })
  }
  const today = todayFrom(body.today)
  return handle(async () => planBlock(await getStore().getWeek(today), { date: body.date, startMin, endMin }, today))
}
