"use client"

import { useId, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, GripVertical, Pin, Sparkles } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AGENT_NAME, ASSIGNMENT_TYPES } from "@/lib/brand"
import { pinPreferenceLabel, pinPreferences, projectHealth, type ProjectHealth } from "@/lib/analytics"
import { formatDue } from "@/lib/time"
import type { Project, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"
import { dueText, PaceTag, PinButton, ProgressBar } from "./assignment-bits"

const DUE_SOON = 3

const scrollArea = "min-h-0"

export function ProjectRail({
  data,
  today,
  className,
  onEdit,
}: {
  data: WeekData
  today: string
  className?: string
  onEdit: (p: Project) => void
}) {
  const headingId = useId()
  const health = projectHealth(data, today).sort((a, b) => a.project.dueDate.localeCompare(b.project.dueDate))
  const pinned = health
    .filter((h) => h.project.pinned)
    .sort((a, b) => a.project.pinOrder - b.project.pinOrder || a.project.dueDate.localeCompare(b.project.dueDate))
  const soon = health.filter((h) => !h.project.pinned).slice(0, DUE_SOON)
  const learned = pinPreferenceLabel(pinPreferences(data))

  const classes = [...new Set(health.map((h) => h.project.course))]
    .map((course) => {
      const items = health.filter((h) => h.project.course === course)
      const ids = new Set(items.map((h) => h.project.id))
      return {
        course,
        color: items[0].project.color,
        tasks: data.tasks.filter((t) => ids.has(t.projectId) && !t.done).length,
        next: items[0].project.dueDate,
        behind: items.some((h) => h.pace === "behind"),
      }
    })
    .sort((a, b) => a.next.localeCompare(b.next))

  return (
    <section className={cn("flex min-h-0 flex-col gap-5", className)} aria-labelledby={headingId}>
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-heading text-2xl font-medium tracking-tight">
          Overview
        </h2>
        <Link
          href="/agenda"
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          All assignments <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="flex min-h-0 flex-col">
        <SectionLabel>Classes</SectionLabel>
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open assignments. Add one with “New assignment”.</p>
        ) : (
          <ScrollArea className={scrollArea}>
            <ul className="divide-y rounded-lg border bg-card">
              {classes.map((c) => (
                <li key={c.course}>
                  <Link
                    href={`/agenda?course=${encodeURIComponent(c.course)}`}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary/60"
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.course}</span>
                    {c.behind && <span className="size-1.5 rounded-full bg-amber-500" title="Something here is behind pace" />}
                    <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {c.tasks} task{c.tasks === 1 ? "" : "s"} · {formatDue(today, c.next)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>

      <div className="flex min-h-0 flex-col">
        <SectionLabel icon={<Pin className="size-3" />}>Pinned</SectionLabel>
        {pinned.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
            Pin the assignments you want front and center. {AGENT_NAME} plans them first.
          </p>
        ) : (
          <ScrollArea className={scrollArea}>
            <PinnedList items={pinned} today={today} onEdit={onEdit} />
          </ScrollArea>
        )}
      </div>

      {soon.length > 0 && (
        <div className="flex min-h-0 flex-col">
          <SectionLabel>Due soon</SectionLabel>
          <ScrollArea className={scrollArea}>
            <ul className="divide-y rounded-lg border bg-card">
              {soon.map((h) => (
                <AssignmentRow key={h.project.id} h={h} today={today} onEdit={onEdit} />
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}

      {learned && (
        <p className="flex shrink-0 items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Sparkles className="mt-px size-3 shrink-0" />
          You pin {learned} most, so {AGENT_NAME} plans them first.
        </p>
      )}
    </section>
  )
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 flex shrink-0 items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {icon}
      {children}
    </h3>
  )
}

/** Drag the grip (mouse or touch) to reorder; arrow keys on the grip do the same. */
function PinnedList({
  items,
  today,
  onEdit,
}: {
  items: ProjectHealth[]
  today: string
  onEdit: (p: Project) => void
}) {
  const { api } = useApp()
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null)
  const [reordering, setReordering] = useState(false)
  const dragRef = useRef<{ id: string; order: string[] } | null>(null)
  const reorderLock = useRef(false)
  const rows = useRef(new Map<string, HTMLLIElement>())
  const byId = new Map(items.map((h) => [h.project.id, h]))
  const order = drag?.order ?? items.map((h) => h.project.id)

  const commit = (next: string[]) => {
    if (reorderLock.current || next.join() === items.map((h) => h.project.id).join()) return
    reorderLock.current = true
    setReordering(true)
    void Promise.resolve(api.reorderPins(next)).finally(() => {
      reorderLock.current = false
      setReordering(false)
    })
  }

  const onMove = (e: React.PointerEvent) => {
    const current = dragRef.current
    if (!current) return
    const others = current.order.filter((id) => id !== current.id)
    let index = others.length
    for (let i = 0; i < others.length; i++) {
      const rect = rows.current.get(others[i])?.getBoundingClientRect()
      if (rect && e.clientY < rect.top + rect.height / 2) {
        index = i
        break
      }
    }
    const next = [...others.slice(0, index), current.id, ...others.slice(index)]
    if (next.join() !== current.order.join()) {
      const updated = { id: current.id, order: next }
      dragRef.current = updated
      setDrag(updated)
    }
  }

  const nudge = (id: string, by: number) => {
    const ids = items.map((h) => h.project.id)
    const from = ids.indexOf(id)
    const to = Math.max(0, Math.min(ids.length - 1, from + by))
    if (from === to) return
    ids.splice(to, 0, ...ids.splice(from, 1))
    commit(ids)
  }

  return (
    <ul className="divide-y rounded-lg border bg-card">
      {order.map((id) => {
        const h = byId.get(id)
        if (!h) return null
        return (
          <AssignmentRow
            key={id}
            h={h}
            today={today}
            onEdit={onEdit}
            ref={(el) => {
              if (el) rows.current.set(id, el)
              else rows.current.delete(id)
            }}
            dragging={drag?.id === id}
            handle={
              <button
                type="button"
                aria-label={`Reorder ${h.project.name}. Use the up and down arrow keys.`}
                disabled={reordering}
                className="-ml-1.5 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
                onPointerDown={(e) => {
                  if (reorderLock.current || e.button !== 0) return
                  e.currentTarget.setPointerCapture(e.pointerId)
                  const next = { id, order: items.map((x) => x.project.id) }
                  dragRef.current = next
                  setDrag(next)
                }}
                onPointerMove={onMove}
                onPointerUp={() => {
                  const current = dragRef.current
                  dragRef.current = null
                  setDrag(null)
                  if (current) commit(current.order)
                }}
                onPointerCancel={() => {
                  dragRef.current = null
                  setDrag(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault()
                    nudge(id, e.key === "ArrowUp" ? -1 : 1)
                  }
                }}
              >
                <GripVertical className="size-3.5" />
              </button>
            }
          />
        )
      })}
    </ul>
  )
}

function AssignmentRow({
  h,
  today,
  onEdit,
  handle,
  dragging,
  ref,
}: {
  h: ProjectHealth
  today: string
  onEdit: (p: Project) => void
  handle?: React.ReactNode
  dragging?: boolean
  ref?: React.Ref<HTMLLIElement>
}) {
  return (
    <li ref={ref} className={cn("bg-card px-3 py-2 transition-shadow", dragging && "relative z-10 shadow-md ring-1 ring-primary/30")}>
      <div className="flex items-center gap-2">
        {handle}
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: h.project.color }} aria-hidden />
        <button
          type="button"
          onClick={() => onEdit(h.project)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {h.project.name}
        </button>
        <PinButton project={h.project} className="-mr-1.5" />
      </div>
      <div className={cn("mt-1 flex items-center gap-2 text-xs text-muted-foreground", handle ? "pl-8" : "pl-4")}>
        <span className="whitespace-nowrap">{ASSIGNMENT_TYPES[h.project.type]}</span>
        <span aria-hidden>·</span>
        <span className={cn("whitespace-nowrap", h.daysLeft <= 1 && "font-medium text-foreground")}>
          {dueText(today, h.project.dueDate)}
        </span>
        <span className="flex-1" />
        <PaceTag pace={h.pace} />
      </div>
      <div className={cn("mt-1.5 flex items-center gap-2", handle ? "pl-8" : "pl-4")}>
        <ProgressBar percent={h.percent} color={h.project.color} className="flex-1" />
        <span className="w-8 text-right text-[11px] text-muted-foreground tabular-nums">{h.percent}%</span>
      </div>
    </li>
  )
}
