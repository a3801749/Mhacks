import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"
import type { GuidanceMode, Settings } from "@/lib/types"

const MODES = new Set<GuidanceMode>(["anchor", "coach", "autopilot"])

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Partial<Settings>
  if (body.guidanceMode && !MODES.has(body.guidanceMode)) {
    return Response.json({ error: "Unknown guidance mode" }, { status: 400 })
  }
  return handle(async () => {
    const store = getStore()
    const { settings } = await store.getWeek(todayFrom(null))
    const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback)
    return store.updateSettings({
      guidanceMode: body.guidanceMode ?? settings.guidanceMode,
      checkInEnabled: bool(body.checkInEnabled, settings.checkInEnabled),
      aiPlannerEnabled: bool(body.aiPlannerEnabled, settings.aiPlannerEnabled),
      screenTimeEnabled: false,
    })
  })
}
