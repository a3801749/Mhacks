import { daysBetween } from "./time"
import type { CalendarEvent, Project, Task, TimeLog, WeekData } from "./types"

export function isPast(e: CalendarEvent, today: string) {
  return e.date < today || e.status !== "planned"
}

export function taskLogged(taskId: string, logs: TimeLog[]) {
  return logs.filter((l) => l.taskId === taskId).reduce((sum, l) => sum + l.minutes, 0)
}

export function projectLogged(projectId: string, tasks: Task[], logs: TimeLog[]) {
  const ids = new Set(tasks.filter((t) => t.projectId === projectId).map((t) => t.id))
  return logs.filter((l) => ids.has(l.taskId)).reduce((sum, l) => sum + l.minutes, 0)
}

export function projectScheduledAhead(projectId: string, events: CalendarEvent[], today: string) {
  return events
    .filter((e) => e.projectId === projectId && e.status === "planned" && e.date >= today)
    .reduce((sum, e) => sum + (e.endMin - e.startMin), 0)
}

export type Pace = "ahead" | "on-track" | "behind" | "done"

export interface ProjectHealth {
  project: Project
  logged: number
  remaining: number
  scheduledAhead: number
  daysLeft: number
  percent: number
  pace: Pace
}

export function projectHealth(data: WeekData, today: string): ProjectHealth[] {
  return data.projects.map((project) => {
    const logged = projectLogged(project.id, data.tasks, data.logs)
    const remaining = Math.max(0, project.targetMinutes - logged)
    const scheduledAhead = projectScheduledAhead(project.id, data.events, today)
    const daysLeft = Math.max(0, daysBetween(today, project.dueDate))
    const percent = Math.min(100, Math.round((logged / project.targetMinutes) * 100))
    let pace: Pace = "on-track"
    if (remaining === 0) pace = "done"
    else if (scheduledAhead >= remaining) pace = "ahead"
    else if (daysLeft <= 3 && scheduledAhead < remaining * 0.6) pace = "behind"
    return { project, logged, remaining, scheduledAhead, daysLeft, percent, pace }
  })
}

type Bucket = "morning" | "afternoon" | "evening"

function bucketOf(startMin: number): Bucket {
  if (startMin < 12 * 60) return "morning"
  if (startMin < 17 * 60) return "afternoon"
  return "evening"
}

export interface BacktrackStats {
  windowStart: string
  windowEnd: string
  plannedMinutes: number
  actualMinutes: number
  completionRate: number
  counts: { completed: number; partial: number; skipped: number; total: number }
  byTimeOfDay: Record<Bucket, { planned: number; actual: number; skipped: number; blocks: number }>
  byDay: { date: string; planned: number; actual: number }[]
  byProject: { projectId: string; name: string; color: string; planned: number; actual: number }[]
  estimateDrift: { taskId: string; title: string; estimate: number; logged: number; ratio: number }[]
  movedCount: number
}

export function backtrack(data: WeekData, today: string): BacktrackStats {
  const past = data.events.filter((e) => e.kind === "work" && isPast(e, today))
  const len = (e: CalendarEvent) => e.endMin - e.startMin
  const byTimeOfDay: BacktrackStats["byTimeOfDay"] = {
    morning: { planned: 0, actual: 0, skipped: 0, blocks: 0 },
    afternoon: { planned: 0, actual: 0, skipped: 0, blocks: 0 },
    evening: { planned: 0, actual: 0, skipped: 0, blocks: 0 },
  }
  const days = new Map<string, { planned: number; actual: number }>()
  const projects = new Map<string, { planned: number; actual: number }>()

  for (const e of past) {
    const b = byTimeOfDay[bucketOf(e.startMin)]
    b.planned += len(e)
    b.actual += e.actualMinutes
    b.blocks += 1
    if (e.status === "skipped") b.skipped += 1
    const d = days.get(e.date) ?? { planned: 0, actual: 0 }
    d.planned += len(e)
    d.actual += e.actualMinutes
    days.set(e.date, d)
    if (e.projectId) {
      const p = projects.get(e.projectId) ?? { planned: 0, actual: 0 }
      p.planned += len(e)
      p.actual += e.actualMinutes
      projects.set(e.projectId, p)
    }
  }

  const counts = {
    completed: past.filter((e) => e.status === "completed").length,
    partial: past.filter((e) => e.status === "partial").length,
    skipped: past.filter((e) => e.status === "skipped").length,
    total: past.length,
  }
  const plannedMinutes = past.reduce((s, e) => s + len(e), 0)
  const actualMinutes = past.reduce((s, e) => s + e.actualMinutes, 0)
  const dates = [...days.keys()].sort()

  const estimateDrift = data.tasks
    .map((t) => {
      const logged = taskLogged(t.id, data.logs)
      return { taskId: t.id, title: t.title, estimate: t.estimateMinutes, logged, ratio: logged / t.estimateMinutes }
    })
    .filter((t) => t.logged > 0)
    .sort((a, b) => b.ratio - a.ratio)

  return {
    windowStart: dates[0] ?? today,
    windowEnd: dates[dates.length - 1] ?? today,
    plannedMinutes,
    actualMinutes,
    completionRate: counts.total ? counts.completed / counts.total : 0,
    counts,
    byTimeOfDay,
    byDay: dates.map((date) => ({ date, ...days.get(date)! })),
    byProject: data.projects
      .filter((p) => projects.has(p.id))
      .map((p) => ({ projectId: p.id, name: p.name, color: p.color, ...projects.get(p.id)! })),
    estimateDrift,
    movedCount: data.events.filter((e) => e.movedFromDate != null).length,
  }
}
