import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"
import type { ScheduleChange } from "@/lib/types"

export async function POST(req: NextRequest) {
  const { changes } = (await req.json()) as { changes: ScheduleChange[] }
  if (!Array.isArray(changes)) return Response.json({ error: "changes must be an array" }, { status: 400 })
  return handle(() => getStore().applyChanges(changes))
}
