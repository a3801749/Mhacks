import { buildSeed } from "../seed"
import { applyChanges } from "../schedule"
import { toDateKey } from "../time"
import type { WeekData } from "../types"
import { PROJECT_COLORS, type EventPatch, type Store } from "./types"

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
  async getWeek(today) {
    return snapshot(data(today))
  },

  async logTime(eventId, minutes, note) {
    const d = current()
    const event = d.events.find((e) => e.id === eventId)
    if (!event) throw new Error("Event not found")
    event.actualMinutes += minutes
    event.status = event.actualMinutes >= event.endMin - event.startMin ? "completed" : "partial"
    if (event.taskId) {
      d.logs.push({ id: uid("l"), taskId: event.taskId, eventId, minutes, note, createdAt: new Date().toISOString() })
    }
    return snapshot(d)
  },

  async updateEvent(eventId, patch: EventPatch) {
    const d = current()
    const event = d.events.find((e) => e.id === eventId)
    if (!event) throw new Error("Event not found")
    Object.assign(event, patch)
    return snapshot(d)
  },

  async setTaskDone(taskId, done) {
    const d = current()
    const task = d.tasks.find((t) => t.id === taskId)
    if (!task) throw new Error("Task not found")
    task.done = done
    return snapshot(d)
  },

  async updateProject(projectId, patch) {
    const d = current()
    const project = d.projects.find((p) => p.id === projectId)
    if (!project) throw new Error("Assignment not found")
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
    const d = current()
    d.checkIns = [...d.checkIns.filter((c) => c.date !== date), { date, rating, note }]
    return snapshot(d)
  },

  async applyChanges(changes) {
    const d = current()
    d.events = applyChanges(d.events, changes)
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
