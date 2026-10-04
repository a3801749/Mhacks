import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { MAX_LOG_MINUTES } from "@/lib/time"
import { getStore } from "@/lib/store"

export async function POST(req: NextRequest, ctx: RouteContext<"/api/events/[id]/log">) {
  const { id } = await ctx.params
  const { minutes, note } = (await req.json().catch(() => ({}))) as { minutes: number; note?: string }
  const mins = Math.round(Number(minutes))
  if (!Number.isFinite(mins) || mins === 0 || Math.abs(mins) > MAX_LOG_MINUTES) {
    return Response.json({ error: `Log between 1 minute and ${MAX_LOG_MINUTES / 60} hours at a time` }, { status: 400 })
  }
  const text = typeof note === "string" ? note.slice(0, 280) : ""
  return handle(() => getStore().logTime(id, mins, text))
}
