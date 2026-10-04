import type { Course, WeekData } from "./types"

export function normalizeCourseName(name: string) {
  return name.trim().replace(/\s+/g, " ")
}

export function courseKey(name: string) {
  return normalizeCourseName(name).toLowerCase()
}

export function matchesCourse(name: string, selected: ReadonlySet<string>) {
  return selected.size === 0 || [...selected].some((c) => courseKey(c) === courseKey(name))
}

/** Every course the user has: ones added on their own, then any only named by assignments. */
export function courseList(data: Pick<WeekData, "courses" | "projects">): (Course & { standalone: boolean })[] {
  const out = new Map<string, Course & { standalone: boolean }>()
  for (const c of data.courses ?? []) out.set(courseKey(c.name), { ...c, standalone: true })
  for (const p of data.projects) {
    if (!courseKey(p.course) || out.has(courseKey(p.course))) continue
    out.set(courseKey(p.course), { name: normalizeCourseName(p.course), color: p.color, standalone: false })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}
