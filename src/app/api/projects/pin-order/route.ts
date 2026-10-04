import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"

export async function PUT(req: NextRequest) {
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: unknown }
  if (!Array.isArray(ids) || ids.length > 100 || !ids.every((x) => typeof x === "string")) {
    return Response.json({ error: "ids must be a list of assignment ids" }, { status: 400 })
  }
  return handle(() => getStore().reorderPins(ids as string[]))
}
