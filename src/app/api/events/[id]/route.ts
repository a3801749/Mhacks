import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"
import { validateEventPatch } from "@/lib/event-update"

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/events/[id]">) {
  const { id } = await ctx.params
  return handle(async () => {
    const body = await req.json().catch(() => null)
    const store = getStore()
    const week = await store.getWeek(todayFrom(body?.today))
    return store.updateEvent(id, validateEventPatch(body, week, id))
  })
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/events/[id]">) {
  const { id } = await ctx.params
  return handle(async () => {
    const store = getStore()
    await store.getWeek(todayFrom(null))
    return store.deleteEvent(id)
  })
}
