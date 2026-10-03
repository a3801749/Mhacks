import { addDays, toDateKey } from "./time"
import type { CalendarEvent, CheckIn, EventStatus, Project, Task, TimeLog, WeekData } from "./types"

const h = (hours: number, minutes = 0) => hours * 60 + minutes

type ProjectSeed = Omit<Project, "assignedDate" | "dueDate" | "completedDate"> & {
  assigned: number
  due: number
  completed?: number
}

const PROJECTS: ProjectSeed[] = [
  { id: "p-thesis", name: "Thesis · Chapter 3", color: "#6F9E80", course: "Thesis", type: "writing", targetMinutes: h(12), assigned: -12, due: 9, progressPercent: 60 },
  { id: "p-eecs", name: "EECS 281 · Project 4", color: "#7C83D6", course: "EECS 281", type: "project", targetMinutes: h(10), assigned: -8, due: 4, progressPercent: 55 },
  { id: "p-portfolio", name: "Portfolio refresh", color: "#D99A4E", course: "Personal", type: "project", targetMinutes: h(6), assigned: -6, due: 14, progressPercent: null },
  { id: "p-hack", name: "Hackathon prep", color: "#D9776A", course: "MHacks", type: "project", targetMinutes: h(5), assigned: -3, due: 2, progressPercent: 20 },
  { id: "p-si", name: "SI 206 · Reading 5", color: "#5FA3B8", course: "SI 206", type: "reading", targetMinutes: h(2), assigned: -2, due: 3, progressPercent: null },

  { id: "p-ch2", name: "Thesis · Chapter 2", color: "#8DB59A", course: "Thesis", type: "writing", targetMinutes: h(12), assigned: -40, due: -13, completed: -14, progressPercent: 100 },
  { id: "p-eecs3", name: "EECS 281 · Project 3", color: "#9EA3E0", course: "EECS 281", type: "project", targetMinutes: h(10), assigned: -35, due: -15, completed: -16, progressPercent: 100 },
  { id: "p-hw6", name: "EECS 281 · Homework 6", color: "#A9ACD9", course: "EECS 281", type: "homework", targetMinutes: h(3), assigned: -30, due: -22, completed: -23, progressPercent: 100 },
  { id: "p-hw7", name: "EECS 281 · Homework 7", color: "#A9ACD9", course: "EECS 281", type: "homework", targetMinutes: h(3), assigned: -22, due: -14, completed: -15, progressPercent: 100 },
  { id: "p-read4", name: "SI 206 · Reading 4", color: "#86BCCB", course: "SI 206", type: "reading", targetMinutes: h(2), assigned: -25, due: -19, completed: -20, progressPercent: 100 },
]

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
  { id: "t-read5", projectId: "p-si", title: "Read ch. 9–10 + notes", estimateMinutes: h(2), done: false },

  { id: "t-ch2", projectId: "p-ch2", title: "Write Chapter 2", estimateMinutes: h(12), done: true },
  { id: "t-eecs3", projectId: "p-eecs3", title: "Hash table project", estimateMinutes: h(10), done: true },
  { id: "t-hw6", projectId: "p-hw6", title: "Homework 6 problems", estimateMinutes: h(3), done: true },
  { id: "t-hw7", projectId: "p-hw7", title: "Homework 7 problems", estimateMinutes: h(3), done: true },
  { id: "t-read4", projectId: "p-read4", title: "Read ch. 7–8 + notes", estimateMinutes: h(2), done: true },
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

// The visible window: four days back for reflection, two days forward for planning.
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
  { offset: -2, start: h(23), end: h(23, 59), taskId: "t-draft", outcome: "done", actual: 59, note: "Couldn't sleep, wrote anyway" },

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

interface HistoryPlan {
  taskId: string
  from: number
  to: number
  sessions: number
  totalMinutes: number
  /** Base start time; "drift" moves later across the month, which is the late-night pattern. */
  start: number | "drift"
}

const HISTORY: HistoryPlan[] = [
  { taskId: "t-ch2", from: -28, to: -14, sessions: 9, totalMinutes: 930, start: "drift" },
  { taskId: "t-eecs3", from: -27, to: -16, sessions: 8, totalMinutes: 840, start: h(14) },
  { taskId: "t-hw6", from: -27, to: -23, sessions: 2, totalMinutes: 170, start: h(16, 30) },
  { taskId: "t-hw7", from: -20, to: -15, sessions: 2, totalMinutes: 190, start: h(19) },
  { taskId: "t-read4", from: -24, to: -20, sessions: 2, totalMinutes: 90, start: h(9, 30) },
  { taskId: "t-lit", from: -12, to: -5, sessions: 3, totalMinutes: 210, start: "drift" },
  { taskId: "t-heap", from: -8, to: -5, sessions: 2, totalMinutes: 120, start: h(13, 30) },
]

const STATUS: Record<Outcome, EventStatus> = {
  done: "completed",
  partial: "partial",
  skip: "skipped",
  planned: "planned",
}

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const clock = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`

export function buildSeed(today = toDateKey(new Date())): Omit<WeekData, "source"> {
  const projects: Project[] = PROJECTS.map(({ assigned, due, completed, ...p }) => ({
    ...p,
    assignedDate: addDays(today, assigned),
    dueDate: addDays(today, due),
    completedDate: completed == null ? null : addDays(today, completed),
  }))
  const taskById = new Map(SEED_TASKS.map((t) => [t.id, t]))
  const events: CalendarEvent[] = []
  const logs: TimeLog[] = []
  let n = 0

  const push = (
    task: Task | undefined,
    tpl: { date: string; start: number; end: number; status: EventStatus; actual: number; title?: string; kind?: "work" | "life"; note?: string },
  ) => {
    const id = `e-${++n}`
    events.push({
      id,
      projectId: task?.projectId ?? null,
      taskId: task?.id ?? null,
      title: task?.title ?? tpl.title ?? "Block",
      date: tpl.date,
      startMin: tpl.start,
      endMin: tpl.end,
      status: tpl.status,
      actualMinutes: tpl.actual,
      kind: tpl.kind ?? "work",
      movedFromDate: null,
      movedFromStartMin: null,
    })
    if (task && tpl.actual > 0) {
      logs.push({
        id: `l-${n}`,
        taskId: task.id,
        eventId: id,
        minutes: tpl.actual,
        note: tpl.note ?? "",
        createdAt: `${tpl.date}T${clock(Math.min(tpl.start + tpl.actual, 1439))}:00`,
      })
    }
  }

  const rand = rng(42)
  for (const plan of HISTORY) {
    const task = taskById.get(plan.taskId)!
    for (let i = 0; i < plan.sessions; i++) {
      const offset = plan.from + Math.round((i * (plan.to - plan.from)) / Math.max(1, plan.sessions - 1))
      const jitter = Math.round((rand() - 0.5) * 4) * 15
      const len = Math.round(plan.totalMinutes / plan.sessions / 5) * 5 + jitter
      let start: number
      if (plan.start === "drift") {
        const progress = (offset + 28) / 23
        start = h(20, 30) + Math.round((progress * 210) / 15) * 15
      } else {
        start = plan.start + jitter
      }
      let date = addDays(today, offset)
      if (start >= 1440) {
        date = addDays(date, 1)
        start -= 1440
      }
      const end = start + len
      if (end > 1440) {
        push(task, { date, start, end: 1440, status: "completed", actual: 1440 - start })
        push(task, { date: addDays(date, 1), start: 0, end: end - 1440, status: "completed", actual: end - 1440 })
      } else {
        push(task, { date, start, end, status: "completed", actual: len })
      }
    }
  }

  for (const tpl of TEMPLATES) {
    const task = tpl.taskId ? taskById.get(tpl.taskId) : undefined
    push(task, {
      date: addDays(today, tpl.offset),
      start: tpl.start,
      end: tpl.end,
      status: STATUS[tpl.outcome],
      actual: tpl.actual ?? 0,
      title: tpl.title,
      kind: tpl.kind,
      note: tpl.note,
    })
  }

  const checkIns: CheckIn[] = []
  const NOTES: Record<number, string> = {
    [-1]: "Tired. Dinner with Sam was the best part.",
    [-2]: "Good morning, rough night.",
    [-9]: "Stayed up way too late on Chapter 2.",
    [-16]: "Shipped Project 3!",
  }
  for (let offset = -28; offset <= -1; offset++) {
    const date = addDays(today, offset)
    const prev = addDays(date, -1)
    const lateNight = events.some(
      (e) =>
        e.kind === "work" &&
        e.actualMinutes > 0 &&
        ((e.date === prev && e.endMin >= h(23)) || (e.date === date && e.startMin < h(4))),
    )
    const morning = events.some((e) => e.date === date && e.kind === "work" && e.actualMinutes > 0 && e.startMin < h(12))
    const base = 7 + (morning ? 1 : 0) - (lateNight ? 3 : 0) + Math.round((rand() - 0.5) * 2)
    if (rand() < 0.15 && !NOTES[offset]) continue
    checkIns.push({ date, rating: Math.max(1, Math.min(10, base)), note: NOTES[offset] ?? "" })
  }

  return {
    projects,
    tasks: SEED_TASKS.map((t) => ({ ...t })),
    events,
    logs,
    checkIns,
    settings: { guidanceMode: "coach", checkInEnabled: true, aiPlannerEnabled: true, screenTimeEnabled: false },
  }
}
