"use client"

import { useRef, useState } from "react"
import { CheckCircle2, Loader2, Pin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ASSIGNMENT_TYPES, PRIORITIES } from "@/lib/brand"
import { displayedPercent, estimateProject } from "@/lib/analytics"
import { addDays, formatDuration, validDate } from "@/lib/time"
import type { AssignmentType, Priority, Project, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CourseField } from "./course-field"
import type { WeekApi } from "@/hooks/use-week"

function formatHours(minutes: number) {
  return (minutes / 60).toFixed(2).replace(/\.?0+$/, "")
}

function projectFormKey(project: Project, data: WeekData) {
  return [
    project.id,
    project.name,
    project.course,
    project.type,
    project.priority,
    project.notes,
    project.pinned,
    project.targetMinutes,
    project.assignedDate,
    project.dueDate,
    project.progressPercent,
    project.completedDate,
    displayedPercent(project, data),
  ].join("\u0000")
}

export function ProjectDialog({
  project,
  onClose,
  data,
  api,
  today,
}: {
  project: Project | "new" | null
  onClose: () => void
  data: WeekData
  api: WeekApi
  today: string
}) {
  const live = project === null || project === "new" ? project : data.projects.find((p) => p.id === project.id) ?? project
  return (
    <Dialog open={live !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {live !== null && (
          <ProjectForm
            key={live === "new" ? "new" : projectFormKey(live, data)}
            project={live}
            data={data}
            api={api}
            today={today}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ProjectForm({
  project,
  data,
  api,
  today,
  onDone,
}: {
  project: Project | "new"
  data: WeekData
  api: WeekApi
  today: string
  onDone: () => void
}) {
  const isNew = project === "new"
  const p = isNew ? null : project
  const [name, setName] = useState(p?.name ?? "")
  const [course, setCourse] = useState(p?.course ?? "")
  const [type, setType] = useState<AssignmentType>(p?.type ?? "homework")
  const [priority, setPriority] = useState<Priority>(p?.priority ?? "completion")
  const [notes, setNotes] = useState(p?.notes ?? "")
  const [pinned, setPinned] = useState(p?.pinned ?? false)
  const [hours, setHours] = useState(formatHours(p?.targetMinutes ?? 180))
  const [assigned, setAssigned] = useState(p?.assignedDate ?? today)
  const [due, setDue] = useState(p?.dueDate ?? addDays(today, 7))
  const [firstTask, setFirstTask] = useState("")
  const [initialProgress] = useState(() => (p ? displayedPercent(p, data) : 0))
  const [progress, setProgress] = useState(initialProgress)
  const [saving, setSaving] = useState<"save" | "finish" | null>(null)
  const lock = useRef(false)
  const courses = [...new Set(data.projects.map((x) => x.course))].sort()

  const progressChanged = !isNew && progress !== initialProgress
  const targetMinutes = !isNew && hours === formatHours(p!.targetMinutes) ? p!.targetMinutes : Math.round(Number(hours) * 60)
  const dateError = !validDate(assigned) || !validDate(due)
    ? "Assigned and due dates are required"
    : due < assigned
      ? "Due date cannot be before the assigned date"
      : null
  const hoursError = !Number.isFinite(targetMinutes) || targetMinutes < 15 || targetMinutes > 200 * 60
    ? "Estimate should be between 15 minutes and 200 hours"
    : null
  const formError = dateError ?? hoursError
  const previewMinutes = Number.isFinite(targetMinutes) && targetMinutes > 0 ? targetMinutes : 60
  const preview =
    p ??
    ({
      id: "preview",
      name,
      color: "#000",
      course: course || "General",
      type,
      priority,
      notes,
      pinned: false,
      pinCount: 0,
      pinOrder: 0,
      targetMinutes: previewMinutes,
      assignedDate: assigned,
      dueDate: due,
      progressPercent: null,
      completedDate: null,
    } satisfies Project)
  const estimate = estimateProject(
    {
      ...preview,
      course: course || preview.course,
      type,
      targetMinutes: previewMinutes,
      progressPercent: isNew ? null : progressChanged ? progress : p!.progressPercent,
    },
    data,
  )

  const finish = async () => {
    if (lock.current || !p) return
    lock.current = true
    setSaving("finish")
    const ok = await api.updateProject(
      p.id,
      { completedDate: today, progressPercent: 100 },
      "Wrapped up. Its real hours now train your estimates.",
    )
    lock.current = false
    setSaving(null)
    if (ok) onDone()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lock.current || !name.trim() || formError) return
    lock.current = true
    setSaving("save")
    const fields = {
      name: name.trim(),
      course: course.trim().slice(0, 40) || "General",
      type,
      priority,
      notes,
      targetMinutes,
      assignedDate: assigned,
      dueDate: due,
    }
    const saved = isNew
      ? await api.createProject({ ...fields, firstTask })
      : await api.updateProject(
          p!.id,
          { ...fields, pinned, ...(progressChanged ? { progressPercent: progress } : {}) },
          "Saved",
        )
    if (saved && isNew && pinned) {
      const created = saved.projects.find((x) => !data.projects.some((d) => d.id === x.id))
      if (created) await api.togglePin(created.id, true)
    }
    lock.current = false
    setSaving(null)
    if (saved) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl font-medium">{isNew ? "New assignment" : "Edit assignment"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="pname">Name</Label>
        <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="EECS 281 · Homework 8" maxLength={80} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pcourse">Course</Label>
        <CourseField id="pcourse" value={course} onChange={setCourse} courses={courses} />
      </div>

      <div className="space-y-1.5">
        <Label>Category</Label>
        <ChoiceRow
          label="Category of work"
          options={(Object.keys(ASSIGNMENT_TYPES) as AssignmentType[]).map((t) => ({ value: t, label: ASSIGNMENT_TYPES[t] }))}
          value={type}
          onChange={setType}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Priority</Label>
        <ChoiceRow
          label="Priority"
          options={(Object.keys(PRIORITIES) as Priority[]).map((t) => ({ value: t, label: PRIORITIES[t].label }))}
          value={priority}
          onChange={setPriority}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="phours">Estimate (hr)</Label>
          <Input id="phours" type="number" min={0.25} max={200} step="any" value={hours} onChange={(e) => setHours(e.target.value)} aria-invalid={Boolean(hoursError)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passigned">Assigned</Label>
          <Input id="passigned" type="date" value={assigned} onChange={(e) => setAssigned(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pdue">Due</Label>
          <Input id="pdue" type="date" value={due} min={assigned} onChange={(e) => setDue(e.target.value)} aria-invalid={Boolean(dateError)} required />
        </div>
      </div>

      {!isNew && !p!.completedDate && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label>Progress</Label>
            <span className="font-heading text-lg tabular-nums">{progress}%</span>
          </div>
          <Slider
            value={[progress]}
            min={0}
            max={100}
            step={5}
            disabled={saving !== null}
            onValueChange={(v) => setProgress(Array.isArray(v) ? v[0] : v)}
            aria-label="Assignment progress"
          />
        </div>
      )}

      {isNew && (
        <div className="space-y-1.5">
          <Label htmlFor="ptask">First task</Label>
          <Input id="ptask" value={firstTask} onChange={(e) => setFirstTask(e.target.value)} placeholder="Read the spec, start problem 1" maxLength={80} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="pnotes">Notes</Label>
        <Textarea
          id="pnotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Rubric details, links, what the professor said in class…"
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
        <button type="button" className="flex flex-1 items-center gap-2 text-left disabled:opacity-50" disabled={saving !== null} onClick={() => setPinned((current) => !current)}>
          <Pin className="size-4 text-muted-foreground" /> Pin to Today
        </button>
        <Switch checked={pinned} onCheckedChange={setPinned} disabled={saving !== null} aria-label="Pin to Today" />
      </div>

      <p className="rounded-md bg-secondary/70 p-3 text-sm text-secondary-foreground">
        {estimate.uncertain ? (
          estimate.explanation
        ) : (
          <>
            <span className="font-medium">Likely total: {formatDuration(estimate.total)}.</span> {estimate.explanation}
          </>
        )}
      </p>
      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        {!isNew && !p!.completedDate && (
          <Button type="button" variant="ghost" disabled={saving !== null} onClick={finish}>
            {saving === "finish" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Mark finished
          </Button>
        )}
        <Button type="submit" className="ml-auto" disabled={saving !== null || !name.trim() || Boolean(formError)}>
          {saving === "save" && <Loader2 className="animate-spin" />}
          {isNew ? "Add assignment" : "Save"}
        </Button>
      </div>
    </form>
  )
}

function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md border px-2.5 py-1 text-sm transition-colors",
            value === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
