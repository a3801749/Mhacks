"use client"

import Link from "next/link"
import { ArrowRight, Pin, Sparkles } from "lucide-react"
import { AGENT_NAME, ASSIGNMENT_TYPES } from "@/lib/brand"
import { pinPreferenceLabel, pinPreferences, projectHealth, type ProjectHealth } from "@/lib/analytics"
import { formatDue } from "@/lib/time"
import type { Project, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { dueText, PaceTag, PinButton, ProgressBar } from "./assignment-bits"

const DUE_SOON = 3

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
  const health = projectHealth(data, today).sort((a, b) => a.project.dueDate.localeCompare(b.project.dueDate))
  const pinned = health.filter((h) => h.project.pinned)
  const soon = health.filter((h) => !h.project.pinned).slice(0, DUE_SOON)
  const learned = pinPreferenceLabel(pinPreferences(data))

  const classes = [...new Set(health.map((h) => h.project.course))]
    .map((course) => {
      const items = health.filter((h) => h.project.course === course)
      return {
        course,
        color: items[0].project.color,
        open: items.length,
        next: items[0].project.dueDate,
        behind: items.some((h) => h.pace === "behind"),
      }
    })
    .sort((a, b) => a.next.localeCompare(b.next))

  return (
    <section className={cn("space-y-5", className)} aria-labelledby="overview-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="overview-heading" className="font-heading text-lg font-medium">
          Overview
        </h2>
        <Link href="/agenda" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          All assignments <ArrowRight className="size-3" />
        </Link>
      </div>

      <div>
        <SectionLabel>Classes</SectionLabel>
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open assignments. Add one with “New assignment”.</p>
        ) : (
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
                    {c.open} open · {formatDue(today, c.next)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <SectionLabel icon={<Pin className="size-3" />}>Pinned</SectionLabel>
        {pinned.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
            Pin the assignments you want front and center. {AGENT_NAME} plans them first.
          </p>
        ) : (
          <AssignmentList items={pinned} today={today} onEdit={onEdit} />
        )}
      </div>

      {soon.length > 0 && (
        <div>
          <SectionLabel>Due soon</SectionLabel>
          <AssignmentList items={soon} today={today} onEdit={onEdit} />
        </div>
      )}

      {learned && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Sparkles className="mt-px size-3 shrink-0" />
          You pin {learned} most, so {AGENT_NAME} plans them first.
        </p>
      )}
    </section>
  )
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {icon}
      {children}
    </h3>
  )
}

function AssignmentList({
  items,
  today,
  onEdit,
}: {
  items: ProjectHealth[]
  today: string
  onEdit: (p: Project) => void
}) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {items.map((h) => (
        <li key={h.project.id} className="px-3 py-2">
          <div className="flex items-center gap-2">
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
          <div className="mt-1 flex items-center gap-2 pl-4 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">{ASSIGNMENT_TYPES[h.project.type]}</span>
            <span aria-hidden>·</span>
            <span className={cn("whitespace-nowrap", h.daysLeft <= 1 && "font-medium text-foreground")}>
              {dueText(today, h.project.dueDate)}
            </span>
            <span className="flex-1" />
            <PaceTag pace={h.pace} />
          </div>
          <div className="mt-1.5 flex items-center gap-2 pl-4">
            <ProgressBar percent={h.percent} color={h.project.color} className="flex-1" />
            <span className="w-8 text-right text-[11px] text-muted-foreground tabular-nums">{h.percent}%</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
