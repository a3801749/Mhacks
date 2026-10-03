import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"

export async function PUT(req: NextRequest) {
  const { date, rating, note } = (await req.json()) as { date: string; rating: number; note?: string }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return Response.json({ error: "Invalid date" }, { status: 400 })
  const r = Math.round(Number(rating))
  if (!(r >= 1 && r <= 10)) return Response.json({ error: "Rating must be 1–10" }, { status: 400 })
  return handle(() => getStore().saveCheckIn(date, r, (note ?? "").slice(0, 280)))
}
