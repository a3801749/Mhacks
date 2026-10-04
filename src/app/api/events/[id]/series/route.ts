import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"
import { validateSeries } from "@/lib/recurrence"
import { RequestError } from "@/lib/errors"
import type { SeriesScope } from "@/lib/types"

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/events/[id]/series">) {
  const { id } = await ctx.params
  return handle(async () => {
    const body = await req.json().catch(() => null)
    if (!["following", "all"].includes(body?.scope)) throw new RequestError("Choose which events to edit")
    const today = todayFrom(body?.today)
    const store = getStore()
    const week = await store.getWeek(today)
    if (body.scope === "following" && week.series.length >= 100) throw new RequestError("At most 100 active repeating series are supported")
    return store.editSeries(id, validateSeries(body), body.scope, today)
  })
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/events/[id]/series">) {
  const { id } = await ctx.params
  return handle(async () => {
    const body = await req.json().catch(() => null)
    if (!["this", "following", "all"].includes(body?.scope)) throw new RequestError("Choose which events to delete")
    const today = todayFrom(body?.today)
    const store = getStore()
    await store.getWeek(today)
    return store.removeEvents(id, body.scope as SeriesScope, today)
  })
}
