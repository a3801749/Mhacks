import { addDays, toDateKey } from "./time"
import type { CalendarEvent, EventStatus, Project, Task, TimeLog, WeekData } from "./types"

const h = (hours: number, minutes = 0) => hours * 60 + minutes

export const SEED_PROJECTS: Omit<Project, "dueDate">[] = [
  { id: "p-thesis", name: "Thesis · Chapter 3", color: "#6F9E80", targetMinutes: h(12) },
  { id: "p-eecs", name: "EECS 281 · Project 4", color: "#7C83D6", targetMinutes: h(10) },
  { id: "p-portfolio", name: "Portfolio refresh", color: "#D99A4E", targetMinutes: h(6) },
  { id: "p-hack", name: "Hackathon prep", color: "#D9776A", targetMinutes: h(5) },
]

const DUE_IN_DAYS: Record<string, number> = {
  "p-thesis": 9,
  "p-eecs": 4,
  "p-portfolio": 14,
  "p-hack": 2,
}

export const SEED_TASKS: Task[] = [
  { id: "t-lit", projectId: "p-thesis", title: "Literature review notes", estimateMinutes: h(4), done: false },
  { id: "t-draft", projectId: "p-thesis", title: "Draft methods section", estimateMinutes: h(5), done: false },
  { id: "t-figs", projectId: "p-thesis", title: "Clean up figures", estimateMinutes: h(2), done: false },
  { id: "t-heap", projectId: "p-eecs", title: "Pairing heap implementation", estimateMinutes: h(4), done: false },
  { id: "t-tests", projectId: "p-eecs", title: "Write edge-case tests", estimateMinutes: h(2), done: false },
  { id: "t-perf", projectId: "p-eecs", title: "Profile & optimize", estimateMinutes: h(3), done: false },
  { id: "t-case", projectId: "p-portfolio", title: "Write case study copy", estimateMinutes: h(3), done: false },
  { id: "t-layout", projectId: "p-portfolio", title: "Rebuild project grid", estimateMinutes: h(2), done: false },
  { id: "t-pitch", projectId: "p-hack", title: "Pitch deck + demo script", estimateMinutes: h(2), done: false },
  { id: "t-proto", projectId: "p-hack", title: "Prototype voice flow", estimateMinutes: h(3), done: false },
]

type Outcome = "done" | "partial" | "skip" | "planned"

interface Template {
  offset: number
  start: number
  end: number
  taskId?: string
  title?: string
  kind?: "work" | "life"
  outcome: Outcome
  actual?: number
  note?: string
}

// The window is centered on "today": four days back for reflection, two days forward for planning.
// Patterns baked in for the analysis to find: mornings stick, late-evening blocks slip,
// and EECS work consistently runs over its estimates.
const TEMPLATES: Template[] = [
  { offset: -4, start: h(9), end: h(10, 30), taskId: "t-lit", outcome: "done", actual: 90, note: "Got through 6 papers" },
  { offset: -4, start: h(13), end: h(14, 30), taskId: "t-heap", outcome: "partial", actual: 60, note: "Merge logic is tricky" },
  { offset: -4, start: h(17, 30), end: h(18, 30), title: "Climbing gym", kind: "life", outcome: "done", actual: 60 },
  { offset: -4, start: h(21), end: h(22), taskId: "t-case", outcome: "skip", actual: 0 },

  { offset: -3, start: h(9, 30), end: h(11), taskId: "t-draft", outcome: "done", actual: 95, note: "Outline + first two subsections" },
  { offset: -3, start: h(14), end: h(16), taskId: "t-heap", outcome: "done", actual: 135, note: "Ran long but it compiles" },
  { offset: -3, start: h(20, 30), end: h(21, 30), taskId: "t-pitch", outcome: "partial", actual: 25 },

  { offset: -2, start: h(9), end: h(10), taskId: "t-lit", outcome: "done", actual: 60 },
  { offset: -2, start: h(11), end: h(12, 30), taskId: "t-tests", outcome: "done", actual: 105, note: "Found two bugs in pop()" },
  { offset: -2, start: h(15), end: h(16), title: "Office hours", kind: "life", outcome: "done", actual: 60 },
  { offset: -2, start: h(21), end: h(22, 30), taskId: "t-layout", outcome: "skip", actual: 0 },

  { offset: -1, start: h(10), end: h(11, 30), taskId: "t-draft", outcome: "partial", actual: 50, note: "Hard to focus today" },
  { offset: -1, start: h(13, 30), end: h(15), taskId: "t-perf", outcome: "done", actual: 110 },
  { offset: -1, start: h(18), end: h(19, 30), title: "Dinner with Sam", kind: "life", outcome: "done", actual: 90 },
  { offset: -1, start: h(21), end: h(22), taskId: "t-proto", outcome: "skip", actual: 0 },

  { offset: 0, start: h(9, 30), end: h(11), taskId: "t-draft", outcome: "done", actual: 90, note: "Methods section is taking shape" },
  { offset: 0, start: h(13), end: h(14, 30), taskId: "t-proto", outcome: "planned" },
  { offset: 0, start: h(16), end: h(17, 30), taskId: "t-perf", outcome: "planned" },
  { offset: 0, start: h(20), end: h(21), taskId: "t-case", outcome: "planned" },

  { offset: 1, start: h(10), end: h(12), taskId: "t-pitch", outcome: "planned" },
  { offset: 1, start: h(14), end: h(15, 30), taskId: "t-figs", outcome: "planned" },
  { offset: 1, start: h(17), end: h(18), title: "Climbing gym", kind: "life", outcome: "planned" },

  { offset: 2, start: h(9), end: h(10, 30), taskId: "t-lit", outcome: "planned" },
  { offset: 2, start: h(11), end: h(12), taskId: "t-tests", outcome: "planned" },
  { offset: 2, start: h(15), end: h(16, 30), taskId: "t-layout", outcome: "planned" },
]

const STATUS: Record<Outcome, EventStatus> = {
  done: "completed",
  partial: "partial",
  skip: "skipped",
  planned: "planned",
}

export function buildSeed(today = toDateKey(new Date())): Omit<WeekData, "source"> {
  const projects: Project[] = SEED_PROJECTS.map((p) => ({
    ...p,
    dueDate: addDays(today, DUE_IN_DAYS[p.id] ?? 7),
  }))
  const taskById = new Map(SEED_TASKS.map((t) => [t.id, t]))
  const events: CalendarEvent[] = []
  const logs: TimeLog[] = []

  TEMPLATES.forEach((tpl, i) => {
    const task = tpl.taskId ? taskById.get(tpl.taskId) : undefined
    const date = addDays(today, tpl.offset)
    const id = `e-${i + 1}`
    const actual = tpl.actual ?? 0
    events.push({
      id,
      projectId: task?.projectId ?? null,
      taskId: task?.id ?? null,
      title: task?.title ?? tpl.title ?? "Block",
      date,
      startMin: tpl.start,
      endMin: tpl.end,
      status: STATUS[tpl.outcome],
      actualMinutes: actual,
      kind: tpl.kind ?? "work",
      movedFromDate: null,
      movedFromStartMin: null,
    })
    if (task && actual > 0) {
      logs.push({
        id: `l-${i + 1}`,
        taskId: task.id,
        eventId: id,
        minutes: actual,
        note: tpl.note ?? "",
        createdAt: `${date}T${String(Math.floor(tpl.end / 60)).padStart(2, "0")}:${String(tpl.end % 60).padStart(2, "0")}:00`,
      })
    }
  })

  return {
    projects,
    tasks: SEED_TASKS.map((t) => ({ ...t })),
    events,
    logs,
    settings: { guidanceMode: "coach" },
  }
}
