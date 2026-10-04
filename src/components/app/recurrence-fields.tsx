"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectField } from "@/components/ui/select-field"
import { fromDateKey, weekdayLong } from "@/lib/time"
import type { RecurrenceRule } from "@/lib/types"
import { cn } from "@/lib/utils"

export function defaultRule(date: string): RecurrenceRule {
  const d = fromDateKey(date)
  return { frequency: "weekly", interval: 1, weekdays: [d.getDay()], monthlyMode: "date", ordinal: Math.ceil(d.getDate() / 7), end: { type: "never" } }
}

export function RecurrenceFields({ rule, date, onChange, disabled = false, id }: {
  rule: RecurrenceRule; date: string; onChange: (rule: RecurrenceRule) => void; disabled?: boolean; id: string
}) {
  return <div className="space-y-3 rounded-md border p-3">
    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
      <div className="space-y-1"><Label htmlFor={`${id}-interval`}>Every</Label><Input id={`${id}-interval`} type="number" min={1} max={99} value={rule.interval} disabled={disabled} onChange={(e) => onChange({ ...rule, interval: Number(e.target.value) })} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-frequency`}>Frequency</Label><SelectField id={`${id}-frequency`} value={rule.frequency} disabled={disabled} onValueChange={(frequency) => onChange({ ...rule, frequency })} options={[{ value: "daily", label: "Day(s)" }, { value: "weekly", label: "Week(s)" }, { value: "monthly", label: "Month(s)" }, { value: "yearly", label: "Year(s)" }]} /></div>
    </div>
    {rule.frequency === "weekly" && <div role="group" aria-label="Repeat on weekdays" className="flex gap-1">
      {["S", "M", "T", "W", "T", "F", "S"].map((label, day) => <button key={day} type="button" disabled={disabled} aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]} aria-pressed={rule.weekdays.includes(day)} className={cn("flex size-9 flex-1 items-center justify-center rounded-md border text-sm disabled:opacity-50", rule.weekdays.includes(day) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary")} onClick={() => onChange({ ...rule, weekdays: rule.weekdays.includes(day) ? rule.weekdays.filter((d) => d !== day) : [...rule.weekdays, day] })}>{label}</button>)}
    </div>}
    {rule.frequency === "monthly" && <div className="space-y-2">
      <SelectField label="Monthly pattern" value={rule.monthlyMode} disabled={disabled} onValueChange={(monthlyMode) => onChange({ ...rule, monthlyMode })} options={[{ value: "date", label: `On day ${Number(date.slice(8))}` }, { value: "weekday", label: `On a ${weekdayLong(date)}` }]} />
      {rule.monthlyMode === "weekday" && <SelectField label="Week of the month" value={String(rule.ordinal)} disabled={disabled} onValueChange={(v) => onChange({ ...rule, ordinal: Number(v) })} options={[{ value: "1", label: "First" }, { value: "2", label: "Second" }, { value: "3", label: "Third" }, { value: "4", label: "Fourth" }, { value: "5", label: "Fifth" }, { value: "-1", label: "Last" }]} />}
      <p className="text-xs text-muted-foreground">Months without this date or weekday occurrence are skipped.</p>
    </div>}
    <div className="space-y-1"><Label htmlFor={`${id}-ending`}>Ends</Label><SelectField id={`${id}-ending`} value={rule.end.type} disabled={disabled} onValueChange={(type) => onChange({ ...rule, end: type === "never" ? { type } : type === "until" ? { type, date } : { type, count: 10 } })} options={[{ value: "never", label: "Never" }, { value: "until", label: "On a date" }, { value: "count", label: "After a number of events" }]} /></div>
    {rule.end.type === "until" && <Input type="date" aria-label="Last series date" min={date} value={rule.end.date} disabled={disabled} onChange={(e) => onChange({ ...rule, end: { type: "until", date: e.target.value } })} required />}
    {rule.end.type === "count" && <Input type="number" aria-label="Number of occurrences" min={1} max={1000} value={rule.end.count} disabled={disabled} onChange={(e) => onChange({ ...rule, end: { type: "count", count: Number(e.target.value) } })} required />}
  </div>
}
