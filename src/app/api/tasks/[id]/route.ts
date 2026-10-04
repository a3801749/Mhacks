import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params
  const { done } = (await req.json().catch(() => ({}))) as { done: boolean }
  return handle(() => getStore().setTaskDone(id, Boolean(done)))
}
