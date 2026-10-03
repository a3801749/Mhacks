import { buildSeed } from "../seed"
import { applyChanges } from "../schedule"
import { toDateKey } from "../time"
import type { WeekData } from "../types"
import type { EventPatch, Store } from "./types"

type Data = Omit<WeekData, "source">

const globalForStore = globalThis as unknown as { __ebbMemory?: Data }

function data(today: string): Data {
  if (!globalForStore.__ebbMemory) globalForStore.__ebbMemory = buildSeed(today)
  return globalForStore.__ebbMemory
}

function snapshot(d: Data): WeekData {
  return structuredClone({ ...d, source: "memory" as const })
}

function current(): Data {
  return data(toDateKey(new Date()))
}

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
      d.logs.push({
        id: `l-${Date.now().toString(36)}`,
        taskId: event.taskId,
        eventId,
        minutes,
        note,
        createdAt: new Date().toISOString(),
      })
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
    globalForStore.__ebbMemory = buildSeed(today)
    return snapshot(globalForStore.__ebbMemory)
  },
}
