import { ASSIGNMENT_TYPES } from "../brand"
import { attentionWeight, pinPreferences, projectHealth, taskLogged } from "../analytics"
import { formatDuration } from "../time"
import type { PlanBreakdown, PlanSegment, WeekData } from "../types"

export interface PlanBlock {
  date: string
  startMin: number
  endMin: number
}

export function freeIntervals(data: WeekData, block: PlanBlock) {
  const busy = data.events
    .filter((e) => e.date === block.date && e.status !== "skipped" && e.endMin > block.startMin && e.startMin < block.endMin)
    .sort((a, b) => a.startMin - b.startMin)
  const free: { start: number; end: number }[] = []
  let cursor = block.startMin
  for (const b of busy) {
    if (b.startMin > cursor) free.push({ start: cursor, end: b.startMin })
    cursor = Math.max(cursor, b.endMin)
  }
  if (cursor < block.endMin) free.push({ start: cursor, end: block.endMin })
  return { free, busy }
}

export function planCandidates(data: WeekData, today: string) {
  const health = projectHealth(data, today)
  const prefs = pinPreferences(data)
  return data.tasks
    .filter((t) => !t.done)
    .flatMap((t) => {
      const h = health.find((x) => x.project.id === t.projectId)
      if (!h || h.pace === "done") return []
      const taskRemaining = Math.max(15, t.estimateMinutes - taskLogged(t.id, data.logs))
      return [
        {
          taskId: t.id,
          title: t.title,
          projectId: t.projectId,
          project: h.project.name,
          course: h.project.course,
          type: h.project.type,
          priority: h.project.priority,
          pinned: h.project.pinned,
          dueDate: h.project.dueDate,
          daysLeft: h.daysLeft,
          remainingMinutes: Math.min(taskRemaining, h.remaining || taskRemaining),
          urgency: ((h.remaining - h.scheduledAhead + 60) / (h.daysLeft + 1)) * attentionWeight(h.project, prefs),
        },
      ]
    })
    .sort((a, b) => b.urgency - a.urgency)
}

export function recentMood(data: WeekData, today: string) {
  if (!data.settings.checkInEnabled) return []
  return data.checkIns
    .filter((c) => c.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
}

const LIGHT = new Set(["reading", "homework"])

export function mockBreakdown(data: WeekData, block: PlanBlock, today: string): PlanBreakdown {
  const { free } = freeIntervals(data, block)
  const candidates = planCandidates(data, today).filter((c) => c.remainingMinutes >= 25)
  if (candidates.length === 0) {
    return { summary: "Nothing is waiting on you right now. Maybe keep this one as free time?", segments: [], source: "mock" }
  }
  const moods = recentMood(data, today)
  const avgMood = moods.length ? moods.reduce((s, c) => s + c.rating, 0) / moods.length : 7
  const tired = avgMood <= 5
  const late = block.startMin >= 21 * 60
  const maxChunk = tired || late ? 45 : 90

  const remaining = new Map(candidates.map((c) => [c.taskId, c.remainingMinutes]))
  const heavy = candidates.filter((c) => !LIGHT.has(c.type))
  const light = candidates.filter((c) => LIGHT.has(c.type))
  const order = tired || late ? [...light, ...heavy] : [...heavy.slice(0, 2), ...light.slice(0, 1), ...heavy.slice(2), ...light.slice(1)]

  const segments: PlanSegment[] = []
  let idx = 0
  for (const slot of free) {
    let cursor = slot.start
    while (slot.end - cursor >= 25 && idx < order.length * 3) {
      const c = order[idx % order.length]
      idx++
      const left = remaining.get(c.taskId) ?? 0
      if (left < 15) continue
      const len = Math.min(maxChunk, slot.end - cursor, Math.ceil(left / 5) * 5)
      if (len < 25) continue
      remaining.set(c.taskId, left - len)
      const why =
        c.pinned && c.daysLeft > 2
          ? `You pinned this — ${formatDuration(c.remainingMinutes)} left.`
          : c.daysLeft <= 2
          ? `Due in ${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"} — gets it moving.`
          : LIGHT.has(c.type)
            ? `A lighter ${ASSIGNMENT_TYPES[c.type].toLowerCase()} to change gears.`
            : `${formatDuration(c.remainingMinutes)} left on ${c.project}.`
      segments.push({ taskId: c.taskId, startMin: cursor, endMin: cursor + len, why })
      cursor += len + (len > 45 ? 15 : 10)
    }
  }

  const summary = tired
    ? `You've been running low lately, so I kept the chunks short and started with something lighter.`
    : late
      ? `It's a late block, so I kept things short — future you will want to sleep.`
      : `Hardest, most urgent work first while you're fresh, with a lighter task to break it up.`
  return { summary, segments, source: "mock" }
}

export function sanitizeSegments(segments: PlanSegment[], data: WeekData, block: PlanBlock): PlanSegment[] {
  const { busy } = freeIntervals(data, block)
  const tasks = new Set(data.tasks.filter((t) => !t.done).map((t) => t.id))
  const out: PlanSegment[] = []
  for (const s of [...segments].sort((a, b) => a.startMin - b.startMin)) {
    const start = Math.max(block.startMin, Math.round(s.startMin / 5) * 5)
    const end = Math.min(block.endMin, Math.round(s.endMin / 5) * 5)
    if (!tasks.has(s.taskId) || end - start < 15) continue
    if (busy.some((b) => b.startMin < end && b.endMin > start)) continue
    if (out.some((o) => o.startMin < end && o.endMin > start)) continue
    out.push({ ...s, startMin: start, endMin: end })
  }
  return out
}
