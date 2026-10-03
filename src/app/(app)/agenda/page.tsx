import { Suspense } from "react"
import type { Metadata } from "next"
import { AgendaView } from "@/components/app/agenda-view"

export const metadata: Metadata = { title: "Agenda" }

export default function AgendaPage() {
  return (
    <Suspense>
      <AgendaView />
    </Suspense>
  )
}
