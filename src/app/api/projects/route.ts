import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { validDate } from "@/lib/time"
import { getStore } from "@/lib/store"
import type { NewProject } from "@/lib/store/types"
import { ASSIGNMENT_TYPES, PRIORITIES } from "@/lib/brand"


export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<NewProject>
  const name = body.name?.trim().slice(0, 80)
  if (!name) return Response.json({ error: "Give the assignment a name" }, { status: 400 })
  if (!body.type || !Object.hasOwn(ASSIGNMENT_TYPES, body.type)) return Response.json({ error: "Pick a type" }, { status: 400 })
  if (!validDate(body.dueDate) || !validDate(body.assignedDate)) {
    return Response.json({ error: "Assigned and due dates are required" }, { status: 400 })
  }
  if (body.dueDate < body.assignedDate) return Response.json({ error: "Due date is before the assigned date" }, { status: 400 })
  const targetMinutes = Math.round(Number(body.targetMinutes))
  if (!Number.isFinite(targetMinutes) || targetMinutes < 15 || targetMinutes > 200 * 60) {
    return Response.json({ error: "Estimate should be between 15 minutes and 200 hours" }, { status: 400 })
  }
  return handle(() =>
    getStore().createProject({
      name,
      course: body.course?.trim().slice(0, 40) || "General",
      type: body.type!,
      priority: body.priority && Object.hasOwn(PRIORITIES, body.priority) ? body.priority : "completion",
      notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : "",
      targetMinutes,
      assignedDate: body.assignedDate!,
      dueDate: body.dueDate!,
      firstTask: body.firstTask?.trim().slice(0, 80) || `Work on ${name}`,
    }),
  )
}
