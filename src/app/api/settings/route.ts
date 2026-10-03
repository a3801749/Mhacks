import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"
import type { GuidanceMode } from "@/lib/types"

const MODES = new Set<GuidanceMode>(["anchor", "coach", "autopilot"])

export async function PUT(req: NextRequest) {
  const { guidanceMode } = (await req.json()) as { guidanceMode: GuidanceMode }
  if (!MODES.has(guidanceMode)) return Response.json({ error: "Unknown guidance mode" }, { status: 400 })
  return handle(() => getStore().updateSettings({ guidanceMode }))
}
