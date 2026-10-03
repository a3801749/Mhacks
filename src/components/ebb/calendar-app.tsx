"use client"

import { useCallback, useState } from "react"
import { Anchor, Compass, RefreshCw, SlidersHorizontal, Waves } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { APP_NAME, APP_TAGLINE, AGENT_NAME, GUIDANCE_MODES } from "@/lib/brand"
import type { CalendarEvent } from "@/lib/types"
import { useClock, useWeek } from "@/hooks/use-week"
import { BlockDialog } from "./block-dialog"
import { DayStrip, DayTimeline, windowDates } from "./day-view"
import { ProjectRail } from "./project-rail"
import { ReflectPanel } from "./reflect-panel"
import { SettingsDialog } from "./settings-dialog"
import { TillyOrb, VoiceAgent } from "./voice-agent"

const MODE_ICON = { anchor: Anchor, coach: Compass, autopilot: Waves }

export function CalendarApp() {
  const now = useClock()
  const api = useWeek(now?.date ?? null)
  const { data, error, integrations } = api
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [queued, setQueued] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const askAgent = useCallback((message: string) => {
    setQueued(message)
    setAgentOpen(true)
  }, [])
  const consumeQueued = useCallback(() => setQueued(null), [])

  if (error) {
    return (
      <Shell>
        <div className="mx-auto mt-24 max-w-sm rounded-2xl border bg-card p-6 text-center">
          <p className="font-heading text-xl">The tide went out.</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={api.reload}>
            <RefreshCw /> Try again
          </Button>
        </div>
      </Shell>
    )
  }

  if (!data || !now) return <LoadingState />

  const today = now.date
  const dates = windowDates(data)
  const day = selectedDay && dates.includes(selectedDay) ? selectedDay : dates.includes(today) ? today : dates[0]
  const mode = data.settings.guidanceMode
  const ModeIcon = MODE_ICON[mode]

  const calendar = (
    <div className="space-y-5">
      <DayStrip data={data} dates={dates} today={today} selected={day} onSelect={setSelectedDay} />
      <DayTimeline data={data} date={day} today={today} nowMinute={now.minute} onOpen={setOpenEvent} />
    </div>
  )

  return (
    <Shell>
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-xl leading-none font-medium">{APP_NAME}</p>
            <p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{APP_TAGLINE}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-1.5">
            <ModeIcon />
            <span className="hidden sm:inline">{GUIDANCE_MODES[mode].label} mode</span>
            <SlidersHorizontal className="sm:hidden" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-28 sm:px-6">
        <div className="hidden gap-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_370px]">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <ProjectRail data={data} today={today} />
          </aside>
          <div className="space-y-8">
            {calendar}
            <ReflectPanel data={data} today={today} api={api} className="xl:hidden" />
          </div>
          <aside className="hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto xl:pb-6">
            <ReflectPanel data={data} today={today} api={api} />
          </aside>
        </div>

        <Tabs defaultValue="calendar" className="lg:hidden">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="reflect">Reflect</TabsTrigger>
          </TabsList>
          <TabsContent value="calendar">{calendar}</TabsContent>
          <TabsContent value="projects">
            <ProjectRail data={data} today={today} className="[&>div]:flex-col [&>div]:overflow-visible [&_article]:min-w-0" />
          </TabsContent>
          <TabsContent value="reflect">
            <ReflectPanel data={data} today={today} api={api} />
          </TabsContent>
        </Tabs>
      </main>

      <button
        onClick={() => setAgentOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-full border bg-card py-2 pr-5 pl-2 shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:right-6 sm:bottom-6"
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
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="ebb-paper flex min-h-dvh flex-col">{children}</div>
}

function Logo() {
  return (
    <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        <path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity="0.6" />
      </svg>
    </span>
  )
}

function LoadingState() {
  return (
    <Shell>
      <div className="border-b px-6 py-3">
        <Skeleton className="h-9 w-40" />
      </div>
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
    </Shell>
  )
}
