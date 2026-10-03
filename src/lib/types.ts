export type GuidanceMode = "anchor" | "coach" | "autopilot"

export type EventStatus = "planned" | "completed" | "partial" | "skipped"

export type EventKind = "work" | "life"

export interface Project {
  id: string
  name: string
  color: string
  targetMinutes: number
  dueDate: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  estimateMinutes: number
  done: boolean
}

export interface CalendarEvent {
  id: string
  projectId: string | null
  taskId: string | null
  title: string
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  /** Minutes from local midnight. */
  startMin: number
  endMin: number
  status: EventStatus
  actualMinutes: number
  kind: EventKind
  movedFromDate: string | null
  movedFromStartMin: number | null
}

export interface TimeLog {
  id: string
  taskId: string
  eventId: string | null
  minutes: number
  note: string
  createdAt: string
}

export interface Settings {
  guidanceMode: GuidanceMode
}

export interface WeekData {
  projects: Project[]
  tasks: Task[]
  events: CalendarEvent[]
  logs: TimeLog[]
  settings: Settings
  source: "neon" | "memory"
}

export type ChangeAction = "move" | "shorten" | "skip" | "create"

export interface ScheduleChange {
  action: ChangeAction
  eventId?: string
  date?: string
  startMin?: number
  endMin?: number
  title?: string
  taskId?: string | null
  projectId?: string | null
  reason: string
}

export interface AdjustResponse {
  reply: string
  changes: ScheduleChange[]
  source: "gemini" | "mock"
}

export interface ChatTurn {
  role: "user" | "agent"
  text: string
}

export interface ReflectionInsight {
  title: string
  detail: string
}

export interface ReflectionSuggestion extends ReflectionInsight {
  change?: ScheduleChange
}

export interface Reflection {
  headline: string
  summary: string
  habits: ReflectionInsight[]
  suggestions: ReflectionSuggestion[]
  questions: string[]
  source: "gemini" | "mock"
}

export interface Integrations {
  gemini: boolean
  elevenlabs: boolean
  neon: boolean
}
