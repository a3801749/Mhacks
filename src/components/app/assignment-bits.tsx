"use client"

import { Pin } from "lucide-react"
import type { Pace } from "@/lib/analytics"
import { formatDue } from "@/lib/time"
import type { Project } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"

export const PACE_COPY: Record<Pace, { label: string; className: string; dot: string }> = {
  done: { label: "Done", className: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  ahead: { label: "Ahead", className: "bg-teal-50 text-teal-800 border-teal-200", dot: "bg-teal-500" },
  "on-track": { label: "On pace", className: "bg-sky-50 text-sky-800 border-sky-200", dot: "bg-sky-500" },
  behind: { label: "Behind pace", className: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
}

export function PaceTag({ pace, className }: { pace: Pace; className?: string }) {
  const p = PACE_COPY[pace]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        p.className,
        className,
      )}
    >
      {p.label}
    </span>
  )
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-sm border px-1.5 py-0.5 text-[10px] whitespace-nowrap text-muted-foreground", className)}>
      {children}
    </span>
  )
}

export function PinButton({ project, className }: { project: Project; className?: string }) {
  const { api } = useApp()
  return (
    <button
      type="button"
      aria-pressed={project.pinned}
      aria-label={project.pinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
      title={project.pinned ? "Unpin" : "Pin"}
      onClick={() => api.togglePin(project.id, !project.pinned)}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        project.pinned ? "text-primary" : "text-muted-foreground/60 hover:text-foreground",
        className,
      )}
    >
      <Pin className={cn("size-3.5", project.pinned && "fill-current")} />
    </button>
  )
}

export function ProgressBar({ percent, color, className }: { percent: number; color: string; className?: string }) {
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(percent, 2)}%`, backgroundColor: color }}
      />
    </div>
  )
}

export function dueText(today: string, date: string) {
  const d = formatDue(today, date)
  if (d === "Overdue") return d
  return d === "Today" || d === "Tomorrow" ? `Due ${d.toLowerCase()}` : `Due ${d}`
}
