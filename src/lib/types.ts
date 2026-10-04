export type GuidanceMode = "anchor" | "coach" | "autopilot"

export type EventStatus = "planned" | "completed" | "partial" | "skipped"

export type EventKind = "work" | "life"

export type AssignmentType = "project" | "exam" | "homework" | "reading" | "misc"

/** How the work is graded, which decides how much care it deserves. */
export type Priority = "accuracy" | "completion" | "flexible" | "optional"

export interface Project {
  id: string
  name: string
  color: string
  course: string
  type: AssignmentType
  priority: Priority
  notes: string
  pinned: boolean
  /** How many times this has ever been pinned; the planner learns from it. */
  pinCount: number
  /** Position in the user's pinned list; lower comes first. */
  pinOrder: number
  targetMinutes: number
  assignedDate: string
  dueDate: string
  /** Self-reported completion, 0–100. Null until the user first reports it. */
  progressPercent: number | null
  /** Set once an assignment is finished; finished ones feed the estimate model. */
  completedDate: string | null
}

/** A course the user added on its own; assignments also name courses by text. */
export interface Course {
  name: string
  color: string
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
  location: string
  meetingUrl: string
  notes: string
  seriesId: string | null
  /** Original recurrence date, unchanged when an occurrence is moved. */
  occurrenceDate: string | null
  isException: boolean
}

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "yearly"
  interval: number
  /** Sunday = 0; used by weekly rules. */
  weekdays: number[]
  monthlyMode: "date" | "weekday"
  /** Used by monthly weekday rules; -1 means the last weekday. */
  ordinal: number
  end: { type: "never" } | { type: "until"; date: string } | { type: "count"; count: number }
}

/** Personal events repeat independently of assignments and time logs. */
export interface EventSeries {
  id: string
  /** Internal optimistic version; also changes when one occurrence is edited. */
  revision?: number
  title: string
  location: string
  meetingUrl: string
  notes: string
  startDate: string
  startMin: number
  endMin: number
  rule: RecurrenceRule
  stopBefore: string | null
  excludedDates: string[]
}

export type SeriesScope = "this" | "following" | "all"

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
  checkInEnabled: boolean
  aiPlannerEnabled: boolean
  todayInsightsEnabled: boolean
  analyticsPatternsEnabled: boolean
  screenTimeEnabled: boolean
}

export interface CheckIn {
  date: string
  /** 1–10, how the day felt overall. */
  rating: number
  note: string
}

export interface WeekData {
  projects: Project[]
  courses: Course[]
  tasks: Task[]
  events: CalendarEvent[]
  series: EventSeries[]
  logs: TimeLog[]
  checkIns: CheckIn[]
  settings: Settings
  source: "neon" | "memory"
}

/** Exact provenance for reversing blocks added by one scheduling operation. */
export interface AppliedWeek extends WeekData {
  createdEventIds: string[]
  previousEvents: CalendarEvent[]
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
  /** Defaults to "work" when a task is attached, "life" otherwise. */
  kind?: EventKind
  location?: string
  meetingUrl?: string
  notes?: string
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

export interface PlanSegment {
  taskId: string
  startMin: number
  endMin: number
  why: string
}

export interface PlanBreakdown {
  summary: string
  segments: PlanSegment[]
  source: "gemini" | "mock"
}
