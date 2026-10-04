"use client"

import { useId, useRef, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectField } from "@/components/ui/select-field"
import { validateSeries } from "@/lib/recurrence"
import { addDays, formatDuration, validDate } from "@/lib/time"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"
import { CourseField } from "./course-field"

const MEETING_TYPES = ["Lecture", "Discussion", "Lab", "Seminar", "Office hours", "Class"] as const
const DAYS = [
  { day: 1, short: "M", long: "Monday" },
  { day: 2, short: "T", long: "Tuesday" },
  { day: 3, short: "W", long: "Wednesday" },
  { day: 4, short: "T", long: "Thursday" },
  { day: 5, short: "F", long: "Friday" },
  { day: 6, short: "S", long: "Saturday" },
  { day: 0, short: "S", long: "Sunday" },
]

interface Meeting {
  key: number
  type: (typeof MEETING_TYPES)[number]
  weekdays: number[]
  start: string
  end: string
  location: string
}

const toMinutes = (value: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function CourseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl font-medium">Add a class</DialogTitle>
        <DialogDescription>Your lectures, sections, and labs repeat every week until the last day of class.</DialogDescription>
      </DialogHeader>
      {open && <CourseForm onDone={onClose} />}
    </DialogContent>
  </Dialog>
}

function CourseForm({ onDone }: { onDone: () => void }) {
  const { data, api, today } = useApp()
  const id = useId()
  const nextKey = useRef(1)
  const courses = [...new Set(data.projects.map((p) => p.course).filter(Boolean))]
  const [course, setCourse] = useState("")
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(addDays(today, 7 * 14))
  const [meetings, setMeetings] = useState<Meeting[]>([{ key: 0, type: "Lecture", weekdays: [1, 3], start: "10:00", end: "11:30", location: "" }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (key: number, patch: Partial<Meeting>) => setMeetings((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  const meetingOk = (m: Meeting) => {
    const s = toMinutes(m.start)
    const e = toMinutes(m.end)
    return m.weekdays.length > 0 && s != null && e != null && e > s
  }
  const datesOk = validDate(startDate) && validDate(endDate) && endDate >= startDate
  const valid = course.trim().length > 0 && datesOk && meetings.every(meetingOk)
  const titleFor = (m: Meeting) => (m.type === "Class" ? course.trim() : `${course.trim()} ${m.type}`).slice(0, 80)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    let added = 0
    try {
      for (const m of meetings) {
        const input = validateSeries({
          title: titleFor(m), location: m.location, meetingUrl: "", notes: "",
          startDate, startMin: toMinutes(m.start)!, endMin: toMinutes(m.end)!,
          rule: { frequency: "weekly", interval: 1, weekdays: m.weekdays, monthlyMode: "date", ordinal: 1, end: { type: "until", date: endDate } },
        })
        if (!await api.createSeries(input, undefined, "")) return
        added++
      }
      toast.success(`${course.trim()} is on your calendar`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add this class")
    } finally {
      if (added > 0 && added < meetings.length) setMeetings((ms) => ms.slice(added))
      setSaving(false)
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-1">
      <Label htmlFor={`${id}-course`}>Course</Label>
      <CourseField id={`${id}-course`} value={course} onChange={setCourse} courses={courses} />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1"><Label htmlFor={`${id}-first`}>First day</Label><Input id={`${id}-first`} type="date" value={startDate} required onChange={(e) => setStartDate(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-last`}>Last day of class</Label><Input id={`${id}-last`} type="date" value={endDate} min={startDate} required onChange={(e) => setEndDate(e.target.value)} /></div>
    </div>
    {!datesOk && <p className="text-xs text-destructive">The last day can&apos;t be before the first.</p>}

    <ul className="space-y-3">
      {meetings.map((m) => {
        const s = toMinutes(m.start)
        const e = toMinutes(m.end)
        return <li key={m.key} className="space-y-3 rounded-md border p-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={`${id}-${m.key}-type`}>Meeting</Label>
              <SelectField id={`${id}-${m.key}-type`} value={m.type} onValueChange={(type) => update(m.key, { type })} options={MEETING_TYPES.map((t) => ({ value: t, label: t }))} />
            </div>
            {meetings.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${m.type.toLowerCase()}`} onClick={() => setMeetings((ms) => ms.filter((x) => x.key !== m.key))}><Trash2 /></Button>}
          </div>
          <div role="group" aria-label={`${m.type} days`} className="flex gap-1">
            {DAYS.map(({ day, short, long }) => {
              const on = m.weekdays.includes(day)
              return <button key={day} type="button" aria-label={long} aria-pressed={on}
                onClick={() => update(m.key, { weekdays: on ? m.weekdays.filter((d) => d !== day) : [...m.weekdays, day] })}
                className={cn("flex size-9 flex-1 items-center justify-center rounded-md border text-sm", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary")}>{short}</button>
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor={`${id}-${m.key}-start`}>From</Label><Input id={`${id}-${m.key}-start`} type="time" value={m.start} required onChange={(ev) => update(m.key, { start: ev.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor={`${id}-${m.key}-end`}>To</Label><Input id={`${id}-${m.key}-end`} type="time" value={m.end} required onChange={(ev) => update(m.key, { end: ev.target.value })} /></div>
            <div className="col-span-2 space-y-1 sm:col-span-1"><Label htmlFor={`${id}-${m.key}-room`}>Room</Label><Input id={`${id}-${m.key}-room`} value={m.location} maxLength={300} placeholder="1670 BBB" onChange={(ev) => update(m.key, { location: ev.target.value })} /></div>
          </div>
          <p className={cn("text-xs", meetingOk(m) ? "text-muted-foreground" : "text-destructive")}>
            {m.weekdays.length === 0 ? "Pick at least one day" : s == null || e == null || e <= s ? "End time must be after the start"
              : `${formatDuration(e - s)} · ${DAYS.filter((d) => m.weekdays.includes(d.day)).map((d) => d.long.slice(0, 3)).join(", ")}${course.trim() ? ` · shows as “${titleFor(m)}”` : ""}`}
          </p>
        </li>
      })}
    </ul>
    <Button type="button" variant="outline" size="sm" disabled={meetings.length >= 5} onClick={() => setMeetings((ms) => [...ms, { key: nextKey.current++, type: "Discussion", weekdays: [5], start: "14:00", end: "15:00", location: "" }])}>
      <Plus /> Add a section or lab
    </Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" className="w-full" disabled={!valid || saving}>{saving && <Loader2 className="animate-spin" />}Add class to calendar</Button>
  </form>
}
