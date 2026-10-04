"use client"

import { useId, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SelectField } from "@/components/ui/select-field"
import { activeProjects } from "@/lib/analytics"
import { recurrenceSummary, validateSeries } from "@/lib/recurrence"
import { addDays, daysBetween, formatDuration, formatRange, validDate } from "@/lib/time"
import type { CalendarEvent, RecurrenceRule, SeriesScope } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"
import { defaultRule, RecurrenceFields } from "./recurrence-fields"
import type { ScheduleDraft } from "./schedule-dialog"

export const toTime = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`
const fromTime = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m }
export type BlockWindow = { date: string; startMin: number; endMin: number }

/** One editor for Today, Agenda, and Plan; estimates belong to assignments. */
export function BlockForm({ draft, event, onDone, onWindowChange }: {
  draft: ScheduleDraft; event?: CalendarEvent; onDone: () => void; onWindowChange?: (window: BlockWindow) => void
}) {
  const { data, api } = useApp()
  const id = useId()
  const series = data.series.find((s) => s.id === event?.seriesId)
  const projects = activeProjects(data).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  if (event?.projectId && !projects.some((p) => p.id === event.projectId)) {
    const p = data.projects.find((p) => p.id === event.projectId)
    if (p) projects.push(p)
  }
  const [kind, setKind] = useState<"work" | "life">(event?.kind ?? "work")
  const [date, setDate] = useState(event?.date ?? draft.date)
  const [start, setStart] = useState(toTime(event?.startMin ?? draft.startMin ?? 840))
  const [end, setEnd] = useState(toTime(event?.endMin ?? draft.endMin ?? (draft.startMin ?? 840) + 60))
  const [projectId, setProjectId] = useState(event?.projectId ?? projects[0]?.id ?? "")
  const [taskId, setTaskId] = useState(event?.taskId ?? "")
  const [title, setTitle] = useState(event?.title ?? "")
  const [location, setLocation] = useState(event?.location ?? "")
  const [meetingUrl, setMeetingUrl] = useState(event?.meetingUrl ?? "")
  const [notes, setNotes] = useState(event?.notes ?? "")
  const [repeats, setRepeats] = useState(Boolean(series))
  const [rule, setRule] = useState<RecurrenceRule>(series?.rule ?? defaultRule(date))
  const [scope, setScope] = useState<SeriesScope>("this")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startMin = fromTime(start)
  const endMin = fromTime(end) || 1440
  const tasks = data.tasks.filter((t) => t.projectId === projectId && (!t.done || t.id === event?.taskId))
  const task = tasks.find((t) => t.id === taskId) ?? tasks[0]
  const linked = kind === "work" && Boolean(projectId)
  const resolvedTitle = title.trim() || (linked ? task?.title ?? "" : "")
  const valid = validDate(date) && Number.isFinite(startMin) && endMin > startMin && endMin <= 1440 && Boolean(resolvedTitle) && (!linked || Boolean(task))
  const recorded = Boolean(event && (event.actualMinutes > 0 || data.logs.some((l) => l.eventId === event.id)))
  const clash = data.events.find((e) => e.id !== event?.id && e.date === date && e.status !== "skipped" && e.startMin < endMin && e.endMin > startMin)
  const inputDate = series && scope === "all" ? addDays(series.startDate, daysBetween(event!.date, date)) : date
  const seriesInput = { title: resolvedTitle, location, meetingUrl, notes, startDate: inputDate, startMin, endMin, rule }
  const updateWindow = (next: Partial<BlockWindow>) => onWindowChange?.({ date, startMin, endMin, ...next })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setError(null)
    setSaving(true)
    let result
    try {
      if (repeats && (!series || scope !== "this")) {
        const input = validateSeries(seriesInput)
        result = series ? await api.editSeries(event!.id, input, scope as "following" | "all") : await api.createSeries(input, event?.id)
      } else if (event) {
        result = await api.updateEvent(event.id, { title: resolvedTitle, date, startMin, endMin, location, meetingUrl, notes,
          ...(!series && !recorded ? { kind, projectId: linked ? projectId : null, taskId: linked ? task!.id : null } : {}) }, "Block updated")
      } else {
        result = await api.applyChanges([{ action: "create", date, startMin, endMin, title: resolvedTitle, kind,
          projectId: linked ? projectId : null, taskId: linked ? task!.id : null, location, meetingUrl, notes, reason: "Scheduled by hand" }], "Added to your calendar")
      }
      if (result) onDone()
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save") }
    finally { setSaving(false) }
  }

  return <form onSubmit={submit} className="space-y-4">
    {!series && <div className="grid grid-cols-2 gap-1 rounded-md border p-0.5" role="radiogroup" aria-label="Block type">
      {(["work", "life"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={recorded} onClick={() => { setKind(k); setRepeats(false) }} className={cn("rounded-sm py-1.5 text-sm disabled:opacity-50", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>{k === "work" ? "Focus block" : "Event"}</button>)}
    </div>}
    {series && <div className="space-y-1"><Label htmlFor={`${id}-scope`}>Edit</Label><SelectField id={`${id}-scope`} value={scope} onValueChange={setScope} options={[{ value: "this", label: "This event" }, { value: "following", label: "This and following events" }, { value: "all", label: "All events in this series" }]} />
      <p className="text-xs text-muted-foreground">Series edits keep past/completed events and individual exceptions. Changing all dates shifts the original series start by the same number of days.</p>
    </div>}
    {kind === "work" && <div className="space-y-2">
      <Label htmlFor={`${id}-assignment`}>Assignment (optional)</Label>
      <SelectField id={`${id}-assignment`} value={projectId} disabled={recorded} onValueChange={(v) => { setProjectId(v); setTaskId(""); setTitle("") }} options={[{ value: "", label: "None — independent focus time" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
      {linked && (tasks.length ? <SelectField label="Task" value={task?.id ?? ""} disabled={recorded} onValueChange={(v) => { setTaskId(v); setTitle("") }} options={tasks.map((t) => ({ value: t.id, label: t.title }))} /> : <p className="text-xs text-muted-foreground">No open tasks on this assignment. Reopen a task or choose independent focus time.</p>)}
      {recorded && <p className="text-xs text-muted-foreground">Recorded time stays attached to its original assignment and task.</p>}
    </div>}
    <div className="space-y-1"><Label htmlFor={`${id}-title`}>Title</Label><Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={linked ? task?.title : kind === "life" ? "Class, appointment, study group…" : "Independent focus time"} maxLength={80} required={!linked} /></div>
    <div className="grid grid-cols-3 gap-2">
      <div className="space-y-1"><Label htmlFor={`${id}-date`}>Date</Label><Input id={`${id}-date`} type="date" value={date} required onChange={(e) => { setDate(e.target.value); updateWindow({ date: e.target.value }) }} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-start`}>From</Label><Input id={`${id}-start`} type="time" value={start} required onChange={(e) => { setStart(e.target.value); updateWindow({ startMin: fromTime(e.target.value) }) }} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-end`}>To</Label><Input id={`${id}-end`} type="time" value={end} required onChange={(e) => { setEnd(e.target.value); updateWindow({ endMin: fromTime(e.target.value) || 1440 }) }} /></div>
    </div>
    <p className="text-xs text-muted-foreground">{endMin > startMin ? `${formatDuration(endMin - startMin)} scheduled` : "End time must be after the start"}{endMin === 1440 ? " · Ends at midnight" : ""}</p>
    {clash && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Overlaps “{clash.title}” ({formatRange(clash.startMin, clash.endMin)}). You can keep this overlap.</p>}
    {kind === "life" && <>
      <div className="space-y-1"><Label htmlFor={`${id}-location`}>Location</Label><Input id={`${id}-location`} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} placeholder="Room, building, or address" /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-link`}>Meeting link</Label><Input id={`${id}-link`} type="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} maxLength={2000} placeholder="https://…" /></div>
    </>}
    <div className="space-y-1"><Label htmlFor={`${id}-notes`}>Notes</Label><Textarea id={`${id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={2} /></div>
    {kind === "life" && (!event || series || !recorded && event.status === "planned") && <>
      {!series && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />Repeats</label>}
      {repeats && (series && scope === "this" ? <p className="rounded-md bg-secondary px-3 py-2 text-xs">{recurrenceSummary(series.rule)}. Choose a series scope above to change the repeat rule.</p> : <RecurrenceFields id={id} rule={rule} date={inputDate} onChange={setRule} />)}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={saving || !valid}>{saving && <Loader2 className="animate-spin" />}{event ? "Save changes" : repeats ? "Add repeating event" : "Add to calendar"}</Button>{event && <Button type="button" variant="ghost" disabled={saving} onClick={onDone}>Cancel</Button>}</div>
    {event && <div className="border-t pt-3">
      {deleting ? <div className="space-y-2"><p className="text-sm">Delete {series ? scope === "all" ? "all events in this series" : scope === "following" ? "this and following events" : "this event" : "this block"}?</p><div className="flex gap-2"><Button type="button" variant="destructive" disabled={saving || recorded} onClick={async () => { setSaving(true); const ok = await api.removeEvents(event.id, series ? scope : "this"); setSaving(false); if (ok) onDone() }}>Delete</Button><Button type="button" variant="ghost" onClick={() => setDeleting(false)}>Keep it</Button></div></div> : <Button type="button" variant="ghost" className="text-destructive" disabled={saving || recorded} onClick={() => setDeleting(true)}><Trash2 />Delete {series && scope !== "this" ? "events" : "block"}</Button>}
      {recorded && <p className="text-xs text-muted-foreground">This block has recorded work. Use Skip to keep its history.</p>}
    </div>}
  </form>
}
