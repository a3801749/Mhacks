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
