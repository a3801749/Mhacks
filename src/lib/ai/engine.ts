import "server-only"
import {
  activeProjects,
  backtrack,
  categoryLabel,
  categoryStats,
  pinPreferenceLabel,
  pinPreferences,
  projectHealth,
  rhythmInsights,
  taskLogged,
} from "../analytics"
import type { AdjustResponse, ChatTurn, PlanBreakdown, PlanSegment, Reflection, ScheduleChange, WeekData } from "../types"
import { sanitizeScheduleChanges } from "../schedule-validation"
import { mockAdjust, mockReflect, parseScheduleRequest, scheduleClarification } from "./fallback"
import { adjustmentChanges, adjustmentReply } from "./adjustment"
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
      priority: h.project.priority,
      pinned: h.project.pinned,
      notes: h.project.notes.slice(0, 280),
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
    usuallyPins: pinPreferenceLabel(pinPreferences(data)),
  }
}

export async function adjustSchedule(
  data: WeekData,
  message: string,
  history: ChatTurn[],
  now: Now,
): Promise<AdjustResponse> {
  const clarification = scheduleClarification(message, history, now.date)
  if (clarification) return { reply: clarification, changes: [], source: "mock" }
  const request = parseScheduleRequest(message, history, now.date)
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
      const changes = adjustmentChanges(out.changes, data, request, now)
      return { reply: adjustmentReply({ reply: out.reply, changes }, data, now, { discarded: out.changes?.length > 0 }), changes, source: "gemini" }
    } catch (err) {
      console.error("[gemini] adjust failed, using fallback:", err)
    }
  }
  const fallback = mockAdjust(data, message, history, now)
  const changes = adjustmentChanges(fallback.changes, data, request, now)
  return { ...fallback, reply: adjustmentReply({ ...fallback, changes }, data, now, { discarded: fallback.changes.length > 0 }), changes }
}

export async function reflect(data: WeekData, today: string, minute = 0): Promise<Reflection> {
  const now = { date: today, minute }
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
          usuallyPins: ctx.usuallyPins,
          monthRhythm: rhythmInsights(data, today, 28),
          recentCheckIns: data.settings.checkInEnabled ? recentMood(data, today) : [],
        },
        REFLECT_RESPONSE_SCHEMA,
      )
      return {
        ...out,
        suggestions: (out.suggestions ?? []).map((s) => ({
          ...s,
          change: s.change && sanitizeScheduleChanges([s.change], data, now)[0],
        })),
        source: "gemini",
      }
    } catch (err) {
      console.error("[gemini] reflect failed, using fallback:", err)
    }
  }
  const fallback = mockReflect(data, today)
  return { ...fallback, suggestions: fallback.suggestions.map((s) => ({
    ...s, change: s.change && sanitizeScheduleChanges([s.change], data, now)[0],
  })) }
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
          usuallyPins: pinPreferenceLabel(pinPreferences(data)),
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
