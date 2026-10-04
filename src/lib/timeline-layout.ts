import { addDays, daysBetween, fromDateKey } from "./time"

/** Keep the chart bounded even when a deadline is extended by years. */
export function timelineTicks(start: string, end: string) {
  const days = Math.max(1, daysBetween(start, end))
  const step = days > 180 ? Math.ceil(days / 12) : days > 45 ? 7 : days > 21 ? 3 : 1
  const labels = Array.from({ length: Math.ceil(days / step) }, (_, i) => addDays(start, i * step))
  const monday = addDays(start, (8 - fromDateKey(start).getDay()) % 7)
  const grid = days > 180 ? labels : Array.from({ length: Math.ceil(days / 7) }, (_, i) => addDays(monday, i * 7)).filter((date) => date < end)
  return { days, step, labels, grid }
}

export interface ProgressFill {
  /** Date the fill is drawn from: the first logged day, kept inside assigned → due. */
  origin: string
  /** Fill length in (fractional) days from `origin`. */
  length: number
  /** Days from origin to the end of the due date; `length` never exceeds it. */
  span: number
}

/**
 * Progress drawn as a share of the time between starting and the deadline.
 * Clamping the origin keeps the fill inside the assignment bar even when the due
 * date is moved before the first logged day, or work was logged before it was assigned.
 */
export function progressFill(assigned: string, due: string, started: string | null, percent: number): ProgressFill {
  const end = addDays(due, 1)
  let origin = started && started > assigned ? started : assigned
  if (origin >= end) origin = due
  const span = Math.max(1, daysBetween(origin, end))
  const share = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0)) / 100
  return { origin, length: span * share, span }
}

/** Days the fill trails today (positive = behind pace, negative = ahead). */
export function progressLag(fill: ProgressFill, today: string, todayFraction = 0) {
  return daysBetween(fill.origin, today) + todayFraction - fill.length
}
