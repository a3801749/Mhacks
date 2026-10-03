import type { Metadata } from "next"
import { RhythmView } from "@/components/app/rhythm-view"

export const metadata: Metadata = { title: "Rhythm" }

export default function RhythmPage() {
  return <RhythmView />
}
