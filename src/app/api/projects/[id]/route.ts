import type { NextRequest } from "next/server"
import { handle } from "@/lib/api"
import { ASSIGNMENT_TYPES } from "@/lib/brand"
import { getStore } from "@/lib/store"
import type { ProjectPatch } from "@/lib/store/types"

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params
  const body = (await req.json()) as ProjectPatch
  const patch: ProjectPatch = {}
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80)
  if (typeof body.course === "string" && body.course.trim()) patch.course = body.course.trim().slice(0, 40)
  if (body.type && body.type in ASSIGNMENT_TYPES) patch.type = body.type
  if (typeof body.targetMinutes === "number" && body.targetMinutes >= 15) patch.targetMinutes = Math.round(body.targetMinutes)
  if (body.assignedDate && DATE.test(body.assignedDate)) patch.assignedDate = body.assignedDate
  if (body.dueDate && DATE.test(body.dueDate)) patch.dueDate = body.dueDate
  if ("progressPercent" in body) {
    const p = body.progressPercent
    patch.progressPercent = p == null ? null : Math.max(0, Math.min(100, Math.round(p)))
  }
  if ("completedDate" in body) {
    patch.completedDate = body.completedDate && DATE.test(body.completedDate) ? body.completedDate : null
  }
  return handle(() => getStore().updateProject(id, patch))
}
