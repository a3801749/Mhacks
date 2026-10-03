import type { Metadata } from "next"
import { OnboardingView } from "@/components/app/onboarding-view"

export const metadata: Metadata = { title: "Welcome" }

export default function WelcomePage() {
  return <OnboardingView />
}
