import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"
import { validDate } from "@/lib/time"

export async function PUT(req: NextRequest) {
  const { date, rating, note } = (await req.json().catch(() => ({}))) as { date: string; rating: number; note?: string }
  if (!validDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 })
  const r = Math.round(Number(rating))
  if (!(r >= 1 && r <= 10)) return Response.json({ error: "Rating must be 1–10" }, { status: 400 })
  const text = typeof note === "string" ? note.slice(0, 280) : ""
  return handle(() => getStore().saveCheckIn(date, r, text))
}
