"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CalendarPlus, ChevronLeft, ChevronRight, NotebookText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ASSIGNMENT_TYPES, PRIORITIES } from "@/lib/brand"
import { dayLoad, projectHealth, type Busyness, type Pace } from "@/lib/analytics"
import { addDays, daysBetween, formatRange, fromDateKey, monthDay, toDateKey, weekdayLong, weekdayShort } from "@/lib/time"
import type { AssignmentType, CalendarEvent, Project, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"
import { dueText, PaceTag, PinButton, ProgressBar, Tag } from "./assignment-bits"
import { Segmented } from "./rhythm-view"
import { ScheduleDialog, type ScheduleDraft } from "./schedule-dialog"

type SortKey = "due" | "priority" | "progress" | "remaining" | "pinned"

const SORTS: { key: SortKey; label: string }[] = [
  { key: "due", label: "Due date" },
  { key: "priority", label: "Priority" },
  { key: "pinned", label: "Pinned first" },
  { key: "progress", label: "Least progress" },
  { key: "remaining", label: "Most time left" },
]

export const BUSY_STYLE: Record<Busyness, { cell: string; label: string; swatch: string }> = {
  free: { cell: "hover:bg-secondary", label: "Open", swatch: "bg-card border" },
  light: { cell: "bg-emerald-100 text-emerald-950 hover:bg-emerald-200", label: "Okay", swatch: "bg-emerald-200" },
  medium: { cell: "bg-orange-100 text-orange-950 hover:bg-orange-200", label: "Busy", swatch: "bg-orange-200" },
  heavy: { cell: "bg-red-100 text-red-950 hover:bg-red-200", label: "Packed", swatch: "bg-red-200" },
}

interface Row {
  project: Project
  percent: number
  remaining: number
  pace: Pace
}

function rowsFor(data: WeekData, today: string, includeFinished: boolean): Row[] {
  const active: Row[] = projectHealth(data, today).map((h) => ({
    project: h.project,
    percent: h.percent,
    remaining: h.remaining,
    pace: h.pace,
  }))
  if (!includeFinished) return active
  const finished: Row[] = data.projects
    .filter((p) => p.completedDate)
    .map((p) => ({ project: p, percent: 100, remaining: 0, pace: "done" as const }))
  return [...active, ...finished]
}

export function AgendaView() {
  const { data, today, openBlock, editProject } = useApp()
  const params = useSearchParams()
  const [courses, setCourses] = useState<Set<string>>(() => {
    const c = params.get("course")
    return new Set(c ? [c] : [])
  })
  const [types, setTypes] = useState<Set<AssignmentType>>(new Set())
  const [show, setShow] = useState<"assignments" | "events">("assignments")
  const [sort, setSort] = useState<SortKey>("due")
  const [finished, setFinished] = useState(false)
  const [selected, setSelected] = useState(today)
  const [schedule, setSchedule] = useState<ScheduleDraft | null>(null)

  const allCourses = useMemo(() => [...new Set(data.projects.map((p) => p.course))].sort(), [data.projects])
  const projectById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects])

  const matches = (p: Project | undefined) => {
    if (!p) return courses.size === 0 && types.size === 0
    return (courses.size === 0 || courses.has(p.course)) && (types.size === 0 || types.has(p.type))
  }

  const rows = rowsFor(data, today, finished)
    .filter((r) => matches(r.project))
    .sort((a, b) => {
      const due = a.project.dueDate.localeCompare(b.project.dueDate)
      switch (sort) {
        case "priority":
          return PRIORITIES[b.project.priority].weight - PRIORITIES[a.project.priority].weight || due
        case "pinned":
          return Number(b.project.pinned) - Number(a.project.pinned) || due
        case "progress":
          return a.percent - b.percent || due
        case "remaining":
          return b.remaining - a.remaining || due
        default:
          return due
      }
    })

  const events = data.events
    .filter((e) => e.date >= today && e.status !== "skipped" && matches(e.projectId ? projectById.get(e.projectId) : undefined))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)

  const filtersActive = courses.size > 0 || types.size > 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-tight">Agenda</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Every assignment and event in one place. Pick a day on the calendar to see what’s on it.
          </p>
        </div>
        <Button variant="outline" onClick={() => setSchedule({ date: selected })}>
          <CalendarPlus /> Schedule event
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <aside className="space-y-4 lg:order-2 lg:sticky lg:top-20 lg:self-start">
          <MiniCalendar data={data} today={today} selected={selected} onSelect={setSelected} />
          <DayDetail
            data={data}
            date={selected}
            today={today}
            onOpenEvent={openBlock}
            onOpenProject={editProject}
            onSchedule={() => setSchedule({ date: selected })}
          />
        </aside>

        <section className="min-w-0 space-y-4 lg:order-1" aria-label="Assignments and events">
          <div className="space-y-3 rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                options={[
                  { key: "assignments", label: `Assignments` },
                  { key: "events", label: `Events` },
                ]}
                value={show}
                onChange={setShow}
              />
              <div className="flex-1" />
              {show === "assignments" && (
                <>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={finished}
                      onChange={(e) => setFinished(e.target.checked)}
                      className="accent-primary"
                    />
                    Show finished
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Sort
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortKey)}
                      className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground"
                    >
                      {SORTS.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <ChipRow
              label="Classes"
              options={allCourses.map((c) => ({ key: c, label: c, color: data.projects.find((p) => p.course === c)?.color }))}
              value={courses}
              onChange={setCourses}
            />
            <ChipRow
              label="Category"
              options={(Object.keys(ASSIGNMENT_TYPES) as AssignmentType[]).map((t) => ({ key: t, label: ASSIGNMENT_TYPES[t] }))}
              value={types}
              onChange={setTypes}
            />
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setCourses(new Set())
                  setTypes(new Set())
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" /> Clear filters
              </button>
            )}
          </div>

          {show === "assignments" ? (
            <AssignmentTable rows={rows} today={today} onEdit={editProject} />
          ) : (
            <EventList events={events} projectById={projectById} today={today} onOpen={openBlock} />
          )}
        </section>
      </div>

      <ScheduleDialog draft={schedule} onClose={() => setSchedule(null)} />
    </div>
  )
}

function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { key: T; label: string; color?: string }[]
  value: Set<T>
  onChange: (v: Set<T>) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="w-16 shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      {options.map((o) => {
        const on = value.has(o.key)
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = new Set(value)
              if (on) next.delete(o.key)
              else next.add(o.key)
              onChange(next)
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary",
            )}
          >
            {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function AssignmentTable({
  rows,
  today,
  onEdit,
}: {
  rows: Row[]
  today: string
  onEdit: (p: Project) => void
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nothing matches these filters.
      </p>
    )
  }
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((r) => {
        const p = r.project
        const overdue = !p.completedDate && p.dueDate < today
        return (
          <li key={p.id} className="flex items-start gap-2 px-3 py-3 sm:items-center">
            <PinButton project={p} className="mt-0.5 sm:mt-0" />
            <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1fr)_110px_150px] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                  <button
                    type="button"
                    onClick={() => onEdit(p)}
                    className="truncate text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    {p.name}
                  </button>
                  {p.notes && (
                    <NotebookText className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has notes" />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 pl-4">
                  <Tag className="bg-secondary text-secondary-foreground">{p.course}</Tag>
                  <Tag>{ASSIGNMENT_TYPES[p.type]}</Tag>
                  <Tag>{PRIORITIES[p.priority].label}</Tag>
                </div>
                {p.notes && <p className="mt-1 truncate pl-4 text-xs text-muted-foreground">{p.notes}</p>}
              </div>
              <div className={cn("mt-2 pl-4 text-xs sm:mt-0 sm:pl-0", overdue ? "text-red-700" : "text-muted-foreground")}>
                <span className="font-medium text-foreground">{monthDay(p.dueDate)}</span>{" "}
                <span className="sm:block">{p.completedDate ? "Finished" : dueText(today, p.dueDate)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 pl-4 sm:mt-0 sm:pl-0">
                <ProgressBar percent={r.percent} color={p.color} className="flex-1" />
                <span className="w-8 text-right text-[11px] text-muted-foreground tabular-nums">{r.percent}%</span>
                <PaceTag pace={r.pace} className="sm:hidden" />
              </div>
            </div>
            <PaceTag pace={r.pace} className="hidden w-24 justify-center sm:inline-flex" />
          </li>
        )
      })}
    </ul>
  )
}

function EventList({
  events,
  projectById,
  today,
  onOpen,
}: {
  events: CalendarEvent[]
  projectById: Map<string, Project>
  today: string
  onOpen: (e: CalendarEvent) => void
}) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No upcoming events match these filters.
      </p>
    )
  }
  const byDate = new Map<string, CalendarEvent[]>()
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])
  return (
    <div className="space-y-4">
      {[...byDate.entries()].map(([date, list]) => (
        <div key={date}>
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
            {date === today ? "Today" : weekdayLong(date)} · {monthDay(date)}
          </h3>
          <ul className="divide-y rounded-lg border bg-card">
            {list.map((e) => (
              <EventRow key={e.id} event={e} project={e.projectId ? projectById.get(e.projectId) : undefined} onOpen={onOpen} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function EventRow({ event: e, project, onOpen }: { event: CalendarEvent; project?: Project; onOpen: (e: CalendarEvent) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(e)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary/60"
      >
        <span className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums">{formatRange(e.startMin, e.endMin)}</span>
        <span
          className="h-6 w-0.5 shrink-0 rounded-full"
          style={{ backgroundColor: project?.color ?? "#A8A29E" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{e.title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {project ? `${project.course} · ${project.name}` : "Personal"}
            {e.kind === "life" ? " · Event" : " · Work session"}
          </span>
        </span>
      </button>
    </li>
  )
}

function MiniCalendar({
  data,
  today,
  selected,
  onSelect,
}: {
  data: WeekData
  today: string
  selected: string
  onSelect: (d: string) => void
}) {
  const [month, setMonth] = useState(() => selected.slice(0, 7) + "-01")
  const first = fromDateKey(month)
  const lead = first.getDay()
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(month, i)),
  ]
  const shift = (n: number) => setMonth(toDateKey(new Date(first.getFullYear(), first.getMonth() + n, 1)))

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />
          const load = dayLoad(data, date)
          const style = BUSY_STYLE[load.level]
          const isSelected = date === selected
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={isSelected}
              aria-label={`${weekdayLong(date)} ${monthDay(date)}: ${style.label}${load.due.length ? `, ${load.due.length} due` : ""}`}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-md text-xs tabular-nums transition-colors",
                style.cell,
                date < today && "opacity-60",
                date === today && "font-semibold underline underline-offset-2",
                isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-card",
              )}
            >
              {fromDateKey(date).getDate()}
              {load.due.length > 0 && (
                <span className="absolute bottom-1 flex gap-0.5" aria-hidden>
                  {load.due.slice(0, 3).map((p) => (
                    <span key={p.id} className="size-1 rounded-full" style={{ backgroundColor: p.color }} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {(Object.keys(BUSY_STYLE) as Busyness[]).map((b) => (
          <span key={b} className="flex items-center gap-1">
            <span className={cn("size-2.5 rounded-sm", BUSY_STYLE[b].swatch)} />
            {BUSY_STYLE[b].label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="size-1 rounded-full bg-foreground/60" /> Due
        </span>
      </div>
    </div>
  )
}

function DayDetail({
  data,
  date,
  today,
  onOpenEvent,
  onOpenProject,
  onSchedule,
}: {
  data: WeekData
  date: string
  today: string
  onOpenEvent: (e: CalendarEvent) => void
  onOpenProject: (p: Project) => void
  onSchedule: () => void
}) {
  const load = dayLoad(data, date)
  const events = data.events
    .filter((e) => e.date === date && e.status !== "skipped")
    .sort((a, b) => a.startMin - b.startMin)
  const projectById = new Map(data.projects.map((p) => [p.id, p]))
  const rel = daysBetween(today, date)
  const heading = rel === 0 ? "Today" : rel === 1 ? "Tomorrow" : rel === -1 ? "Yesterday" : weekdayShort(date)

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div>
          <h2 className="text-sm font-medium">
            {heading} · {monthDay(date)}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {BUSY_STYLE[load.level].label} · {Math.round((load.scheduledMinutes / 60) * 10) / 10}h booked
          </p>
        </div>
        {date >= today && (
          <Button size="sm" variant="outline" onClick={onSchedule}>
            <CalendarPlus /> Add
          </Button>
        )}
      </div>
      {load.due.length > 0 && (
        <div className="border-b px-3 py-2">
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Due</p>
          <ul className="space-y-1">
            {load.due.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject(p)}
                  className="flex w-full items-center gap-2 text-left text-sm hover:underline"
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {events.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">Nothing booked{date >= today ? " yet" : ""}.</p>
      ) : (
        <ul className="divide-y">
          {events.map((e) => (
            <EventRow key={e.id} event={e} project={e.projectId ? projectById.get(e.projectId) : undefined} onOpen={onOpenEvent} />
          ))}
        </ul>
      )}
    </div>
  )
}
