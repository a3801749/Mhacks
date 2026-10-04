import { RequestError } from "./errors"
import { addDays, daysBetween, fromDateKey, toDateKey, validDate } from "./time"
import type { CalendarEvent, EventSeries, RecurrenceRule, SeriesScope, WeekData } from "./types"
import type { NewSeries } from "./store/types"

export function eventDetails(value: { location?: unknown; meetingUrl?: unknown; notes?: unknown }) {
  const text = (v: unknown, max: number) => {
    if (v === undefined) return ""
    if (typeof v !== "string" || v.length > max) throw new RequestError(`Enter text of at most ${max} characters`)
    return v.trim()
  }
  const meetingUrl = text(value.meetingUrl, 2000)
  if (meetingUrl) {
    try {
      const url = new URL(meetingUrl)
      if (!["https:", "http:"].includes(url.protocol)) throw new Error()
    } catch { throw new RequestError("Use a complete http or https meeting link") }
  }
  return { location: text(value.location, 300), meetingUrl, notes: text(value.notes, 4000) }
}

export function validateSeries(value: unknown): NewSeries {
  if (!value || typeof value !== "object") throw new RequestError("Invalid repeating event")
  const v = value as NewSeries
  if (typeof v.title !== "string" || !v.title.trim() || v.title.length > 80) throw new RequestError("Enter an event title of at most 80 characters")
  if (!validDate(v.startDate) || v.startDate < "1900-01-01" || v.startDate > "9998-12-31") throw new RequestError("Invalid series start date")
  if (!Number.isInteger(v.startMin) || !Number.isInteger(v.endMin) || v.startMin < 0 || v.endMin > 1440 || v.endMin <= v.startMin) throw new RequestError("End time must be after the start, on the same day")
  const r = v.rule
  if (!r || !["daily", "weekly", "monthly", "yearly"].includes(r.frequency) || !Number.isInteger(r.interval) || r.interval < 1 || r.interval > 99) throw new RequestError("Choose a recurrence interval between 1 and 99")
  if (!Array.isArray(r.weekdays) || r.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || (r.frequency === "weekly" && r.weekdays.length === 0)) throw new RequestError("Choose at least one weekday")
  if (!["date", "weekday"].includes(r.monthlyMode) || ![-1, 1, 2, 3, 4, 5].includes(r.ordinal)) throw new RequestError("Invalid monthly rule")
  if (!r.end || !["never", "until", "count"].includes(r.end.type)) throw new RequestError("Choose how the series ends")
  if (r.end.type === "until" && (!validDate(r.end.date) || r.end.date < v.startDate)) throw new RequestError("The series end cannot be before its start")
  if (r.end.type === "count" && (!Number.isInteger(r.end.count) || r.end.count < 1 || r.end.count > 1000)) throw new RequestError("Choose between 1 and 1000 occurrences")
  return { title: v.title.trim(), startDate: v.startDate, startMin: v.startMin, endMin: v.endMin,
    ...eventDetails(v), rule: { frequency: r.frequency, interval: r.interval, weekdays: [...new Set(r.weekdays)].sort(),
      monthlyMode: r.monthlyMode, ordinal: r.ordinal, end: { ...r.end } } }
}

function monthlyDate(year: number, month: number, day: number, weekday?: number, ordinal = 1): string | null {
  const last = new Date(year, month + 1, 0).getDate()
  let date = day
  if (weekday !== undefined) {
    date = ordinal === -1
      ? last - ((new Date(year, month, last).getDay() - weekday + 7) % 7)
      : 1 + ((weekday - new Date(year, month, 1).getDay() + 7) % 7) + (ordinal - 1) * 7
  }
  return date <= last ? toDateKey(new Date(year, month, date)) : null
}

/** Local calendar arithmetic keeps recurring wall-clock times stable across DST. */
export function occurrenceDates(series: EventSeries, through: string): string[] {
  const { rule: r, startDate } = series
  const start = fromDateKey(startDate)
  let limit = through
  if (r.end.type === "until" && r.end.date < limit) limit = r.end.date
  if (series.stopBefore && series.stopBefore <= limit) limit = addDays(series.stopBefore, -1)
  if (limit < startDate) return []
  const maxCount = r.end.type === "count" ? r.end.count : Infinity
  const result: string[] = []
  const add = (date: string | null) => {
    if (date && date >= startDate && date <= limit && result.length < maxCount) result.push(date)
  }
  if (r.frequency === "daily") {
    for (let offset = 0; offset <= daysBetween(startDate, limit) && result.length < maxCount; offset += r.interval) add(addDays(startDate, offset))
  } else if (r.frequency === "weekly") {
    const anchor = addDays(startDate, -((start.getDay() + 6) % 7)) // Monday-based weeks.
    const days = [...r.weekdays].sort((a, b) => (a + 6) % 7 - (b + 6) % 7)
    for (let offset = 0; offset <= daysBetween(anchor, limit) && result.length < maxCount; offset += r.interval * 7) {
      const week = addDays(anchor, offset)
      for (const day of days) add(addDays(week, (day + 6) % 7))
    }
  } else {
    const step = r.interval * (r.frequency === "yearly" ? 12 : 1)
    const end = fromDateKey(limit)
    const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
    for (let offset = 0; offset <= months && result.length < maxCount; offset += step) {
      const month = new Date(start.getFullYear(), start.getMonth() + offset, 1)
      add(monthlyDate(month.getFullYear(), month.getMonth(), start.getDate(),
        r.frequency === "monthly" && r.monthlyMode === "weekday" ? start.getDay() : undefined, r.ordinal))
    }
  }
  // Count includes cancelled or individually moved occurrences.
  const excluded = new Set(series.excludedDates)
  return result.filter((date) => !excluded.has(date))
}

export function seriesEvent(series: EventSeries, date: string): CalendarEvent {
  return { id: `${series.id}:${date}`, title: series.title, date, startMin: series.startMin, endMin: series.endMin,
    kind: "life", projectId: null, taskId: null, status: "planned", actualMinutes: 0,
    location: series.location, meetingUrl: series.meetingUrl, notes: series.notes,
    seriesId: series.id, occurrenceDate: date, isException: false, movedFromDate: null, movedFromStartMin: null }
}

/** Existing occurrences, including skipped and moved ones, always win over generation. */
export function materializeSeries(events: CalendarEvent[], series: EventSeries[], through: string): CalendarEvent[] {
  const keys = new Set(events.filter((e) => e.seriesId).map((e) => `${e.seriesId}:${e.occurrenceDate}`))
  const next = [...events]
  for (const s of series) {
    const existing = events.filter((e) => e.seriesId === s.id)
    const existingDates = new Set(existing.map((e) => e.occurrenceDate))
    // Preserved exceptions count even if a new rule no longer lands on their date.
    let remaining = s.rule.end.type === "count"
      ? Math.max(0, s.rule.end.count - existing.length - s.excludedDates.filter((d) => !existingDates.has(d)).length)
      : Infinity
    for (const date of occurrenceDates(s, through)) {
      if (remaining <= 0) break
      const key = `${s.id}:${date}`
      if (!keys.has(key)) { next.push(seriesEvent(s, date)); keys.add(key); remaining-- }
    }
  }
  return next
}

export function changeSeries(data: WeekData, eventId: string, input: NewSeries, scope: "following" | "all", newId: string, today: string) {
  const event = data.events.find((e) => e.id === eventId)
  const original = data.series.find((s) => s.id === event?.seriesId)
  if (!event || !original || !event.occurrenceDate) throw new RequestError("Repeating event not found", 404)
  const cutoff = scope === "following" ? event.occurrenceDate : original.startDate
  const delta = daysBetween(scope === "following" ? event.occurrenceDate : original.startDate, input.startDate)
  // A fresh generation avoids ID collisions with preserved, shifted exceptions.
  const id = newId
  const updated: EventSeries = { ...input, id, stopBefore: original.stopBefore ? addDays(original.stopBefore, delta) : null,
    excludedDates: original.excludedDates.filter((date) => date >= cutoff).map((date) => addDays(date, delta)) }
  // Keep the remaining count when splitting a count-ended series with an unchanged rule.
  if (scope === "following" && input.rule.end.type === "count" && original.rule.end.type === "count" && input.rule.end.count === original.rule.end.count) {
    const before = occurrenceDates({ ...original, excludedDates: [] }, addDays(cutoff, -1)).length
    updated.rule = { ...input.rule, end: { type: "count", count: Math.max(1, input.rule.end.count - before) } }
  }
  const series = scope === "all" ? data.series.map((s) => s.id === original.id ? updated : s)
    : [...data.series.map((s) => s.id === original.id ? { ...s, stopBefore: cutoff } : s), updated]
  const events = data.events.flatMap((e) => {
    if (e.seriesId !== original.id || e.occurrenceDate! < cutoff) return [e]
    if (e.date < today || e.actualMinutes > 0 || e.status === "completed" || e.isException) {
      return [{ ...e, seriesId: id, occurrenceDate: addDays(e.occurrenceDate!, delta), isException: true }]
    }
    return []
  })
  const through = data.events.reduce((max, e) => e.date > max ? e.date : max, addDays(today, 366))
  return { series, events: materializeSeries(events, series, through) }
}

export function removeOccurrences(data: WeekData, eventId: string, scope: SeriesScope) {
  const event = data.events.find((e) => e.id === eventId)
  if (!event) throw new RequestError("Event not found", 404)
  if (scope !== "this" && !event.seriesId) throw new RequestError("This event does not repeat")
  const targets = data.events.filter((e) => scope === "this" ? e.id === eventId
    : e.seriesId === event.seriesId && (scope === "all" || e.occurrenceDate! >= event.occurrenceDate!))
  const ids = new Set(targets.map((e) => e.id))
  if (targets.some((e) => e.actualMinutes > 0) || data.logs.some((l) => l.eventId && ids.has(l.eventId))) {
    throw new RequestError("Events with recorded time cannot be deleted. Skip them instead, or remove their time entries first.", 409)
  }
  const series = data.series.flatMap((s) => {
    if (s.id !== event.seriesId) return [s]
    if (scope === "all") return []
    if (scope === "following") return [{ ...s, stopBefore: event.occurrenceDate }]
    return [{ ...s, excludedDates: [...new Set([...s.excludedDates, event.occurrenceDate!])] }]
  })
  return { series, events: data.events.filter((e) => !ids.has(e.id)) }
}

export function recurrenceSummary(rule: RecurrenceRule) {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[rule.frequency]
  const end = rule.end.type === "until" ? `, until ${rule.end.date}` : rule.end.type === "count" ? `, ${rule.end.count} times` : ""
  return `Every ${rule.interval === 1 ? unit : `${rule.interval} ${unit}s`}${end}`
}
