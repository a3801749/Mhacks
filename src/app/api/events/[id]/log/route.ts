import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"

export async function POST(req: NextRequest, ctx: RouteContext<"/api/events/[id]/log">) {
  const { id } = await ctx.params
  const { minutes, note } = (await req.json()) as { minutes: number; note?: string }
  const mins = Math.round(Number(minutes))
  if (!Number.isFinite(mins) || mins <= 0 || mins > 600) {
    return Response.json({ error: "minutes must be between 1 and 600" }, { status: 400 })
  }
  return handle(() => getStore().logTime(id, mins, (note ?? "").slice(0, 280)))
}
