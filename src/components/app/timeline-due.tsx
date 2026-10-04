"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { addDays, daysBetween, monthDay } from "@/lib/time"
import type { Project } from "@/lib/types"
import { useApp } from "./app-shell"

export function DueDateInput({ project }: { project: Project }) {
  const { api } = useApp()
  const [date, setDate] = useState(project.dueDate)
  const [saving, setSaving] = useState(false)
  return <form className="flex items-center gap-1.5 px-4 pb-3" onSubmit={async (e) => {
    e.preventDefault()
    setSaving(true)
    await api.updateProject(project.id, { dueDate: date }, "Due date updated")
    setSaving(false)
  }}>
    <Input type="date" aria-label={`Due date for ${project.name}`} min={project.assignedDate} value={date} onChange={(e) => setDate(e.target.value)} required className="h-7 min-w-0 text-xs" />
    {date !== project.dueDate && <Button type="submit" size="xs" disabled={saving}>Save</Button>}
  </form>
}

export function DueEdge({ project, date, position, days, onPreview }: {
  project: Project; date: string; position: number; days: number; onPreview: (date: string | null) => void
}) {
  const { api } = useApp()
  const [saving, setSaving] = useState(false)
  const gesture = useRef<{ x: number; width: number } | null>(null)
  const draft = useRef(project.dueDate)
  const save = async (next: string) => {
    if (next === project.dueDate) { onPreview(null); return }
    setSaving(true)
    await api.updateProject(project.id, { dueDate: next }, "Due date updated")
    setSaving(false)
    onPreview(null)
  }
  return <button type="button" role="slider" aria-label={`Due date for ${project.name}. Drag, or use arrow keys to change it.`}
    aria-valuemin={0} aria-valuenow={daysBetween(project.assignedDate, date)} aria-valuetext={date}
    title={`Due ${monthDay(date)} · drag to change; arrows move by a day, Shift by a week`}
    disabled={saving}
    className="absolute top-1/2 z-10 flex h-10 w-4 -translate-x-1/2 -translate-y-1/2 touch-none cursor-ew-resize items-center justify-center rounded-sm bg-card/80 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
    style={{ left: `${Math.min(99, Math.max(1, position))}%`, color: project.color }}
    onPointerDown={(e) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.focus()
      e.currentTarget.setPointerCapture(e.pointerId)
      gesture.current = { x: e.clientX, width: e.currentTarget.parentElement!.getBoundingClientRect().width }
      draft.current = project.dueDate
    }}
    onPointerMove={(e) => {
      if (!gesture.current) return
      const offset = Math.round((e.clientX - gesture.current.x) / gesture.current.width * days)
      const proposed = addDays(project.dueDate, offset)
      const next = proposed < project.assignedDate ? project.assignedDate : proposed
      draft.current = next
      onPreview(next)
    }}
    onPointerUp={(e) => {
      if (!gesture.current) return
      gesture.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
      save(draft.current)
    }}
    onPointerCancel={() => { gesture.current = null; onPreview(null) }}
    onKeyDown={(e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault()
        const next = addDays(project.dueDate, (["ArrowLeft", "ArrowDown"].includes(e.key) ? -1 : 1) * (e.shiftKey ? 7 : 1))
        if (next >= project.assignedDate) { onPreview(next); save(next) }
      } else if (e.key === "Escape") { gesture.current = null; onPreview(null) }
    }}>
    <span className="h-7 w-1 border-x-2 border-current" aria-hidden />
  </button>
}
