import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"
import { validateSeries } from "@/lib/recurrence"
import { RequestError } from "@/lib/errors"

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => null)
    const today = todayFrom(body?.today)
    const store = getStore()
    const week = await store.getWeek(today)
    if (week.series.length >= 100) throw new RequestError("Delete an old repeating series before adding another (100 series are stored)")
    if (body?.replaceEventId !== undefined) {
      const event = week.events.find((e) => e.id === body.replaceEventId)
      if (!event || event.seriesId || event.kind !== "life" || event.status !== "planned" || event.actualMinutes > 0 || week.logs.some((l) => l.eventId === event.id)) {
        throw new RequestError("Only an unworked personal event can be converted into a repeating series")
      }
    }
    return store.createSeries(validateSeries(body), today, body?.replaceEventId)
  })
}
