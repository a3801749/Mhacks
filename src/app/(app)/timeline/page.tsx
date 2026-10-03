import type { Metadata } from "next"
import { TimelineView } from "@/components/app/timeline-view"

export const metadata: Metadata = { title: "Timeline" }

export default function TimelinePage() {
  return <TimelineView />
}
