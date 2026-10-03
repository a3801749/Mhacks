"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { activeProjects } from "@/lib/analytics"
import { formatRange } from "@/lib/time"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"

const fromTime = (v: string) => {
  const [h, m] = v.split(":").map(Number)
  return h * 60 + m
}

export function ScheduleDialog({ date, onClose }: { date: string | null; onClose: () => void }) {
  return (
    <Dialog open={date !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {date && <ScheduleForm key={date} initialDate={date} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm"

function ScheduleForm({ initialDate, onDone }: { initialDate: string; onDone: () => void }) {
  const { data, today, api } = useApp()
  const projects = activeProjects(data).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const [kind, setKind] = useState<"work" | "life">("work")
  const [date, setDate] = useState(initialDate < today ? today : initialDate)
  const [start, setStart] = useState("14:00")
  const [end, setEnd] = useState("15:00")
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "")
  const [taskId, setTaskId] = useState("")
  const [title, setTitle] = useState("")
  const [saving, setSaving] = useState(false)

  const tasks = data.tasks.filter((t) => t.projectId === projectId && !t.done)
  const task = tasks.find((t) => t.id === taskId) ?? tasks[0]
  const startMin = fromTime(start)
  const endMin = fromTime(end)
  const validTime = endMin > startMin
  const clash = data.events.find(
    (e) => e.date === date && e.status !== "skipped" && e.startMin < endMin && e.endMin > startMin,
  )
  const ready = validTime && (kind === "work" ? Boolean(task) : title.trim().length > 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setSaving(true)
    const ok = await api.applyChanges(
      [
        {
          action: "create",
          date,
          startMin,
          endMin,
          title: kind === "work" ? task!.title : title.trim().slice(0, 80),
          taskId: kind === "work" ? task!.id : null,
          projectId: projectId || null,
          reason: "Scheduled from Agenda",
        },
      ],
      "Added to your calendar",
    )
    setSaving(false)
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="font-heading text-xl font-medium">Schedule</DialogTitle>
        <DialogDescription>Book time to work on an assignment, or add a class, exam or anything else.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-1 rounded-md border p-0.5" role="radiogroup" aria-label="What are you scheduling?">
        {(
          [
            ["work", "Work session"],
            ["life", "Event"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k)
              if (k === "work" && !projectId) setProjectId(projects[0]?.id ?? "")
            }}
            className={cn(
              "rounded-sm py-1.5 text-sm transition-colors",
              kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {kind === "life" && (
        <div className="space-y-1.5">
          <Label htmlFor="stitle">Title</Label>
          <Input id="stitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="EECS 281 lecture" required />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="sproject">{kind === "work" ? "Assignment" : "Linked assignment (optional)"}</Label>
        <select
          id="sproject"
          className={selectClass}
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value)
            setTaskId("")
          }}
        >
          {kind === "life" && <option value="">None</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {kind === "work" && (
        <div className="space-y-1.5">
          <Label htmlFor="stask">Task</Label>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every task on this assignment is done.</p>
          ) : (
            <select id="stask" className={selectClass} value={task?.id ?? ""} onChange={(e) => setTaskId(e.target.value)}>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sdate">Day</Label>
          <Input id="sdate" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sstart">From</Label>
          <Input id="sstart" type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="send">To</Label>
          <Input id="send" type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} required />
        </div>
      </div>

      {!validTime && <p className="text-sm text-red-700">End time needs to be after the start.</p>}
      {validTime && clash && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Overlaps “{clash.title}” ({formatRange(clash.startMin, clash.endMin)}). You can still add it.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!ready || saving}>
          {saving && <Loader2 className="animate-spin" />}
          Add to calendar
        </Button>
      </div>
    </form>
  )
}
