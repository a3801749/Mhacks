import { backtrack, projectHealth, rhythmInsights, type BacktrackStats } from "../analytics"
import { findOpenSlot } from "../schedule"
import { addDays, formatClock, formatDuration, weekdayLong } from "../time"
import type { AdjustResponse, CalendarEvent, ChatTurn, Reflection, ScheduleChange, WeekData } from "../types"

// Deterministic stand-ins for Gemini so the full flow is demoable without an API key.

function bestBucket(stats: BacktrackStats) {
  const entries = Object.entries(stats.byTimeOfDay).filter(([, v]) => v.planned > 0)
  entries.sort((a, b) => b[1].actual / b[1].planned - a[1].actual / a[1].planned)
  return { best: entries[0], worst: entries[entries.length - 1] }
}

function speakTime(date: string, min: number, today: string) {
  const day = date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : weekdayLong(date)
  return `${formatClock(min).replace("am", " a.m.").replace("pm", " p.m.")} ${day}`
}

function upcomingWork(data: WeekData, now: { date: string; minute: number }) {
  return data.events
    .filter(
      (e) =>
        e.kind === "work" &&
        e.status === "planned" &&
        (e.date > now.date || (e.date === now.date && e.endMin > now.minute)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)
}

function windowDates(data: WeekData, from: string) {
  const last = data.events.reduce((m, e) => (e.date > m ? e.date : m), from)
  const dates: string[] = []
  for (let d = from; d <= addDays(last, 1); d = addDays(d, 1)) dates.push(d)
  return dates
}

function pickTarget(message: string, upcoming: CalendarEvent[], data: WeekData) {
  const lower = message.toLowerCase()
  for (const e of upcoming) {
    const project = data.projects.find((p) => p.id === e.projectId)
    const words = [...e.title.toLowerCase().split(/\W+/), ...(project?.name.toLowerCase().split(/\W+/) ?? [])]
    if (words.some((w) => w.length > 3 && lower.includes(w))) return e
  }
  return upcoming[0]
}

const AFFIRM = /\b(yes|yeah|yep|sure|ok|okay|fine|do it|anyway|please|go ahead)\b/i

export function mockAdjust(
  data: WeekData,
  message: string,
  history: ChatTurn[],
  now: { date: string; minute: number },
): AdjustResponse {
  const upcoming = upcomingWork(data, now)
  const target = pickTarget(message, upcoming, data)
  if (!target) {
    return {
      reply: "Your calendar is clear from here on out. Enjoy it — you've earned the breathing room.",
      changes: [],
      source: "mock",
    }
  }
  const lower = message.toLowerCase()
  const mode = data.settings.guidanceMode
  const length = target.endMin - target.startMin
  const loggedOnTask = target.taskId
    ? data.logs.filter((l) => l.taskId === target.taskId).reduce((s, l) => s + l.minutes, 0)
    : 0
  const momentum = loggedOnTask > 0 ? ` You've already put ${formatDuration(loggedOnTask)} into it, so it's not starting from zero.` : ""

  if (mode === "anchor") {
    const lastAgent = [...history].reverse().find((t) => t.role === "agent")
    const agreed = lastAgent && AFFIRM.test(message)
    if (!agreed) {
      return {
        reply: `I hear you. Before we move ${target.title}, could you give it just twenty-five minutes instead of ${formatDuration(length)}?${momentum} Say yes and I'll move the whole block, or try a short sprint.`,
        changes: [],
        source: "mock",
      }
    }
  }

  const minutesMatch = lower.match(/(\d+)\s*(min|minute)/)
  if (minutesMatch && /(only|just|short)/.test(lower)) {
    const mins = Math.max(15, Math.min(length, Number(minutesMatch[1])))
    const change: ScheduleChange = {
      action: "shorten",
      eventId: target.id,
      startMin: target.startMin,
      endMin: target.startMin + mins,
      reason: `Trimmed to ${mins} minutes so it still happens.`,
    }
    return {
      reply: `Deal. ${target.title} is now a ${mins}-minute sprint. Small reps still count.`,
      changes: [change],
      source: "mock",
    }
  }

  if (/\b(skip|cancel|drop)\b/.test(lower)) {
    return {
      reply: `Okay, ${target.title} is off the table for now. I'll keep an eye on the deadline for you.`,
      changes: [{ action: "skip", eventId: target.id, reason: "You asked to drop it." }],
      source: "mock",
    }
  }

  const stats = backtrack(data, now.date)
  const { best } = bestBucket(stats)
  const preferTomorrow = /tomorrow|morning/.test(lower) || best?.[0] === "morning"
  const startDate = preferTomorrow ? addDays(now.date, 1) : now.date
  const earliest = { date: startDate, minute: startDate === now.date ? now.minute + 60 : 0 }
  const dates = windowDates(data, now.date)
  const isSameSlot = (s: { date: string; startMin: number } | null) =>
    s != null && s.date === target.date && s.startMin === target.startMin
  let slot =
    findOpenSlot(data.events, dates, length, earliest, target.id) ??
    findOpenSlot(data.events, dates, length, { date: now.date, minute: now.minute + 30 }, target.id)
  if (isSameSlot(slot)) {
    slot = findOpenSlot(data.events, dates, length, { date: target.date, minute: target.endMin }, target.id)
  }

  if (!slot) {
    return {
      reply: `Your next couple of days are packed, so there's nowhere clean to put ${target.title}. Want me to shorten it instead?`,
      changes: [],
      source: "mock",
    }
  }

  const change: ScheduleChange = {
    action: "move",
    eventId: target.id,
    date: slot.date,
    startMin: slot.startMin,
    endMin: slot.startMin + length,
    reason: best ? `You follow through most in the ${best[0]}.` : "Next open slot.",
  }
  const when = speakTime(slot.date, slot.startMin, now.date)
  const opener = /pizza|food|dinner|eat/.test(lower) ? "Pizza is a valid life choice." : "No stress."
  const reply =
    mode === "autopilot"
      ? `${opener} I moved ${target.title} to ${when}.${momentum}`
      : `${opener} How about ${target.title} at ${when}? That's when you tend to actually get things done.${momentum}`
  return { reply, changes: [change], source: "mock" }
}

export function mockReflect(data: WeekData, today: string): Reflection {
  const stats = backtrack(data, today)
  const { best, worst } = bestBucket(stats)
  const health = projectHealth(data, today)
  const hours = formatDuration(stats.actualMinutes)
  const followThrough = stats.plannedMinutes ? Math.round((stats.actualMinutes / stats.plannedMinutes) * 100) : 0

  const habits = [] as Reflection["habits"]
  if (best) {
    const pct = Math.round((best[1].actual / best[1].planned) * 100)
    habits.push({
      title: `${capitalize(best[0])}s are your power hours`,
      detail: `You delivered ${pct}% of the time you planned for ${best[0]} blocks.`,
    })
  }
  if (worst && worst !== best && worst[1].skipped > 0) {
    habits.push({
      title: `${capitalize(worst[0])} blocks tend to slip`,
      detail: `${worst[1].skipped} of ${worst[1].blocks} ${worst[0]} blocks were skipped — that's a pattern, not a character flaw.`,
    })
  }
  const rhythmWarning = rhythmInsights(data, today, 28).find((i) => i.tone === "warning")
  if (rhythmWarning) habits.push({ title: rhythmWarning.title, detail: rhythmWarning.detail })
  const over = stats.estimateDrift.find((t) => t.logged > t.estimate * 0.6 && t.ratio > 0.6)
  const overrun = data.events.filter(
    (e) => e.kind === "work" && e.actualMinutes > e.endMin - e.startMin,
  )
  if (overrun.length > 0) {
    const extraByProject = new Map<string, number>()
    let extra = 0
    for (const e of overrun) {
      const over = e.actualMinutes - (e.endMin - e.startMin)
      extra += over
      if (e.projectId) extraByProject.set(e.projectId, (extraByProject.get(e.projectId) ?? 0) + over)
    }
    const topId = [...extraByProject.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    habits.push({
      title: "Some work runs long",
      detail: `${overrun.length} block${overrun.length > 1 ? "s" : ""} ran ${formatDuration(extra)} over — mostly ${data.projects.find((p) => p.id === topId)?.name ?? "deep work"}.`,
    })
  } else if (over) {
    habits.push({ title: "Estimates are close", detail: `${over.title} is at ${Math.round(over.ratio * 100)}% of its estimate.` })
  }

  const suggestions: Reflection["suggestions"] = []
  const dates = windowDates(data, today)
  const eveningBlock = upcomingWork(data, { date: today, minute: 0 }).find((e) => e.startMin >= 17 * 60)
  if (eveningBlock && best?.[0] !== "evening") {
    const slot = findOpenSlot(data.events, dates, eveningBlock.endMin - eveningBlock.startMin, { date: addDays(eveningBlock.date, 1), minute: 0 }, eveningBlock.id)
    if (slot) {
      suggestions.push({
        title: `Move "${eveningBlock.title}" out of the evening`,
        detail: `Try ${weekdayLong(slot.date)} at ${formatClock(slot.startMin)}, closer to the hours you actually use.`,
        change: {
          action: "move",
          eventId: eveningBlock.id,
          date: slot.date,
          startMin: slot.startMin,
          endMin: slot.startMin + (eveningBlock.endMin - eveningBlock.startMin),
          reason: "Evening blocks slip; mornings stick.",
        },
      })
    }
  }
  const behind = health
    .filter((h) => h.remaining > h.scheduledAhead && h.daysLeft > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0]
  if (behind) {
    const gap = Math.min(90, Math.ceil((behind.remaining - behind.scheduledAhead) / 15) * 15)
    const task = data.tasks.find((t) => t.projectId === behind.project.id && !t.done)
    const slot = findOpenSlot(data.events, dates, gap, { date: addDays(today, 1), minute: 0 })
    if (slot && task) {
      suggestions.push({
        title: `Add a catch-up block for ${behind.project.name}`,
        detail: `It's due in ${behind.daysLeft} day${behind.daysLeft === 1 ? "" : "s"} with ${formatDuration(behind.remaining - behind.scheduledAhead)} not yet on the calendar.`,
        change: {
          action: "create",
          title: task.title,
          taskId: task.id,
          projectId: behind.project.id,
          date: slot.date,
          startMin: slot.startMin,
          endMin: slot.startMin + gap,
          reason: "Closes the gap before the deadline.",
        },
      })
    }
  }
  if (overrun.length > 0) {
    suggestions.push({
      title: "Pad your estimates by 25%",
      detail: "Blocks that overrun push everything after them. A little slack makes the plan feel kinder.",
    })
  }

  return {
    headline: `You showed up for ${hours} of real work this stretch.`,
    summary: `You planned ${formatDuration(stats.plannedMinutes)} of focused work and did ${hours} (${followThrough}%). ${stats.counts.completed} blocks landed fully, ${stats.counts.partial} partly, and ${stats.counts.skipped} didn't happen.`,
    habits,
    suggestions,
    questions: [
      best ? `What made your ${best[0]} sessions work — and can you protect that?` : "When did focus come easiest this week?",
      worst && worst[1].skipped > 0
        ? `When ${worst[0] === "evening" || worst[0] === "afternoon" ? "an" : "a"} ${worst[0]} block slipped, what were you doing instead? Was it worth it?`
        : "Which block felt the most rewarding to finish?",
      `What would make next week feel lighter, not just more productive?`,
    ],
    source: "mock",
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}