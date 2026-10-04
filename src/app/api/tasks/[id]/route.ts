import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as { done?: unknown } | null
  if (!body || typeof body.done !== "boolean") return Response.json({ error: "done must be true or false" }, { status: 400 })
  const done = body.done
  return handle(() => getStore().setTaskDone(id, done))
}
