import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"
import type { EventPatch } from "@/lib/store/types"

const STATUSES = new Set(["planned", "completed", "partial", "skipped"])

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/events/[id]">) {
  const { id } = await ctx.params
  const body = (await req.json()) as EventPatch
  const patch: EventPatch = {}
  if (body.status && STATUSES.has(body.status)) patch.status = body.status
  if (typeof body.date === "string") patch.date = body.date
  if (typeof body.startMin === "number") patch.startMin = body.startMin
  if (typeof body.endMin === "number") patch.endMin = body.endMin
  return handle(() => getStore().updateEvent(id, patch))
}
