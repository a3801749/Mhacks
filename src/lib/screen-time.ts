// Shape of what the browser extension will report for a work block.
// Until the extension exists, DEMO_BLOCK_USAGE drives the preview UI.

export type SiteCategory = "focus" | "reference" | "distraction" | "idle"

export interface SiteUsage {
  domain: string
  minutes: number
  category: SiteCategory
}

export interface BlockUsage {
  blockTitle: string
  plannedMinutes: number
  sites: SiteUsage[]
}

export const DEMO_BLOCK_USAGE: BlockUsage = {
  blockTitle: "Draft methods section",
  plannedMinutes: 120,
  sites: [
    { domain: "overleaf.com", minutes: 58, category: "focus" },
    { domain: "scholar.google.com", minutes: 17, category: "reference" },
    { domain: "docs.google.com", minutes: 9, category: "focus" },
    { domain: "youtube.com", minutes: 14, category: "distraction" },
    { domain: "instagram.com", minutes: 8, category: "distraction" },
    { domain: "Away / idle", minutes: 14, category: "idle" },
  ],
}

export const CATEGORY_META: Record<SiteCategory, { label: string; color: string }> = {
  focus: { label: "On task", color: "#3E8F95" },
  reference: { label: "Research", color: "#7C83D6" },
  distraction: { label: "Drift", color: "#D9776A" },
  idle: { label: "Away", color: "#C8C2B8" },
}

export function focusSummary(usage: BlockUsage) {
  const total = usage.sites.reduce((s, x) => s + x.minutes, 0)
  const by = (c: SiteCategory) => usage.sites.filter((s) => s.category === c).reduce((s, x) => s + x.minutes, 0)
  const onTask = by("focus") + by("reference")
  return {
    total,
    onTask,
    drift: by("distraction"),
    idle: by("idle"),
    focusPercent: total ? Math.round((onTask / total) * 100) : 0,
  }
}
