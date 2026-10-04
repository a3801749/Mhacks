import type { AppliedWeek, AssignmentType, CalendarEvent, EventSeries, Priority, ScheduleChange, SeriesScope, Settings, WeekData } from "../types"

export interface EventPatch {
  projectId?: string | null
  taskId?: string | null
  kind?: CalendarEvent["kind"]
  status?: CalendarEvent["status"]
  date?: string
  startMin?: number
  endMin?: number
  movedFromDate?: string | null
  movedFromStartMin?: number | null
  title?: string
  location?: string
  meetingUrl?: string
  notes?: string
  isException?: boolean
}

export type NewSeries = Omit<EventSeries, "id" | "revision" | "stopBefore" | "excludedDates">

export interface ProjectPatch {
  name?: string
  course?: string
  type?: AssignmentType
  priority?: Priority
  notes?: string
  pinned?: boolean
  targetMinutes?: number
  assignedDate?: string
  dueDate?: string
  progressPercent?: number | null
  completedDate?: string | null
}

export interface NewProject {
  name: string
  course: string
  type: AssignmentType
  priority?: Priority
  notes?: string
  targetMinutes: number
  assignedDate: string
  dueDate: string
  firstTask: string
}

export interface LogPatch {
  minutes?: number
  note?: string
}

export interface Store {
  getWeek(today: string, through?: string): Promise<WeekData>
  /** Negative minutes take time back off; an event's actual time never drops below zero. */
  logTime(eventId: string, minutes: number, note: string): Promise<WeekData>
  updateLog(logId: string, patch: LogPatch): Promise<WeekData>
  deleteLog(logId: string): Promise<WeekData>
  reorderPins(projectIds: string[]): Promise<WeekData>
  updateEvent(eventId: string, patch: EventPatch): Promise<WeekData>
  deleteEvent(eventId: string): Promise<WeekData>
  createSeries(input: NewSeries, today: string, replaceEventId?: string): Promise<WeekData>
  editSeries(eventId: string, input: NewSeries, scope: Exclude<SeriesScope, "this">, today: string): Promise<WeekData>
  removeEvents(eventId: string, scope: SeriesScope, today: string): Promise<WeekData>
  setTaskDone(taskId: string, done: boolean): Promise<WeekData>
  updateProject(projectId: string, patch: ProjectPatch): Promise<WeekData>
  createProject(project: NewProject): Promise<WeekData>
  saveCheckIn(date: string, rating: number, note: string): Promise<WeekData>
  applyChanges(changes: ScheduleChange[]): Promise<AppliedWeek>
  updateSettings(settings: Settings): Promise<WeekData>
  reset(today: string): Promise<WeekData>
}

export const PROJECT_COLORS = ["#6F9E80", "#7C83D6", "#D99A4E", "#D9776A", "#5FA3B8", "#B07CC6", "#C9A227", "#4F9D9A"]
