import "server-only"
import { activeProjects, backtrack, categoryStats, categoryLabel, projectHealth, rhythmInsights, taskLogged } from "../analytics"
import type { AdjustResponse, ChatTurn, PlanBreakdown, PlanSegment, Reflection, ScheduleChange, WeekData } from "../types"
import { mockAdjust, mockReflect } from "./fallback"
import { generateJson, geminiEnabled } from "./gemini"
import { mockBreakdown, planCandidates, recentMood, freeIntervals, sanitizeSegments, type PlanBlock } from "./planner"
import {
  ADJUST_RESPONSE_SCHEMA,
  PLAN_RESPONSE_SCHEMA,
  PLAN_SYSTEM_PROMPT,
  REFLECT_RESPONSE_SCHEMA,
  REFLECT_SYSTEM_PROMPT,
  adjustSystemPrompt,
} from "./prompts"

export interface Now {
  date: string
  minute: number
}

function context(data: WeekData, today: string) {
  const active = new Set(activeProjects(data).map((p) => p.id))
  return {
    projects: projectHealth(data, today).map((h) => ({
      id: h.project.id,
      name: h.project.name,
      dueDate: h.project.dueDate,
      daysLeft: h.daysLeft,
      course: h.project.course,
      type: h.project.type,
      progressPercent: h.project.progressPercent,
      remainingMinutes: h.remaining,
      estimateBasis: h.estimate.explanation,
      scheduledAheadMinutes: h.scheduledAhead,
    })),
    tasks: data.tasks.filter((t) => active.has(t.projectId)).map((t) => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      estimateMinutes: t.estimateMinutes,
      loggedMinutes: taskLogged(t.id, data.logs),
      done: t.done,
    })),
    stats: backtrack(data, today),
    categoryHistory: categoryStats(data)
      .filter((c) => c.course)
      .map((c) => ({ category: categoryLabel(c), plannedVsActual: Number(c.multiplier.toFixed(2)), samples: c.samples })),
  }
}

/** Drops hallucinated ids, edits to the past, and out-of-range times. */
function sanitize(changes: ScheduleChange[], data: WeekData, now: Now): ScheduleChange[] {
  return changes.filter((c) => {
    const inRange = (m?: number) => m == null || (m >= 0 && m <= 24 * 60)
    if (!inRange(c.startMin) || !inRange(c.endMin)) return false
    if (c.date && c.date < now.date) return false
    if (c.action === "create") return Boolean(c.date && c.startMin != null && c.endMin != null)
    const e = data.events.find((x) => x.id === c.eventId)
    if (!e || e.status !== "planned") return false
    if (c.action === "move" && (c.date ?? e.date) === e.date && (c.startMin ?? e.startMin) === e.startMin) return false
    return e.date > now.date || (e.date === now.date && e.endMin > now.minute)
  })
}

export async function adjustSchedule(
  data: WeekData,
  message: string,
  history: ChatTurn[],
  now: Now,
): Promise<AdjustResponse> {
  if (geminiEnabled()) {
    try {
      const out = await generateJson<{ reply: string; changes: ScheduleChange[] }>(
        adjustSystemPrompt(data.settings.guidanceMode),
        {
          now,
          guidanceMode: data.settings.guidanceMode,
          schedule: data.events.filter((e) => e.date >= now.date || e.status === "planned"),
          ...context(data, now.date),
          conversation: history.slice(-8),
          message,
        },
        ADJUST_RESPONSE_SCHEMA,
      )
      return { reply: out.reply, changes: sanitize(out.changes ?? [], data, now), source: "gemini" }
    } catch (err) {
      console.error("[gemini] adjust failed, using fallback:", err)
    }
  }
  return mockAdjust(data, message, history, now)
}

export async function reflect(data: WeekData, today: string): Promise<Reflection> {
  if (geminiEnabled()) {
    try {
      const ctx = context(data, today)
      const out = await generateJson<Omit<Reflection, "source">>(
        REFLECT_SYSTEM_PROMPT,
        {
          today,
          guidanceMode: data.settings.guidanceMode,
          stats: ctx.stats,
          projects: ctx.projects,
          tasks: ctx.tasks,
          upcoming: data.events.filter((e) => e.status === "planned" && e.date >= today),
          categoryHistory: ctx.categoryHistory,
          monthRhythm: rhythmInsights(data, today, 28),
          recentCheckIns: data.settings.checkInEnabled ? recentMood(data, today) : [],
        },
        REFLECT_RESPONSE_SCHEMA,
      )
      const now = { date: today, minute: 0 }
      return {
        ...out,
        suggestions: (out.suggestions ?? []).map((s) => ({
          ...s,
          change: s.change && sanitize([s.change], data, now).length ? s.change : undefined,
        })),
        source: "gemini",
      }
    } catch (err) {
      console.error("[gemini] reflect failed, using fallback:", err)
    }
  }
  return mockReflect(data, today)
}

export async function planBlock(data: WeekData, block: PlanBlock, today: string): Promise<PlanBreakdown> {
  if (geminiEnabled()) {
    try {
      const { busy } = freeIntervals(data, block)
      const out = await generateJson<{ summary: string; segments: PlanSegment[] }>(
        PLAN_SYSTEM_PROMPT,
        {
          block,
          busy: busy.map((b) => ({ title: b.title, startMin: b.startMin, endMin: b.endMin })),
          candidates: planCandidates(data, today).slice(0, 8),
          recentMood: data.settings.checkInEnabled ? recentMood(data, today) : [],
          rhythm: rhythmInsights(data, today, 28),
        },
        PLAN_RESPONSE_SCHEMA,
      )
      const segments = sanitizeSegments(out.segments ?? [], data, block)
      if (segments.length > 0) return { summary: out.summary, segments, source: "gemini" }
    } catch (err) {
      console.error("[gemini] plan failed, using fallback:", err)
    }
  }
  return mockBreakdown(data, block, today)
}
