import type { Metadata } from "next"
import { PlannerView } from "@/components/app/planner-view"

export const metadata: Metadata = { title: "Plan" }

export default function PlanPage() {
  return <PlannerView />
}
