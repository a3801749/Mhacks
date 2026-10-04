import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"
import type { GuidanceMode, Settings } from "@/lib/types"

const MODES = new Set<GuidanceMode>(["anchor", "coach", "autopilot"])

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as (Partial<Settings> & { today?: string }) | null
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid settings" }, { status: 400 })
  for (const key of ["checkInEnabled", "aiPlannerEnabled", "todayInsightsEnabled", "analyticsPatternsEnabled", "screenTimeEnabled"] as const) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") return Response.json({ error: "Feature settings must be true or false" }, { status: 400 })
  }
  if (body.guidanceMode !== undefined && !MODES.has(body.guidanceMode)) {
    return Response.json({ error: "Unknown guidance mode" }, { status: 400 })
  }
  return handle(async () => {
    const store = getStore()
    const { settings } = await store.getWeek(todayFrom(body.today))
    const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback)
    return store.updateSettings({
      guidanceMode: body.guidanceMode ?? settings.guidanceMode,
      checkInEnabled: bool(body.checkInEnabled, settings.checkInEnabled),
      aiPlannerEnabled: bool(body.aiPlannerEnabled, settings.aiPlannerEnabled),
      todayInsightsEnabled: bool(body.todayInsightsEnabled, settings.todayInsightsEnabled),
      analyticsPatternsEnabled: bool(body.analyticsPatternsEnabled, settings.analyticsPatternsEnabled),
      screenTimeEnabled: false,
    })
  })
}
