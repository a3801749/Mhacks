"use client"

import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { APP_NAME, ASSIGNMENT_TYPES } from "@/lib/brand"
import { estimateProject } from "@/lib/analytics"
import { addDays, formatDuration } from "@/lib/time"
import type { AssignmentType, Project, WeekData } from "@/lib/types"
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
    const ok = isNew
      ? await api.createProject({ name, course, type, targetMinutes, assignedDate: assigned, dueDate: due, firstTask })
      : await api.updateProject(p!.id, { name, course, type, targetMinutes, assignedDate: assigned, dueDate: due }, "Saved")
    setSaving(null)
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl font-medium">{isNew ? "New assignment" : "Edit assignment"}</DialogTitle>
        <DialogDescription>
          Tagging the course and type lets {APP_NAME} learn which kinds of work run long for you.
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
        <Label>Type</Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Assignment type">
          {(Object.keys(ASSIGNMENT_TYPES) as AssignmentType[]).map((t) => (
            <button
              type="button"
              key={t}
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                type === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary",
              )}
            >
              {ASSIGNMENT_TYPES[t]}
            </button>
          ))}
        </div>
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

      <p className="rounded-xl bg-secondary/70 p-3 text-sm text-secondary-foreground">
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
