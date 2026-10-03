"use client"

import { useState } from "react"
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
          <TabsTrigger value="projects">Assignments</TabsTrigger>
          <TabsTrigger value="reflect">Reflect</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar">{calendar}</TabsContent>
        <TabsContent value="projects">
          <div className="[&_article]:min-w-0 [&>section>div:last-child]:flex-col [&>section>div:last-child]:overflow-visible">
            {rail}
          </div>
        </TabsContent>
        <TabsContent value="reflect">
          <ReflectPanel data={data} today={today} api={api} />
        </TabsContent>
      </Tabs>
    </>
  )
}
