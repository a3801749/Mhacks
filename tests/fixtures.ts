import type { CalendarEvent, Project, WeekData } from "../src/lib/types"

export const today = "2026-10-03"

export function project(patch: Partial<Project> = {}): Project {
  return {
    id: "p", name: "Assignment", course: "EECS", type: "project", priority: "accuracy",
    color: "#123456", notes: "", pinned: false, pinCount: 0, pinOrder: 0,
    targetMinutes: 180, assignedDate: today, dueDate: "2026-10-05",
    progressPercent: null, completedDate: null, ...patch,
  }
}

export function event(patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e", title: "Work", projectId: "p", taskId: "t", date: today,
    startMin: 600, endMin: 660, actualMinutes: 0, status: "planned", kind: "work",
    movedFromDate: null, movedFromStartMin: null,
        location: "", meetingUrl: "", notes: "", seriesId: null, occurrenceDate: null, isException: false, ...patch,
  }
}

export function week(patch: Partial<WeekData> = {}): WeekData {
  return {
    source: "memory", projects: [project()], courses: [],
    tasks: [{ id: "t", projectId: "p", title: "Work", estimateMinutes: 180, done: false }],
    events: [], series: [], logs: [], checkIns: [],
    settings: { guidanceMode: "coach", checkInEnabled: true, aiPlannerEnabled: true, todayInsightsEnabled: true, analyticsPatternsEnabled: true, screenTimeEnabled: false },
    ...patch,
  }
}
