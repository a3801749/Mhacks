// Rename here and it updates everywhere.
export const APP_NAME = "Tide"
export const APP_TAGLINE = "A calendar that looks back before it plans ahead."

export const AGENT_NAME = "Tilly"

export const GUIDANCE_MODES = {
  anchor: {
    label: "Anchor",
    short: "Strict baseline",
    description:
      "Your plan is the plan. Tilly never moves blocks on her own — she nudges you to keep them, and only suggests changes.",
  },
  coach: {
    label: "Lighthouse",
    short: "Propose, you approve",
    description:
      "Tilly lights up a better route and proposes adjustments. Nothing changes until you say yes.",
  },
  autopilot: {
    label: "Tide",
    short: "Adapts on its own",
    description:
      "Tilly reshuffles your schedule automatically based on how you've actually been working. You can always undo.",
  },
} as const

export const ASSIGNMENT_TYPES = {
  project: "Project",
  exam: "Exam",
  homework: "Homework",
  reading: "Reading",
  misc: "Misc",
} as const

export const PRIORITIES = {
  accuracy: { label: "Accuracy", short: "Accuracy", weight: 1.35 },
  completion: { label: "Completion", short: "Completion", weight: 1 },
  flexible: { label: "Flexible", short: "Flexible", weight: 0.8 },
  optional: { label: "Optional", short: "Optional", weight: 0.5 },
} as const
