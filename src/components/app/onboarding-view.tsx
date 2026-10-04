"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  Anchor,
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Check,
  Lighthouse,
  GanttChart,
  History,
  Layers,
  ListTodo,
  Loader2,
  MessageCircleHeart,
  Sun,
  Waves,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AGENT_NAME, APP_NAME, APP_TAGLINE, ASSIGNMENT_TYPES, GUIDANCE_MODES } from "@/lib/brand"
import { addDays } from "@/lib/time"
import type { AssignmentType, GuidanceMode } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"
import { CourseField } from "./course-field"
import { ScreenTimePreview } from "./screen-time-preview"
import { TillyOrb } from "./voice-agent"

export const ONBOARDED_KEY = "tilly:onboarded"
const REPLAY_WELCOME = "tilly:replay-welcome"

const STEPS = ["Welcome", "Guidance", "Extras", "First assignment", "Tour"] as const
const MODE_ICONS = { anchor: Anchor, coach: Lighthouse, autopilot: Waves }

export function OnboardingView() {
  const { data, today, api } = useApp()
  const router = useRouter()
  const [step, setStep] = useState(0)
  // null means "user hasn't touched this step" — keep showing and saving the live setting.
  // A captured useState(data.settings…) goes stale if Settings is changed while this page is open,
  // and Continue would write the old value back.
  const [modePick, setModePick] = useState<GuidanceMode | null>(null)
  const [checkPick, setCheckPick] = useState<boolean | null>(null)
  const [plannerPick, setPlannerPick] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const mode = modePick ?? data.settings.guidanceMode
  const checkIn = checkPick ?? data.settings.checkInEnabled
  const planner = plannerPick ?? data.settings.aiPlannerEnabled

  const restart = useCallback(() => {
    setStep(0)
    setModePick(null)
    setCheckPick(null)
    setPlannerPick(null)
  }, [])

  useEffect(() => {
    window.addEventListener(REPLAY_WELCOME, restart)
    return () => window.removeEventListener(REPLAY_WELCOME, restart)
  }, [restart])

  const next = async () => {
    if (saving) return
    if (step === 1 && modePick !== null && modePick !== data.settings.guidanceMode) {
      setSaving(true)
      const saved = await api.updateSettings({ guidanceMode: modePick })
      setSaving(false)
      if (!saved) return
    }
    if (step === 2 && (checkPick !== null || plannerPick !== null)) {
      setSaving(true)
      const saved = await api.updateSettings({
        ...(checkPick !== null ? { checkInEnabled: checkPick } : {}),
        ...(plannerPick !== null ? { aiPlannerEnabled: plannerPick } : {}),
      })
      setSaving(false)
      if (!saved) return
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const finish = (href = "/") => {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1")
    } catch {
      // Storage can throw in private mode; still leave the tour.
    }
    router.push(href)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-8 flex items-center gap-2" aria-label="Onboarding progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span className={cn("h-1.5 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
            <span className={cn("hidden text-[11px] sm:block", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && <Welcome />}
      {step === 1 && <GuidanceStep mode={mode} setMode={setModePick} />}
      {step === 2 && <ExtrasStep checkIn={checkIn} setCheckIn={setCheckPick} planner={planner} setPlanner={setPlannerPick} />}
      {step === 3 && <AssignmentStep today={today} onAdded={() => setStep(4)} />}
      {step === 4 && <TourStep onFinish={finish} onRestart={restart} />}

      {step < 4 && (
        <div className="mt-8 flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={saving} onClick={() => (step === 0 ? finish() : setStep(step - 1))}>
            {step === 0 ? (
              "Skip setup"
            ) : (
              <>
                <ArrowLeft /> Back
              </>
            )}
          </Button>
          <Button size="lg" onClick={next} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {step === 0 ? "Set me up — about a minute" : step === 3 ? "Skip — use the demo assignments" : "Continue"}
            <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  )
}

function StepHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-medium tracking-wide text-primary uppercase">{eyebrow}</p>
      <h1 className="mt-1 font-heading text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
      {children && <p className="mt-2 max-w-2xl text-muted-foreground">{children}</p>}
    </div>
  )
}

function Welcome() {
  const points = [
    {
      icon: History,
      title: "Look back first",
      body: "See what you actually did versus what you planned — hours, not guilt. No more adding up your calendar by hand.",
    },
    {
      icon: Layers,
      title: "Blocks that know your tasks",
      body: "Every work block shows how much time you've already put into that task, so starting feels like continuing.",
    },
    {
      icon: MessageCircleHeart,
      title: `${AGENT_NAME} renegotiates for you`,
      body: "Plans blew up? Say “I'm ordering pizza instead” and she reshuffles the rest of your week.",
    },
  ]
  return (
    <>
      <StepHeader eyebrow={`Welcome to ${APP_NAME}`} title={APP_TAGLINE}>
        {APP_NAME} is a calendar for people who are tired of planning perfect weeks that never happen. The AI
        doesn&apos;t reflect for you — it does the tallying so reflecting takes seconds.
      </StepHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        {points.map((p) => (
          <div key={p.title} className="rounded-2xl border bg-card p-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <p.icon className="size-5" />
            </span>
            <p className="mt-4 font-medium">{p.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>
    </>
  )
}

function GuidanceStep({ mode, setMode }: { mode: GuidanceMode; setMode: (m: GuidanceMode) => void }) {
  const examples: Record<GuidanceMode, string> = {
    anchor: "“Could you give it 25 minutes instead of moving it?”",
    coach: "“How about 2pm tomorrow? Tap yes and it's done.”",
    autopilot: "“I moved Project 4 to tomorrow morning — undo if you'd rather not.”",
  }
  return (
    <>
      <StepHeader eyebrow="Step 1" title={`How much should ${AGENT_NAME} step in?`}>
        You can change this any time from the mode button in the top bar.
      </StepHeader>
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Guidance mode">
        {(Object.keys(GUIDANCE_MODES) as GuidanceMode[]).map((m) => {
          const meta = GUIDANCE_MODES[m]
          const Icon = MODE_ICONS[m]
          const selected = mode === m
          return (
            <button
              key={m}
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(m)}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-5 text-left transition-colors",
                selected ? "border-primary ring-2 ring-primary/20" : "hover:bg-secondary/60",
              )}
            >
              {selected && (
                <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
              )}
              <Icon className="size-6 text-primary" />
              <p className="mt-3 font-medium">{meta.label}</p>
              <p className="text-xs text-muted-foreground">{meta.short}</p>
              <p className="mt-2 text-sm text-muted-foreground">{meta.description}</p>
              <p className="mt-auto pt-4 text-sm italic">{examples[m]}</p>
            </button>
          )
        })}
      </div>
    </>
  )
}

function ExtrasStep({
  checkIn,
  setCheckIn,
  planner,
  setPlanner,
}: {
  checkIn: boolean
  setCheckIn: (v: boolean) => void
  planner: boolean
  setPlanner: (v: boolean) => void
}) {
  return (
    <>
      <StepHeader eyebrow="Step 2" title="Pick your extras">
        Everything here is optional. Turn on what sounds useful — more signal means sharper suggestions, but the
        basics work without any of it.
      </StepHeader>
      <div className="space-y-3">
        <ExtraCard
          title="Daily check-in"
          body={`Once a day, rate how the day felt from 1 to 10. That's it. Over time ${APP_NAME} spots things like “late nights → rough next days”.`}
          checked={checkIn}
          onChange={setCheckIn}
        >
          <div className="grid grid-cols-10 gap-1" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "flex h-7 items-center justify-center rounded-md border text-xs tabular-nums",
                  i === 6 && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {i + 1}
              </span>
            ))}
          </div>
        </ExtraCard>
        <ExtraCard
          title="Tilly planner suggestions"
          body={`Enable the optional ${AGENT_NAME} suggestions dropdown below manual block creation on the Plan page. Open it when you want help splitting a time window across your tasks.`}
          checked={planner}
          onChange={setPlanner}
        >
          <ul className="space-y-1.5 text-xs" aria-hidden>
            {[
              ["1:00 – 2:30pm", "Profile & optimize", "#7C83D6"],
              ["2:45 – 3:45pm", "Pitch deck + demo script", "#D9776A"],
              ["4:00 – 5:00pm", "Read ch. 9–10 + notes", "#5FA3B8"],
            ].map(([time, title, color]) => (
              <li key={title} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                <span className="h-4 w-1 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-muted-foreground tabular-nums">{time}</span>
                <span className="truncate font-medium">{title}</span>
              </li>
            ))}
          </ul>
        </ExtraCard>
        <ExtraCard
          title="Screen time insights"
          badge="Coming soon"
          body={`A small browser extension notices which sites you're on during a work block, so ${APP_NAME} logs the time you actually focused — not just the time you blocked out. Nothing leaves your device except per-domain totals.`}
          checked={false}
          disabled
          onChange={() => {}}
        >
          <ScreenTimePreview />
        </ExtraCard>
      </div>
    </>
  )
}

function ExtraCard({
  title,
  body,
  badge,
  checked,
  disabled,
  onChange,
  children,
}: {
  title: string
  body: string
  badge?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-4 rounded-2xl border bg-card p-5 md:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="flex items-center gap-3">
          <Switch checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(Boolean(v))} aria-label={title} />
          <p className="font-medium">{title}</p>
          {badge && <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">{badge}</span>}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
      <div className={cn(!checked && !disabled && "opacity-50")}>{children}</div>
    </div>
  )
}

function AssignmentStep({ today, onAdded }: { today: string; onAdded: () => void }) {
  const { data, api } = useApp()
  const [name, setName] = useState("")
  const [course, setCourse] = useState("")
  const [type, setType] = useState<AssignmentType>("homework")
  const [hours, setHours] = useState("3")
  const [due, setDue] = useState(addDays(today, 7))
  const [saving, setSaving] = useState(false)
  const courses = [...new Set(data.projects.map((p) => p.course))]

  return (
    <>
      <StepHeader eyebrow="Step 3" title="What's on your plate?">
        Add one real assignment to see how {APP_NAME} estimates it. Tag the course and type — that&apos;s how it
        learns that, say, EECS projects take you longer than EECS homeworks. Or skip and explore the demo week.
      </StepHeader>
      <form
        className="space-y-4 rounded-2xl border bg-card p-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setSaving(true)
          const ok = await api.createProject({
            name,
            course,
            type,
            targetMinutes: Math.round(Number(hours) * 60),
            assignedDate: today,
            dueDate: due,
            firstTask: `Start ${name}`,
          })
          setSaving(false)
          if (ok) onAdded()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ob-name">Assignment</Label>
            <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="EECS 281 · Homework 8" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-course">Course</Label>
            <CourseField id="ob-course" value={course} onChange={setCourse} courses={courses} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ASSIGNMENT_TYPES) as AssignmentType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm transition-colors",
                  type === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary",
                )}
              >
                {ASSIGNMENT_TYPES[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="ob-hours">Estimate (hr)</Label>
            <Input id="ob-hours" type="number" min={0.25} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-due">Due</Label>
            <Input id="ob-due" type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving && <Loader2 className="animate-spin" />}
            Add it
          </Button>
        </div>
      </form>
    </>
  )
}

const TOUR = [
  {
    href: "/",
    icon: Sun,
    title: "Today",
    what: "The last three days, today, and the next three, with a timeline for each day.",
    how: [
      "Open a block to edit its date or length, log time, and update total assignment progress.",
      "Mark a task done, then report how far along the assignment is — estimates update from your pace.",
      "Rate the day 1–10 at the bottom, if you turned check-ins on.",
      "Turn Tilly insights on or off here. Looking back stays available either way.",
    ],
  },
  {
    href: "/agenda",
    icon: ListTodo,
    title: "Agenda",
    what: "Every assignment and upcoming event, with a month calendar showing how busy each day is.",
    how: [
      "Filter by class or category and sort assignments by what's due or needs attention.",
      "Pick a day to see its blocks and deadlines.",
      "Schedule focus time or a personal event, with location, meeting link, notes, and custom repeats.",
    ],
  },
  {
    href: "/plan",
    icon: CalendarRange,
    title: "Plan",
    what: "A week grid for blocking out time without deciding every minute.",
    how: [
      "Drag across a day (or tap on mobile) to carve out a block.",
      "Drag existing blocks between days; use the lower edge to resize, or open Edit block.",
      `${AGENT_NAME} suggestions are optional. Enable them on this page, then open the dropdown below manual creation.`,
    ],
  },
  {
    href: "/rhythm",
    icon: Activity,
    title: "Analytics",
    what: "Focused time, active days, and work patterns from your time logs.",
    how: [
      "Switch between week and month, and group by assignment, course, or type.",
      "Summary stats and day-by-day strips show when you worked.",
      "Show or hide Patterns. These observations are calculated from your logs.",
    ],
  },
  {
    href: "/timeline",
    icon: GanttChart,
    title: "Timeline",
    what: "Every assignment from the day it was given to the day it's due.",
    how: [
      "The solid fill starts the day you began and grows with your progress.",
      "If the fill reaches the today line, you're on pace. If not, it says how far behind.",
      "Drag a bar’s right edge or edit its date field to change the deadline. Open the assignment to edit its estimate.",
    ],
  },
]

function TourStep({ onFinish, onRestart }: { onFinish: (href?: string) => void; onRestart: () => void }) {
  return (
    <>
      <StepHeader eyebrow="You're set" title={`Here's how ${APP_NAME} works`}>
        Five views, one assistant. The demo week is loaded so everything has something to show.
      </StepHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {TOUR.map((t, i) => (
          <div key={t.href} className="flex flex-col rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <t.icon className="size-4" />
              </span>
              <div>
                <p className="text-[11px] text-muted-foreground">Stop {i + 1}</p>
                <p className="font-medium">{t.title}</p>
              </div>
            </div>
            <p className="mt-3 text-sm">{t.what}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {t.how.map((h) => (
                <li key={h} className="flex gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {h}
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" className="mt-4 self-start" onClick={() => onFinish(t.href)}>
              Open {t.title} <ArrowRight />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col items-start gap-4 rounded-2xl border bg-accent/50 p-5 sm:flex-row sm:items-center">
        <TillyOrb />
        <div className="flex-1">
          <p className="font-medium">And {AGENT_NAME}, everywhere</p>
          <p className="text-sm text-muted-foreground">
            The button in the bottom-right corner. Talk or type when plans change: “I only have 20 minutes”, “move my
            evening work to tomorrow”, “I&apos;m ordering pizza instead”.
          </p>
        </div>
      </div>
      <div className="mt-8 flex justify-end">
        <Button size="lg" onClick={() => onFinish("/")}>
          Take me to Today <ArrowRight />
        </Button>
      </div>
      <p className="mt-3 text-right text-xs text-muted-foreground">
        You can replay this from{" "}
        <Link
          href="/welcome"
          className="underline"
          onClick={(e) => {
            e.preventDefault()
            onRestart()
          }}
        >
          /welcome
        </Link>{" "}
        or the settings dialog.
      </p>
    </>
  )
}
