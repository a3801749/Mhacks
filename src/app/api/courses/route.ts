import type { NextRequest } from "next/server"
import { handle, todayFrom } from "@/lib/api"
import { courseKey, courseList, normalizeCourseName } from "@/lib/courses"
import { RequestError } from "@/lib/errors"
import { getStore } from "@/lib/store"
import { PROJECT_COLORS } from "@/lib/store/types"

function courseName(value: unknown) {
  const name = typeof value === "string" ? normalizeCourseName(value) : ""
  if (!name || name.length > 40) throw new RequestError("Enter a course name of at most 40 characters")
  return name
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => null)
    const name = courseName(body?.name)
    const store = getStore()
    const week = await store.getWeek(todayFrom(body?.today))
    const existing = week.courses.find((c) => courseKey(c.name) === courseKey(name))
    if (!existing && week.courses.length >= 100) throw new RequestError("You can keep up to 100 courses")
    let color = typeof body?.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : existing?.color ?? null
    if (!color) {
      const used = new Set(courseList(week).map((c) => c.color.toLowerCase()))
      color = PROJECT_COLORS.find((c) => !used.has(c.toLowerCase())) ?? PROJECT_COLORS[week.courses.length % PROJECT_COLORS.length]
    }
    return store.saveCourse(name, color)
  })
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => null)
    const store = getStore()
    await store.getWeek(todayFrom(body?.today))
    return store.deleteCourse(courseName(body?.name))
  })
}
