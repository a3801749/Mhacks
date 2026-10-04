import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"
import type { EventPatch } from "@/lib/store/types"
import { validDate } from "@/lib/schedule-validation"
import { RequestError } from "@/lib/errors"

const STATUSES = new Set(["planned", "completed", "partial", "skipped"])

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/events/[id]">) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as EventPatch | null
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid block update" }, { status: 400 })
  const patch: EventPatch = {}
  if (body.status && STATUSES.has(body.status)) patch.status = body.status
  if (body.date !== undefined) {
    if (!validDate(body.date)) return Response.json({ error: "Invalid block date" }, { status: 400 })
    patch.date = body.date
  }
  for (const key of ["startMin", "endMin"] as const) {
    const value = body[key]
    if (value !== undefined) {
      if (!Number.isInteger(value) || value < 0 || value > 1440) return Response.json({ error: "Invalid block time" }, { status: 400 })
      patch[key] = value
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "movedFromDate")) {
    if (body.movedFromDate !== null && !validDate(body.movedFromDate)) return Response.json({ error: "Invalid original date" }, { status: 400 })
    patch.movedFromDate = body.movedFromDate
  }
  if (Object.prototype.hasOwnProperty.call(body, "movedFromStartMin")) {
    const value = body.movedFromStartMin
    if (value !== null && (!Number.isInteger(value) || value! < 0 || value! >= 1440)) return Response.json({ error: "Invalid original time" }, { status: 400 })
    patch.movedFromStartMin = value
  }
  return handle(async () => {
    const store = getStore()
    const week = await store.getWeek(todayFrom(patch.date))
    const event = week.events.find((e) => e.id === id)
    if (!event) throw new RequestError("Block not found", 404)
    if ((patch.endMin ?? event.endMin) <= (patch.startMin ?? event.startMin)) throw new RequestError("End time must be after the start")
    return store.updateEvent(id, patch)
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
