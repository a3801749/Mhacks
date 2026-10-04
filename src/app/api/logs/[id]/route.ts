import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { MAX_LOG_MINUTES } from "@/lib/time"
import { getStore } from "@/lib/store"
import type { LogPatch } from "@/lib/store/types"

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/logs/[id]">) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as LogPatch
  const patch: LogPatch = {}
  if (body.minutes != null) {
    const mins = Math.round(Number(body.minutes))
    if (!Number.isFinite(mins) || mins === 0 || Math.abs(mins) > MAX_LOG_MINUTES) {
      return Response.json({ error: `Entries are between 1 minute and ${MAX_LOG_MINUTES / 60} hours` }, { status: 400 })
    }
    patch.minutes = mins
  }
  if (typeof body.note === "string") patch.note = body.note.slice(0, 280)
  return handle(() => getStore().updateLog(id, patch))
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/logs/[id]">) {
  const { id } = await ctx.params
  return handle(() => getStore().deleteLog(id))
}
