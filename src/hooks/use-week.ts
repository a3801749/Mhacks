"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { addDays, formatDuration, nowMinutes, toDateKey } from "@/lib/time"
import type { EventPatch, NewSeries, NewProject, ProjectPatch } from "@/lib/store/types"
import type { AppliedWeek, Integrations, ScheduleChange, Settings, SeriesScope, WeekData } from "@/lib/types"

export type LoadedWeek = WeekData & { integrations?: Integrations }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

export function useClock() {
  const [now, setNow] = useState<{ date: string; minute: number } | null>(null)
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setNow({ date: toDateKey(d), minute: nowMinutes(d) })
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function useWeek(today: string | null) {
  const [data, setData] = useState<LoadedWeek | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<Integrations | null>(null)
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve())
  const revision = useRef(0)
  const loadedThrough = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!today) return
    setError(null)
    const version = revision.current
    try {
      const week = await request<LoadedWeek>(`/api/week?today=${today}`)
      if (version !== revision.current) return
      setData(week)
      loadedThrough.current = addDays(today, 366)
      if (week.integrations) setIntegrations(week.integrations)
    } catch (err) {
      if (version === revision.current) setError(err instanceof Error ? err.message : "Couldn't load your calendar")
    }
  }, [today])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount / day change
    load()
  }, [load])

  const mutate = useCallback(<T extends WeekData,>(fn: () => Promise<T>, success?: string): Promise<T | null> => {
    revision.current += 1
    const operation = mutationQueue.current.then(async () => {
      try {
        const next = await fn()
        // Also invalidate reads that started while this write was in flight.
        revision.current += 1
        setData((prev) => ({ ...next, integrations: prev?.integrations }))
        if (success) toast.success(success)
        return next
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That didn't save")
        return null
      }
    })
    mutationQueue.current = operation
    return operation
  }, [])

  const ensureThrough = useCallback(async (through: string) => {
    if (!today || through <= (loadedThrough.current ?? addDays(today, 366))) return
    const version = revision.current
    try {
      const next = await request<LoadedWeek>(`/api/week?today=${today}&through=${through}`)
      if (version === revision.current) {
        setData(next)
        loadedThrough.current = through
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't load that month") }
  }, [today])

  const json = (body: unknown) => JSON.stringify(body)

  const optimisticProjects = async (
    change: (projects: WeekData["projects"]) => WeekData["projects"],
    fn: () => Promise<WeekData>,
  ) => {
    let before: WeekData["projects"] | null = null
    setData((prev) => {
      if (!prev) return prev
      before = prev.projects
      return { ...prev, projects: change(prev.projects) }
    })
    const result = await mutate(fn)
    const restore = before
    if (!result && restore) setData((prev) => (prev ? { ...prev, projects: restore } : prev))
    return result
  }

  return {
    data,
    error,
    integrations,
    reload: load,
    ensureThrough,
    replace: (next: WeekData) => {
      revision.current += 1
      setData((prev) => ({ ...next, integrations: prev?.integrations }))
    },
    logTime: (eventId: string, minutes: number, note: string) =>
      mutate(
        () => request<WeekData>(`/api/events/${eventId}/log`, { method: "POST", body: json({ minutes, note }) }),
        minutes > 0 ? `Logged ${formatDuration(minutes)}. Nice.` : `Took ${formatDuration(-minutes)} off`,
      ),
    updateLog: (logId: string, patch: { minutes?: number; note?: string }) =>
      mutate(() => request<WeekData>(`/api/logs/${logId}`, { method: "PATCH", body: json(patch) }), "Entry updated"),
    deleteLog: (logId: string) =>
      mutate(() => request<WeekData>(`/api/logs/${logId}`, { method: "DELETE" }), "Entry removed"),
    reorderPins: (ids: string[]) =>
      optimisticProjects(
        (projects) => projects.map((p) => (ids.includes(p.id) ? { ...p, pinOrder: ids.indexOf(p.id) } : p)),
        () => request<WeekData>(`/api/projects/pin-order`, { method: "PUT", body: json({ ids }) }),
      ),
    updateEvent: (eventId: string, patch: EventPatch, msg?: string) =>
      mutate(() => request<WeekData>(`/api/events/${eventId}`, { method: "PATCH", body: json({ ...patch, today }) }), msg),
    createSeries: (input: NewSeries, replaceEventId?: string) =>
      mutate(() => request<WeekData>("/api/event-series", { method: "POST", body: json({ ...input, today, replaceEventId }) }), "Repeating event added"),
    editSeries: (eventId: string, input: NewSeries, scope: "following" | "all") =>
      mutate(() => request<WeekData>(`/api/events/${eventId}/series`, { method: "PATCH", body: json({ ...input, scope, today }) }), "Repeating events updated"),
    removeEvents: (eventId: string, scope: SeriesScope) =>
      mutate(() => request<WeekData>(`/api/events/${eventId}/series`, { method: "DELETE", body: json({ scope, today }) }), "Removed from your calendar"),
    deleteEvent: (eventId: string) =>
      mutate(() => request<WeekData>(`/api/events/${eventId}`, { method: "DELETE" })),
    setTaskDone: (taskId: string, done: boolean) =>
      mutate(
        () => request<WeekData>(`/api/tasks/${taskId}`, { method: "PATCH", body: json({ done }) }),
        done ? "Task done. Take a breath." : "Task reopened",
      ),
    applyChanges: (changes: ScheduleChange[], msg = "Schedule updated") =>
      mutate(() => request<AppliedWeek>(`/api/schedule/apply`, { method: "POST", body: json({ changes, today }) }), msg),
    updateSettings: (patch: Partial<Settings>) =>
      mutate(() => request<WeekData>(`/api/settings`, { method: "PUT", body: json({ ...patch, today }) })),
    updateProject: (projectId: string, patch: ProjectPatch, msg?: string) =>
      mutate(() => request<WeekData>(`/api/projects/${projectId}`, { method: "PATCH", body: json({ ...patch, today }) }), msg),
    togglePin: (projectId: string, pinned: boolean) =>
      optimisticProjects(
        (projects) => projects.map((p) => (p.id === projectId ? { ...p, pinned } : p)),
        () => request<WeekData>(`/api/projects/${projectId}`, { method: "PATCH", body: json({ pinned }) }),
      ),
    createProject: (project: NewProject) =>
      mutate(() => request<WeekData>(`/api/projects`, { method: "POST", body: json(project) }), "Assignment added"),
    saveCheckIn: (date: string, rating: number, note: string) =>
      mutate(() => request<WeekData>(`/api/checkins`, { method: "PUT", body: json({ date, rating, note }) }), "Thanks — noted."),
    reset: () =>
      mutate(() => request<WeekData>(`/api/reset`, { method: "POST", body: json({ today }) }), "Demo data restored"),
  }
}

export type WeekApi = ReturnType<typeof useWeek>

export { request }
