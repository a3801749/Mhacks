import type { CalendarEvent, ScheduleChange, Settings, WeekData } from "../types"

export interface EventPatch {
  status?: CalendarEvent["status"]
  date?: string
  startMin?: number
  endMin?: number
}

export interface Store {
  getWeek(today: string): Promise<WeekData>
  logTime(eventId: string, minutes: number, note: string): Promise<WeekData>
  updateEvent(eventId: string, patch: EventPatch): Promise<WeekData>
  setTaskDone(taskId: string, done: boolean): Promise<WeekData>
  applyChanges(changes: ScheduleChange[]): Promise<WeekData>
  updateSettings(settings: Settings): Promise<WeekData>
  reset(today: string): Promise<WeekData>
}
