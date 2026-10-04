import { buildSeed } from "../seed"
import { applyChanges, statusForActual } from "../schedule"
import { addDays, toDateKey, validDate } from "../time"
import type { WeekData } from "../types"
import { PROJECT_COLORS, type EventPatch, type Store } from "./types"
import { RequestError } from "../errors"
import { changeSeries, materializeSeries, removeOccurrences } from "../recurrence"

type Data = Omit<WeekData, "source">

const globalForStore = globalThis as unknown as { __calendarMemory?: Data }

function data(today: string): Data {
  if (!globalForStore.__calendarMemory) globalForStore.__calendarMemory = buildSeed(today)
  return globalForStore.__calendarMemory
}

function snapshot(d: Data): WeekData {
  return structuredClone({ ...d, source: "memory" as const })
}

function current(): Data {
  return data(toDateKey(new Date()))
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const memoryStore: Store = {
  async getWeek(today, through) {
    const d = data(today)
    d.series ??= []
    d.courses ??= []
    d.events = materializeSeries(d.events, d.series, through ?? addDays(today, 366))
    return snapshot(d)
  },

  async logTime(eventId, minutes, note) {
    const d = current()
    const event = d.events.find((e) => e.id === eventId)
    if (!event) throw new Error("Event not found")
    if (event.kind !== "work") throw new RequestError("Focused time can only be logged on focus blocks")
    const before = event.actualMinutes
    event.actualMinutes = Math.max(0, before + minutes)
    event.status = statusForActual(event.actualMinutes, event.endMin - event.startMin)
    const applied = event.actualMinutes - before
    if (event.taskId && applied !== 0) {
      d.logs.push({ id: uid("l"), taskId: event.taskId, eventId, minutes: applied, note, createdAt: new Date().toISOString() })
    }
    return snapshot(d)
  },

  async updateLog(logId, patch) {
    const d = current()
    const log = d.logs.find((l) => l.id === logId)
    if (!log) throw new Error("Log entry not found")
    if (patch.minutes != null && patch.minutes !== log.minutes) {
      const event = d.events.find((e) => e.id === log.eventId)
      if (event) {
        const before = event.actualMinutes
        if (before + patch.minutes - log.minutes < 0) throw new RequestError("This edit would make the block's logged time negative. Adjust its removal entries first.", 409)
        event.actualMinutes = Math.max(0, before + patch.minutes - log.minutes)
        event.status = statusForActual(event.actualMinutes, event.endMin - event.startMin)
      }
      log.minutes = patch.minutes
    }
    if (patch.note != null) log.note = patch.note
    return snapshot(d)
  },

  async deleteLog(logId) {
    const d = current()
    const log = d.logs.find((l) => l.id === logId)
    if (!log) throw new Error("Log entry not found")
    const event = d.events.find((e) => e.id === log.eventId)
    if (event) {
      if (event.actualMinutes - log.minutes < 0) throw new RequestError("Deleting this entry would make the block's logged time negative. Adjust its removal entries first.", 409)
      event.actualMinutes = Math.max(0, event.actualMinutes - log.minutes)
      event.status = statusForActual(event.actualMinutes, event.endMin - event.startMin)
    }
    d.logs = d.logs.filter((l) => l.id !== logId)
    return snapshot(d)
  },

  async reorderPins(projectIds) {
    const d = current()
    projectIds.forEach((id, i) => {
      const p = d.projects.find((x) => x.id === id)
      if (p) p.pinOrder = i
    })
    return snapshot(d)
  },

  async updateEvent(eventId, patch: EventPatch) {
    const d = current()
    const event = d.events.find((e) => e.id === eventId)
    if (!event) throw new Error("Event not found")
    if ((patch.taskId !== undefined && patch.taskId !== event.taskId || patch.projectId !== undefined && patch.projectId !== event.projectId || patch.kind && patch.kind !== event.kind) &&
      (event.actualMinutes > 0 || d.logs.some((l) => l.eventId === eventId))) throw new RequestError("This block has recorded work. Keep its assignment and type.", 409)
    if ((patch.endMin ?? event.endMin) <= (patch.startMin ?? event.startMin)) throw new RequestError("End time must be after the start")
    Object.assign(event, patch)
    if (event.seriesId) {
      if (patch.isException === undefined) event.isException = true
      const series = d.series.find((s) => s.id === event.seriesId)
      if (series) series.revision = (series.revision ?? 0) + 1
    }
    // Logged time normally decides status. Skip and an explicit "done" are the overrides; resizing still derives.
    if (patch.status !== "completed" && event.actualMinutes > 0 && (patch.status !== undefined || patch.startMin !== undefined || patch.endMin !== undefined) && event.status !== "skipped") {
      event.status = statusForActual(event.actualMinutes, event.endMin - event.startMin)
    }
    return snapshot(d)
  },

  async createSeries(input, today, replaceEventId) {
    const d = current()
    if (replaceEventId) {
      const event = d.events.find((e) => e.id === replaceEventId)
      if (!event || event.seriesId || event.kind !== "life" || event.status !== "planned" || event.actualMinutes > 0 || d.logs.some((l) => l.eventId === replaceEventId)) {
        throw new RequestError("Only an unworked personal event can be converted into a repeating series")
      }
      d.events = d.events.filter((e) => e.id !== replaceEventId)
    }
    d.series.push({ ...input, id: uid("series"), stopBefore: null, excludedDates: [] })
    d.events = materializeSeries(d.events, d.series, addDays(today, 366))
    return snapshot(d)
  },

  async editSeries(eventId, input, scope, today) {
    const d = current()
    Object.assign(d, changeSeries(snapshot(d), eventId, input, scope, uid("series"), today))
    return snapshot(d)
  },

  async removeEvents(eventId, scope) {
    const d = current()
    Object.assign(d, removeOccurrences(snapshot(d), eventId, scope))
    return snapshot(d)
  },

  async setTaskDone(taskId, done) {
    const d = current()
    const task = d.tasks.find((t) => t.id === taskId)
    if (!task) throw new Error("Task not found")
    task.done = done
    return snapshot(d)
  },

  async deleteEvent(eventId) {
    const d = current()
    const event = d.events.find((e) => e.id === eventId)
    if (!event) return snapshot(d)
    if (event.actualMinutes > 0 || event.status === "completed" || d.logs.some((l) => l.eventId === eventId)) {
      throw new RequestError("This block has recorded work and cannot be removed by Undo.", 409)
    }
    d.events = d.events.filter((e) => e.id !== eventId)
    return snapshot(d)
  },

  async updateProject(projectId, patch) {
    const d = current()
    const project = d.projects.find((p) => p.id === projectId)
    if (!project) throw new Error("Assignment not found")
    if (patch.pinned && !project.pinned) {
      project.pinCount += 1
      project.pinOrder = Math.max(-1, ...d.projects.filter((p) => p.pinned).map((p) => p.pinOrder)) + 1
    }
    Object.assign(project, patch)
    return snapshot(d)
  },

  async createProject(input) {
    const d = current()
    const id = uid("p")
    d.projects.push({
      id,
      name: input.name,
      color: PROJECT_COLORS[d.projects.length % PROJECT_COLORS.length],
      course: input.course,
      type: input.type,
      priority: input.priority ?? "completion",
      notes: input.notes ?? "",
      pinned: false,
      pinCount: 0,
      pinOrder: 0,
      targetMinutes: input.targetMinutes,
      assignedDate: input.assignedDate,
      dueDate: input.dueDate,
      progressPercent: null,
      completedDate: null,
    })
    d.tasks.push({ id: uid("t"), projectId: id, title: input.firstTask, estimateMinutes: input.targetMinutes, done: false })
    return snapshot(d)
  },

  async saveCheckIn(date, rating, note) {
    if (!validDate(date)) throw new RequestError("Invalid date")
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) throw new RequestError("Rating must be 1–10")
    const d = current()
    d.checkIns = [...d.checkIns.filter((c) => c.date !== date), { date, rating, note }]
    return snapshot(d)
  },

  async applyChanges(changes) {
    const d = current()
    const ids = new Set(d.events.map((e) => e.id))
    const changedIds = new Set(changes.map((c) => c.eventId))
    const previousEvents = d.events.filter((e) => changedIds.has(e.id)).map((e) => ({ ...e }))
    const previousJson = new Map(d.events.map((e) => [e.id, JSON.stringify(e)]))
    d.events = applyChanges(d.events, changes)
    for (const seriesId of new Set(d.events.filter((e) => e.seriesId && previousJson.get(e.id) !== JSON.stringify(e)).map((e) => e.seriesId!))) {
      const series = d.series.find((s) => s.id === seriesId)
      if (series) series.revision = (series.revision ?? 0) + 1
    }
    return { ...snapshot(d), createdEventIds: d.events.filter((e) => !ids.has(e.id)).map((e) => e.id), previousEvents }
  },

  async saveCourse(name, color) {
    const d = current()
    d.courses ??= []
    const existing = d.courses.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (existing) existing.color = color
    else d.courses.push({ name, color })
    return snapshot(d)
  },

  async deleteCourse(name) {
    const d = current()
    d.courses = (d.courses ?? []).filter((c) => c.name.toLowerCase() !== name.toLowerCase())
    return snapshot(d)
  },

  async updateSettings(settings) {
    const d = current()
    d.settings = settings
    return snapshot(d)
  },

  async reset(today) {
    globalForStore.__calendarMemory = buildSeed(today)
    return snapshot(globalForStore.__calendarMemory)
  },
}
