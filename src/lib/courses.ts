import type { Course, WeekData } from "./types"

/** Every course the user has: ones added on their own, then any only named by assignments. */
export function courseList(data: Pick<WeekData, "courses" | "projects">): (Course & { standalone: boolean })[] {
  const out = new Map<string, Course & { standalone: boolean }>()
  for (const c of data.courses ?? []) out.set(c.name.toLowerCase(), { ...c, standalone: true })
  for (const p of data.projects) {
    if (!p.course || out.has(p.course.toLowerCase())) continue
    out.set(p.course.toLowerCase(), { name: p.course, color: p.color, standalone: false })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}
