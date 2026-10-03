import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"
import { validateScheduleChanges } from "@/lib/schedule-validation"
import { RequestError } from "@/lib/errors"

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => null)
    const store = getStore()
    const week = await store.getWeek(todayFrom(body?.today))
    let changes
    try {
      changes = validateScheduleChanges(body?.changes, week)
    } catch (err) {
      throw new RequestError(err instanceof Error ? err.message : "Invalid schedule changes")
    }
    return store.applyChanges(changes)
  })
}
