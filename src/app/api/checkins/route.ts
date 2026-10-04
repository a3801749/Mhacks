import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { getStore } from "@/lib/store"
import { validDate } from "@/lib/time"

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { date: string; rating: number; note?: string } | null
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid check-in" }, { status: 400 })
  const { date, rating, note } = body
  if (!validDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 })
  const r = Math.round(Number(rating))
  if (!(r >= 1 && r <= 10)) return Response.json({ error: "Rating must be 1–10" }, { status: 400 })
  const text = typeof note === "string" ? note.slice(0, 280) : ""
  return handle(() => getStore().saveCheckIn(date, r, text))
}
