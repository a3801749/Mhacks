import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { getStore } from "@/lib/store"

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { today?: string }
  return handle(() => getStore().reset(todayFrom(body.today)))
}
