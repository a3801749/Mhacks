"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, Pin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { APP_NAME, ASSIGNMENT_TYPES, PRIORITIES } from "@/lib/brand"
import { estimateProject } from "@/lib/analytics"
import { addDays, formatDuration } from "@/lib/time"
import type { AssignmentType, Priority, Project, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { WeekApi } from "@/hooks/use-week"

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
  return (
    <Dialog open={project !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {project !== null && (
          <ProjectForm
            key={project === "new" ? "new" : project.id}
            project={project}
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
  const [hours, setHours] = useState(String(p ? +(p.targetMinutes / 60).toFixed(1) : 3))
  const [assigned, setAssigned] = useState(p?.assignedDate ?? today)
  const [due, setDue] = useState(p?.dueDate ?? addDays(today, 7))
  const [firstTask, setFirstTask] = useState("")
  const [saving, setSaving] = useState<"save" | "finish" | null>(null)
  const courses = [...new Set(data.projects.map((x) => x.course))].sort()

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
      targetMinutes: Math.round(Number(hours) * 60) || 60,
      assignedDate: assigned,
      dueDate: due,
      progressPercent: null,
      completedDate: null,
    } satisfies Project)
  const estimate = estimateProject({ ...preview, course: course || preview.course, type, targetMinutes: Math.round(Number(hours) * 60) || 60 }, data)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving("save")
    const targetMinutes = Math.round(Number(hours) * 60)
    const fields = { name, course, type, priority, notes, targetMinutes, assignedDate: assigned, dueDate: due }
    let ok = isNew
      ? await api.createProject({ ...fields, firstTask })
      : await api.updateProject(p!.id, { ...fields, pinned }, "Saved")
    if (ok && isNew && pinned) {
      const created = ok.projects.find((x) => !data.projects.some((d) => d.id === x.id))
      if (created) ok = await api.togglePin(created.id, true)
    }
    setSaving(null)
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl font-medium">{isNew ? "New assignment" : "Edit assignment"}</DialogTitle>
        <DialogDescription>
          Course, category and priority help {APP_NAME} learn what runs long and what to plan first.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="pname">Name</Label>
        <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="EECS 281 · Homework 8" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pcourse">Course</Label>
        <Input id="pcourse" list="course-options" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="EECS 281" />
        <datalist id="course-options">
          {courses.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
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
          <Label htmlFor="phours">Your estimate (h)</Label>
          <Input id="phours" type="number" min={0.25} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passigned">Assigned</Label>
          <Input id="passigned" type="date" value={assigned} onChange={(e) => setAssigned(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pdue">Due</Label>
          <Input id="pdue" type="date" value={due} min={assigned} onChange={(e) => setDue(e.target.value)} required />
        </div>
      </div>

      {isNew && (
        <div className="space-y-1.5">
          <Label htmlFor="ptask">First task</Label>
          <Input id="ptask" value={firstTask} onChange={(e) => setFirstTask(e.target.value)} placeholder="Read the spec, start problem 1" />
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

      <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <Pin className="size-4 text-muted-foreground" /> Pin to Today
        </span>
        <Switch checked={pinned} onCheckedChange={setPinned} />
      </label>

      <p className="rounded-md bg-secondary/70 p-3 text-sm text-secondary-foreground">
        <span className="font-medium">Likely total: {formatDuration(estimate.total)}.</span> {estimate.explanation}
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        {!isNew && !p!.completedDate && (
          <Button
            type="button"
            variant="ghost"
            disabled={saving !== null}
            onClick={async () => {
              setSaving("finish")
              const ok = await api.updateProject(
                p!.id,
                { completedDate: today, progressPercent: 100 },
                "Wrapped up. Its real hours now train your estimates.",
              )
              setSaving(null)
              if (ok) onDone()
            }}
          >
            {saving === "finish" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Mark finished
          </Button>
        )}
        <Button type="submit" className="ml-auto" disabled={saving !== null || !name.trim()}>
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
