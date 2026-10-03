"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Map as MapIcon, X } from "lucide-react"
import { APP_NAME } from "@/lib/brand"
import { ONBOARDED_KEY } from "./onboarding-view"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { windowDates } from "@/lib/analytics"
import { useApp } from "./app-shell"
import { CheckInCard } from "./check-in-card"
import { DayStrip, DayTimeline } from "./day-view"
import { ProjectRail } from "./project-rail"
import { ReflectPanel } from "./reflect-panel"

export function TodayView() {
  const { data, now, today, api, openBlock, editProject } = useApp()
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const dates = windowDates(today)
  const day = selectedDay && dates.includes(selectedDay) ? selectedDay : today

  const calendar = (
    <div className="space-y-5">
      <DayStrip data={data} dates={dates} today={today} selected={day} onSelect={setSelectedDay} />
      <DayTimeline data={data} date={day} today={today} nowMinute={now.minute} onOpen={openBlock} />
      {data.settings.checkInEnabled && day <= today && <CheckInCard date={day} />}
    </div>
  )
  const rail = <ProjectRail data={data} today={today} onEdit={editProject} />

  return (
    <>
      <TourBanner />
      <div className="hidden gap-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_370px]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-6">
          {rail}
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
          <TabsTrigger value="projects">Overview</TabsTrigger>
          <TabsTrigger value="reflect">Reflect</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar">{calendar}</TabsContent>
        <TabsContent value="projects">
          {rail}
        </TabsContent>
        <TabsContent value="reflect">
          <ReflectPanel data={data} today={today} api={api} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function TourBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setShow(!localStorage.getItem(ONBOARDED_KEY))
  }, [])
  if (!show) return null
  return (
    <div className="mb-5 flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <MapIcon className="size-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm">
        <span className="font-medium">New to {APP_NAME}?</span>{" "}
        <span className="text-muted-foreground">Take the one-minute setup and tour of how everything fits together.</span>
      </p>
      <Link
        href="/welcome"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium whitespace-nowrap text-primary-foreground"
      >
        Start tour
      </Link>
      <button
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          localStorage.setItem(ONBOARDED_KEY, "1")
          setShow(false)
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
