// Working name until the team picks one. Rename here and it updates everywhere.
export const APP_NAME = "Ebb"
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
    label: "Coach",
    short: "Propose, you approve",
    description:
      "Tilly negotiates with you and proposes adjustments. Nothing changes until you say yes.",
  },
  autopilot: {
    label: "Tide",
    short: "Adapts on its own",
    description:
      "Tilly reshuffles your schedule automatically based on how you've actually been working. You can always undo.",
  },
} as const
