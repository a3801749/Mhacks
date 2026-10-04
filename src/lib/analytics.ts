import { ASSIGNMENT_TYPES, PRIORITIES } from "./brand"
import { courseKey, courseList } from "./courses"
import { addDays, daysBetween, formatClock, formatDuration } from "./time"
import type { CalendarEvent, Project, Task, TimeLog, WeekData } from "./types"

export const WINDOW_BACK = 3
export const WINDOW_AHEAD = 3

export function windowDates(today: string) {
  const dates: string[] = []
  for (let i = -WINDOW_BACK; i <= WINDOW_AHEAD; i++) dates.push(addDays(today, i))
  return dates
}

export function isPast(e: CalendarEvent, today: string) {
  return e.date < today || e.status !== "planned"
}

export function activeProjects(data: WeekData) {
  return data.projects.filter((p) => !p.completedDate)
}

export function taskLogged(taskId: string, logs: TimeLog[]) {
  return logs.filter((l) => l.taskId === taskId).reduce((sum, l) => sum + l.minutes, 0)
}

export function projectLogged(projectId: string, tasks: Task[], logs: TimeLog[], events: CalendarEvent[] = []) {
  const ids = new Set(tasks.filter((t) => t.projectId === projectId).map((t) => t.id))
  const taskMinutes = logs.filter((l) => ids.has(l.taskId)).reduce((sum, l) => sum + l.minutes, 0)
  // Task-less focus blocks store their signed-log total on the event itself.
  const assignmentMinutes = events.filter((e) => e.projectId === projectId && e.kind === "work" && !e.taskId)
    .reduce((sum, e) => sum + e.actualMinutes, 0)
  return taskMinutes + assignmentMinutes
}

export function projectStartedDate(projectId: string, data: WeekData): string | null {
  const dates = data.events
    .filter((e) => e.projectId === projectId && e.actualMinutes > 0)
    .map((e) => e.date)
    .sort()
  return dates[0] ?? null
}

export function projectScheduledAhead(projectId: string, events: CalendarEvent[], today: string, dueDate: string) {
  return events
    .filter((e) => e.projectId === projectId && e.kind === "work" && e.status === "planned" && e.date >= today && e.date <= dueDate)
    .reduce((sum, e) => sum + (e.endMin - e.startMin), 0)
}

/* ------------------------------------------------------------------ */
/* Estimate model: learns how long each course/type actually takes.    */
/* ------------------------------------------------------------------ */

export interface CategoryStat {
  key: string
  course: string | null
  type: Project["type"] | null
  planned: number
  actual: number
  multiplier: number
  samples: number
}

export function categoryStats(data: WeekData): CategoryStat[] {
  const done = data.projects.filter((p) => p.completedDate)
  const groups = new Map<string, CategoryStat>()
  const add = (key: string, course: string | null, type: Project["type"] | null, p: Project, actual: number) => {
    const g = groups.get(key) ?? { key, course, type, planned: 0, actual: 0, multiplier: 1, samples: 0 }
    g.planned += p.targetMinutes
    g.actual += actual
    g.samples += 1
    g.multiplier = g.actual / g.planned
    groups.set(key, g)
  }
  for (const p of done) {
    // Finished without logging anything says nothing about how long the work takes.
    const actual = projectLogged(p.id, data.tasks, data.logs, data.events)
    if (actual <= 0) continue
    add(`${p.course}|${p.type}`, p.course, p.type, p, actual)
    add(`*|${p.type}`, null, p.type, p, actual)
  }
  return [...groups.values()]
}

export function categoryLabel(c: Pick<CategoryStat, "course" | "type">) {
  const type = c.type ? ASSIGNMENT_TYPES[c.type].toLowerCase() : "work"
  return c.course ? `${c.course} ${type}s` : `${type}s`
}

export interface Estimate {
  remaining: number
  total: number
  basis: "pace" | "category" | "target"
  explanation: string
  /** True when the inputs contradict each other (lots of time logged, progress still 0%). */
  uncertain?: boolean
}

export function estimateProject(project: Project, data: WeekData, stats = categoryStats(data)): Estimate {
  const logged = projectLogged(project.id, data.tasks, data.logs, data.events)
  const p = project.progressPercent
  const category =
    stats.find((s) => s.key === `${project.course}|${project.type}`) ?? stats.find((s) => s.key === `*|${project.type}`)

  if (p === 0 && logged >= 120) {
    return {
      remaining: Math.max(0, project.targetMinutes - logged),
      total: Math.max(project.targetMinutes, logged),
      basis: "target",
      explanation: `Can't give an accurate estimate yet: ${formatDuration(logged)} logged but progress is still at 0%.`,
      uncertain: true,
    }
  }
  if (p != null && p > 0 && logged > 0) {
    const pace = (logged * (100 - p)) / p
    // Early progress reports are noisy, so lean on history until you're further along.
    const weight = Math.min(1, p / 50)
    const categoryRemaining = category ? Math.max(0, project.targetMinutes * category.multiplier - logged) : pace
    const remaining = Math.round((weight * pace + (1 - weight) * categoryRemaining) / 5) * 5
    return {
      remaining,
      total: logged + remaining,
      basis: "pace",
      explanation: `${p}% done after ${formatDuration(logged)} — at that pace about ${formatDuration(remaining)} to go.`,
    }
  }
  if (category && category.samples > 0 && category.multiplier > 0) {
    const total = Math.round((project.targetMinutes * category.multiplier) / 5) * 5
    const pct = Math.round((category.multiplier - 1) * 100)
    return {
      remaining: Math.max(0, total - logged),
      total,
      basis: "category",
      explanation:
        Math.abs(pct) < 8
          ? `Your ${categoryLabel(category)} usually land right on estimate.`
          : `Your ${categoryLabel(category)} usually take ${Math.abs(pct)}% ${pct > 0 ? "longer" : "less"} than planned.`,
    }
  }
  return {
    remaining: Math.max(0, project.targetMinutes - logged),
    total: project.targetMinutes,
    basis: "target",
    explanation: "Based on your original estimate. Report progress after a block to sharpen it.",
  }
}

/** Reported progress, or the logged-vs-estimate share shown until the user reports one. */
export function displayedPercent(project: Project, data: WeekData, estimate = estimateProject(project, data)) {
  if (project.completedDate) return 100
  if (project.progressPercent != null) return project.progressPercent
  const logged = projectLogged(project.id, data.tasks, data.logs, data.events)
  return Math.min(100, Math.round((logged / Math.max(1, estimate.total)) * 100))
}

export type Pace = "ahead" | "on-track" | "behind" | "done"

export interface ProjectHealth {
  project: Project
  logged: number
  remaining: number
  estimate: Estimate
  scheduledAhead: number
  daysLeft: number
  percent: number
  pace: Pace
}

export function projectHealth(data: WeekData, today: string): ProjectHealth[] {
  const stats = categoryStats(data)
  return activeProjects(data).map((project) => {
    const logged = projectLogged(project.id, data.tasks, data.logs, data.events)
    const estimate = estimateProject(project, data, stats)
    const remaining = estimate.remaining
    const scheduledAhead = projectScheduledAhead(project.id, data.events, today, project.dueDate)
    const daysLeft = Math.max(0, daysBetween(today, project.dueDate))
    const percent = displayedPercent(project, data, estimate)
    let pace: Pace = "on-track"
    if (!estimate.uncertain && (remaining === 0 || percent >= 100)) pace = "done"
    else if (!estimate.uncertain && scheduledAhead >= remaining) pace = "ahead"
    else if (daysLeft <= 4 && (estimate.uncertain || scheduledAhead < remaining * 0.6)) pace = "behind"
    return { project, logged, remaining, estimate, scheduledAhead, daysLeft, percent, pace }
  })
}

/* ------------------------------------------------------------------ */
/* Pins: what the user keeps reaching for.                             */
/* ------------------------------------------------------------------ */

export interface PinPreference {
  course: string | null
  type: Project["type"] | null
  /** Share of all pins that went to this course / type, 0–1. */
  courseShare: number
  typeShare: number
  totalPins: number
}

/** Needs a few pins before it's worth acting on; otherwise every first pin would look like a habit. */
export function pinPreferences(data: WeekData): PinPreference | null {
  const total = data.projects.reduce((s, p) => s + p.pinCount, 0)
  if (total < 3) return null
  const top = <K extends string>(key: (p: Project) => K) => {
    const counts = new Map<K, number>()
    for (const p of data.projects) counts.set(key(p), (counts.get(key(p)) ?? 0) + p.pinCount)
    const [k, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    return { k, share: n / total }
  }
  const course = top((p) => p.course)
  const type = top((p) => p.type)
  return {
    course: course.share >= 0.35 ? course.k : null,
    type: type.share >= 0.35 ? type.k : null,
    courseShare: course.share,
    typeShare: type.share,
    totalPins: total,
  }
}

/** Planner weight: grading stakes, explicit pins, and the categories the user habitually pins. */
export function attentionWeight(p: Project, prefs = null as PinPreference | null) {
  let w: number = PRIORITIES[p.priority].weight
  if (p.pinned) w *= 1.3
  if (prefs?.course === p.course) w *= 1.1
  if (prefs?.type === p.type) w *= 1.1
  return w
}

export function pinPreferenceLabel(prefs: PinPreference | null) {
  if (!prefs || (!prefs.course && !prefs.type)) return null
  const parts = [prefs.course, prefs.type ? `${ASSIGNMENT_TYPES[prefs.type].toLowerCase()}s` : null].filter(Boolean)
  return parts.join(" ")
}

/* ------------------------------------------------------------------ */
/* Day load for the calendar heatmap.                                  */
/* ------------------------------------------------------------------ */

export type Busyness = "free" | "light" | "medium" | "heavy"

export interface DayLoad {
  date: string
  scheduledMinutes: number
  due: Project[]
  score: number
  level: Busyness
}

const DUE_WEIGHT: Record<Project["priority"], number> = { accuracy: 120, completion: 60, flexible: 40, optional: 20 }

/** Booked time plus a penalty for each deadline, so a free day with an exam due still reads as busy. */
export function dayLoad(data: WeekData, date: string): DayLoad {
  const scheduledMinutes = data.events
    .filter((e) => e.date === date && e.status !== "skipped")
    .reduce((s, e) => s + (e.endMin - e.startMin), 0)
  const due = activeProjects(data).filter((p) => p.dueDate === date)
  const score = scheduledMinutes + due.reduce((s, p) => s + DUE_WEIGHT[p.priority] * (p.type === "exam" ? 1.5 : 1), 0)
  const level: Busyness = score === 0 ? "free" : score < 300 ? "light" : score < 420 ? "medium" : "heavy"
  return { date, scheduledMinutes, due, score, level }
}

/* ------------------------------------------------------------------ */
/* Backtracking over the visible window.                               */
/* ------------------------------------------------------------------ */

type Bucket = "morning" | "afternoon" | "evening"

function bucketOf(startMin: number): Bucket {
  if (startMin >= 4 * 60 && startMin < 12 * 60) return "morning"
  if (startMin >= 12 * 60 && startMin < 17 * 60) return "afternoon"
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
  const from = addDays(today, -WINDOW_BACK)
  const past = data.events.filter((e) => e.kind === "work" && e.date >= from && e.date <= today && isPast(e, today))
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
  const active = new Set(activeProjects(data).map((p) => p.id))

  const estimateDrift = data.tasks
    .filter((t) => active.has(t.projectId))
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

/* ------------------------------------------------------------------ */
/* Rhythm: when in the day you actually work, screen-time style.       */
/* ------------------------------------------------------------------ */

export type RhythmGroupBy = "project" | "course" | "type"

export interface Session {
  date: string
  start: number
  end: number
  projectId: string | null
  minutes: number
}

/** Actual worked time, positioned from the block's start. */
export function sessions(data: WeekData, from: string, to: string): Session[] {
  return data.events
    .filter((e) => e.kind === "work" && e.actualMinutes > 0 && e.date >= from && e.date <= to)
    .map((e) => ({
      date: e.date,
      start: e.startMin,
      end: Math.min(1440, e.startMin + e.actualMinutes),
      projectId: e.projectId,
      minutes: e.actualMinutes,
    }))
}

export const TYPE_COLORS: Record<Project["type"], string> = {
  project: "#7C83D6",
  exam: "#B07CC6",
  homework: "#5FA3B8",
  reading: "#D99A4E",
  misc: "#A8A29E",
}

export function groupKey(projectId: string | null, data: WeekData, by: RhythmGroupBy) {
  const p = data.projects.find((x) => x.id === projectId)
  if (!p) return { key: "other", label: "Other", color: "#A8A29E" }
  if (by === "project") return { key: p.id, label: p.name, color: p.color }
  if (by === "course") {
    const course = courseList(data).find((c) => courseKey(c.name) === courseKey(p.course))
    return { key: courseKey(p.course), label: course?.name ?? p.course, color: course?.color ?? p.color }
  }
  return { key: p.type, label: ASSIGNMENT_TYPES[p.type], color: TYPE_COLORS[p.type] }
}

export interface RhythmBin {
  /** Start of the half-hour slot, minutes from midnight. */
  slot: number
  total: number
  parts: { key: string; minutes: number }[]
}

export function rhythmBins(list: Session[], data: WeekData, by: RhythmGroupBy) {
  const bins: RhythmBin[] = Array.from({ length: 48 }, (_, i) => ({ slot: i * 30, total: 0, parts: [] }))
  const legend = new Map<string, { key: string; label: string; color: string; minutes: number }>()
  for (const s of list) {
    const g = groupKey(s.projectId, data, by)
    const entry = legend.get(g.key) ?? { ...g, minutes: 0 }
    // Match the bars, which stop at midnight.
    entry.minutes += s.end - s.start
    legend.set(g.key, entry)
    for (let t = s.start; t < s.end; ) {
      const slot = Math.floor(t / 30)
      const slotEnd = (slot + 1) * 30
      const mins = Math.min(s.end, slotEnd) - t
      const bin = bins[slot]
      bin.total += mins
      const part = bin.parts.find((p) => p.key === g.key)
      if (part) part.minutes += mins
      else bin.parts.push({ key: g.key, minutes: mins })
      t += mins
    }
  }
  return { bins, legend: [...legend.values()].sort((a, b) => b.minutes - a.minutes) }
}

/** When work wraps up each day; sessions before 4am count toward the previous night. */
export function windDownByDay(list: Session[]) {
  const byNight = new Map<string, number>()
  for (const s of list) {
    const night = s.start < 240 ? addDays(s.date, -1) : s.date
    const end = s.start < 240 ? s.end + 1440 : s.end
    byNight.set(night, Math.max(byNight.get(night) ?? 0, end))
  }
  return [...byNight.entries()].map(([date, end]) => ({ date, end })).sort((a, b) => a.date.localeCompare(b.date))
}

export function formatWindDown(min: number) {
  return formatClock(min % 1440)
}

export interface RhythmInsight {
  title: string
  detail: string
  tone: "neutral" | "warning" | "positive"
}

export function rhythmInsights(data: WeekData, today: string, days: number): RhythmInsight[] {
  const from = addDays(today, -days + 1)
  const list = sessions(data, from, today)
  const insights: RhythmInsight[] = []
  if (list.length === 0) return insights

  const late = list.filter((s) => s.start >= 22 * 60 || s.start < 240)
  const lateMinutes = late.reduce((s, x) => s + x.minutes, 0)
  const total = list.reduce((s, x) => s + x.minutes, 0)
  if (lateMinutes > 0) {
    const byProject = new Map<string, number>()
    for (const s of late) byProject.set(s.projectId ?? "", (byProject.get(s.projectId ?? "") ?? 0) + s.minutes)
    const [topId, topMin] = [...byProject.entries()].sort((a, b) => b[1] - a[1])[0]
    const name = data.projects.find((p) => p.id === topId)?.course ?? "Misc"
    insights.push({
      title: `${name} owns your late nights`,
      detail: `${formatDuration(lateMinutes)} of work happened after 10pm (${Math.round((lateMinutes / total) * 100)}% of the total) — ${Math.round((topMin / lateMinutes) * 100)}% of it on ${name}.`,
      tone: lateMinutes / total > 0.2 ? "warning" : "neutral",
    })
  }

  // Today's night isn't over yet, so its wind-down would read as artificially early.
  const wind = windDownByDay(list).filter((w) => w.date < today)
  if (wind.length >= 6) {
    const half = Math.floor(wind.length / 2)
    const avg = (xs: { end: number }[]) => xs.reduce((s, x) => s + x.end, 0) / xs.length
    const early = avg(wind.slice(0, half))
    const recent = avg(wind.slice(half))
    const delta = Math.round(recent - early)
    if (Math.abs(delta) >= 30) {
      insights.push({
        title: delta > 0 ? "You're wrapping up later and later" : "You're wrapping up earlier",
        detail: `Your last session used to end around ${formatWindDown(Math.round(early))}; lately it's closer to ${formatWindDown(Math.round(recent))}.`,
        tone: delta > 0 ? "warning" : "positive",
      })
    }
  }

  const byHour = new Array(24).fill(0)
  for (const s of list) for (let t = s.start; t < s.end; t += 15) byHour[Math.floor(t / 60) % 24] += Math.min(15, s.end - t)
  const peak = byHour.indexOf(Math.max(...byHour))
  insights.push({
    title: `Peak focus: ${formatClock(peak * 60)}–${formatClock((peak + 1) * 60)}`,
    detail: `That hour holds more of your work than any other across the last ${days} days.`,
    tone: "positive",
  })

  const mood = moodCorrelation(data, from, today)
  if (mood) insights.push(mood)

  for (const c of categoryStats(data).filter((s) => s.course && s.samples > 0)) {
    const pct = Math.round((c.multiplier - 1) * 100)
    if (Math.abs(pct) >= 20) {
      insights.push({
        title: `${categoryLabel(c)} run ${pct > 0 ? "long" : "short"}`,
        detail: `They've taken ${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} time than planned, so new estimates are adjusted.`,
        tone: "neutral",
      })
    }
  }
  return insights
}

/** Links the optional 1–10 daily check-in to how the day (and night before) went. */
export function moodCorrelation(data: WeekData, from: string, to: string): RhythmInsight | null {
  if (!data.settings.checkInEnabled) return null
  const checks = data.checkIns.filter((c) => c.date >= from && c.date <= to)
  if (checks.length < 5) return null
  const lateBefore = (date: string) =>
    data.events.some(
      (e) =>
        e.kind === "work" &&
        e.actualMinutes > 0 &&
        ((e.date === addDays(date, -1) && e.startMin + e.actualMinutes >= 23 * 60) ||
          (e.date === date && e.startMin < 240)),
    )
  const withLate = checks.filter((c) => lateBefore(c.date))
  const without = checks.filter((c) => !lateBefore(c.date))
  if (withLate.length < 2 || without.length < 2) return null
  const avg = (xs: { rating: number }[]) => xs.reduce((s, x) => s + x.rating, 0) / xs.length
  const a = avg(withLate)
  const b = avg(without)
  if (b - a < 0.8) return null
  return {
    title: "Late nights cost you the next day",
    detail: `After working past 11pm you rate your day ${a.toFixed(1)}/10 on average, versus ${b.toFixed(1)} otherwise.`,
    tone: "warning",
  }
}
