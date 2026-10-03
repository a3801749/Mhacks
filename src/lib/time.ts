export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

export function daysBetween(from: string, to: string): number {
  const ms = fromDateKey(to).getTime() - fromDateKey(from).getTime()
  return Math.round(ms / 86_400_000)
}

export function formatClock(min: number): string {
  const h24 = Math.floor(min / 60) % 24
  const m = min % 60
  const suffix = h24 >= 12 ? "pm" : "am"
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`
}

export function formatRange(start: number, end: number): string {
  return `${formatClock(start)} – ${formatClock(end)}`
}

export function formatDuration(min: number): string {
  const rounded = Math.round(min)
  if (rounded < 60) return `${rounded}m`
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function weekdayShort(key: string): string {
  return fromDateKey(key).toLocaleDateString("en-US", { weekday: "short" })
}

export function weekdayLong(key: string): string {
  return fromDateKey(key).toLocaleDateString("en-US", { weekday: "long" })
}

export function monthDay(key: string): string {
  return fromDateKey(key).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** Short, relative due label: "Today", "Tomorrow", "Thu", or "Oct 12". */
export function formatDue(today: string, date: string): string {
  const d = daysBetween(today, date)
  if (d < 0) return "Overdue"
  if (d === 0) return "Today"
  if (d === 1) return "Tomorrow"
  if (d < 7) return weekdayShort(date)
  return monthDay(date)
}

export function nowMinutes(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes()
}
