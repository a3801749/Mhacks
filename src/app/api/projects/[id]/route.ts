import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { ASSIGNMENT_TYPES, PRIORITIES } from "@/lib/brand"
import { getStore } from "@/lib/store"
import { validDate } from "@/lib/time"
import { RequestError } from "@/lib/errors"
import type { ProjectPatch } from "@/lib/store/types"


export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as (ProjectPatch & { today?: string }) | null
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid assignment update" }, { status: 400 })
  const patch: ProjectPatch = {}
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80)
  if (typeof body.course === "string" && body.course.trim()) patch.course = body.course.trim().slice(0, 40)
  if (body.type && body.type in ASSIGNMENT_TYPES) patch.type = body.type
  if (body.priority && body.priority in PRIORITIES) patch.priority = body.priority
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000)
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned
  if (body.targetMinutes !== undefined) {
    if (!Number.isFinite(body.targetMinutes) || body.targetMinutes < 15 || body.targetMinutes > 12000) return Response.json({ error: "Estimate should be between 15 minutes and 200 hours" }, { status: 400 })
    patch.targetMinutes = Math.round(body.targetMinutes)
  }
  for (const key of ["assignedDate", "dueDate"] as const) if (body[key] !== undefined) {
    if (!validDate(body[key])) return Response.json({ error: "Invalid assignment date" }, { status: 400 })
    patch[key] = body[key]
  }
  if ("progressPercent" in body) {
    const p = body.progressPercent
    if (p != null && (!Number.isFinite(p) || p < 0 || p > 100)) return Response.json({ error: "Progress must be between 0 and 100" }, { status: 400 })
    patch.progressPercent = p == null ? null : Math.round(p)
  }
  if ("completedDate" in body) {
    if (body.completedDate != null && !validDate(body.completedDate)) return Response.json({ error: "Invalid completion date" }, { status: 400 })
    patch.completedDate = body.completedDate ?? null
  }
  return handle(async () => {
    const store = getStore()
    const data = await store.getWeek(todayFrom(body.today))
    const project = data.projects.find((p) => p.id === id)
    if (!project) throw new RequestError("Assignment not found", 404)
    if ((patch.dueDate ?? project.dueDate) < (patch.assignedDate ?? project.assignedDate)) throw new RequestError("Due date cannot be before the assigned date")
    return store.updateProject(id, patch)
  })
}
