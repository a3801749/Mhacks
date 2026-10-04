"use client"

import { createContext, useCallback, useContext, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Anchor, CalendarDays, CalendarRange, GanttChart, GraduationCap, Lighthouse, ListTodo, Plus, RefreshCw, Sun, Waves } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AGENT_NAME, APP_NAME, APP_TAGLINE, GUIDANCE_MODES } from "@/lib/brand"
import type { CalendarEvent, Integrations, Project, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useClock, useWeek, type WeekApi } from "@/hooks/use-week"
import { BlockDialog } from "./block-dialog"
import { CourseDialog } from "./course-dialog"
import { ProjectDialog } from "./project-dialog"
import { SettingsDialog } from "./settings-dialog"
import { TillyOrb, VoiceAgent } from "./voice-agent"

interface AppContextValue {
  data: WeekData
  now: { date: string; minute: number }
  today: string
  api: WeekApi
  integrations: Integrations | null
  openBlock: (event: CalendarEvent) => void
  askAgent: (message: string) => void
  editProject: (project: Project | "new") => void
  addCourse: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used inside AppShell")
  return ctx
}

const NAV = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/agenda", label: "Agenda", icon: ListTodo },
  { href: "/plan", label: "Plan", icon: CalendarRange },
  { href: "/rhythm", label: "Analytics", icon: Activity },
  { href: "/timeline", label: "Timeline", icon: GanttChart },
]

const MODE_ICON = { anchor: Anchor, coach: Lighthouse, autopilot: Waves }

export function AppShell({ children }: { children: React.ReactNode }) {
  const now = useClock()
  const api = useWeek(now?.date ?? null)
  const { data, error, integrations } = api
  const pathname = usePathname()
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [queued, setQueued] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [project, setProject] = useState<Project | "new" | null>(null)
  const [courseOpen, setCourseOpen] = useState(false)
  const addCourse = useCallback(() => setCourseOpen(true), [])

  const askAgent = useCallback((message: string) => {
    setQueued(message)
    setAgentOpen(true)
  }, [])
  const consumeQueued = useCallback(() => setQueued(null), [])

  const header = (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Logo />
          <span className="min-w-0">
            <span className="block font-heading text-xl leading-none font-medium">{APP_NAME}</span>
            <span className="mt-0.5 hidden truncate text-xs text-muted-foreground xl:block">{APP_TAGLINE}</span>
          </span>
        </Link>
        <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={pathname === item.href} />
          ))}
        </nav>
        <div className="flex-1" />
        {data && (
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-1.5">
            {(() => {
              const Icon = MODE_ICON[data.settings.guidanceMode]
              return <Icon />
            })()}
            <span className="hidden sm:inline">{GUIDANCE_MODES[data.settings.guidanceMode].label} mode</span>
          </Button>
        )}
        {data && (
          <Button variant="outline" size="sm" onClick={addCourse} className="gap-1.5" aria-label="Add a class">
            <GraduationCap />
            <span className="hidden lg:inline">Add class</span>
          </Button>
        )}
        {data && (
          <Button size="sm" onClick={() => setProject("new")} className="gap-1.5">
            <Plus />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New assignment</span>
          </Button>
        )}
      </div>
      <nav className="flex border-t md:hidden" aria-label="Main">
        {NAV.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                active ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )

  if (error) {
    return (
      <Paper>
        {header}
        <div className="mx-auto mt-24 max-w-sm rounded-2xl border bg-card p-6 text-center">
          <p className="font-heading text-xl">The tide went out.</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={api.reload}>
            <RefreshCw /> Try again
          </Button>
        </div>
      </Paper>
    )
  }

  if (!data || !now) {
    return (
      <Paper>
        {header}
        <LoadingState />
      </Paper>
    )
  }

  const value: AppContextValue = {
    data,
    now,
    today: now.date,
    api,
    integrations,
    openBlock: setOpenEvent,
    askAgent,
    editProject: setProject,
    addCourse,
  }

  return (
    <AppContext.Provider value={value}>
      <Paper>
        {header}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-28 sm:px-6">{children}</main>

        <button
          onClick={() => setAgentOpen(true)}
          className="fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-full border bg-card py-2 pr-5 pl-2 shadow-md transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:right-6 sm:bottom-6"
        >
          <TillyOrb />
          <span className="text-left">
            <span className="block text-sm font-medium">Talk to {AGENT_NAME}</span>
            <span className="block text-xs text-muted-foreground">Plans changed? Say so.</span>
          </span>
        </button>

        <BlockDialog
          event={openEvent}
          data={data}
          api={api}
          open={openEvent !== null}
          onOpenChange={(o) => !o && setOpenEvent(null)}
          onAskAgent={askAgent}
        />
        <VoiceAgent
          open={agentOpen}
          onOpenChange={setAgentOpen}
          data={data}
          api={api}
          now={now}
          integrations={integrations}
          queued={queued}
          onQueuedConsumed={consumeQueued}
        />
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          data={data}
          api={api}
          integrations={integrations}
        />
        <CourseDialog open={courseOpen} onClose={() => setCourseOpen(false)} />
        <ProjectDialog project={project} onClose={() => setProject(null)} data={data} api={api} today={now.date} />
      </Paper>
    </AppContext.Provider>
  )
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof CalendarDays; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  )
}

function Paper({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-background">{children}</div>
}

function Logo() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        <path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity="0.6" />
      </svg>
    </span>
  )
}

function LoadingState() {
  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-6 px-6 pt-5 lg:grid-cols-[280px_1fr] xl:grid-cols-[290px_1fr_370px]">
      <div className="hidden space-y-3 lg:block">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="hidden h-96 rounded-2xl xl:block" />
    </div>
  )
}
