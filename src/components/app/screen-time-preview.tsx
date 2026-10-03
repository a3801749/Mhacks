import { MonitorSmartphone } from "lucide-react"
import { APP_NAME } from "@/lib/brand"
import { CATEGORY_META, DEMO_BLOCK_USAGE, focusSummary, type BlockUsage, type SiteCategory } from "@/lib/screen-time"
import { formatDuration } from "@/lib/time"
import { cn } from "@/lib/utils"

export function ScreenTimePreview({ usage = DEMO_BLOCK_USAGE, className }: { usage?: BlockUsage; className?: string }) {
  const s = focusSummary(usage)
  const order: SiteCategory[] = ["focus", "reference", "distraction", "idle"]
  const sites = [...usage.sites].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))

  return (
    <div className={cn("rounded-2xl border bg-background p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MonitorSmartphone className="size-3.5" /> Preview · sample data
          </p>
          <p className="mt-1 text-sm font-medium">
            {usage.blockTitle} · {formatDuration(usage.plannedMinutes)} block
          </p>
        </div>
        <div className="text-right">
          <p className="font-heading text-2xl leading-none tabular-nums">{s.focusPercent}%</p>
          <p className="text-[11px] text-muted-foreground">on task</p>
        </div>
      </div>

      <div className="mt-3 flex h-3 overflow-hidden rounded-full">
        {sites.map((site) => (
          <span
            key={site.domain}
            style={{ width: `${(site.minutes / s.total) * 100}%`, backgroundColor: CATEGORY_META[site.category].color }}
            title={`${site.domain} · ${formatDuration(site.minutes)}`}
          />
        ))}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {sites.map((site) => (
          <li key={site.domain} className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: CATEGORY_META[site.category].color }} />
            <span className="truncate">{site.domain}</span>
            <span className="ml-auto text-muted-foreground tabular-nums">{formatDuration(site.minutes)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 rounded-xl bg-secondary/70 p-2.5 text-xs text-secondary-foreground">
        {formatDuration(s.onTask)} of real work, {formatDuration(s.drift)} of drift. {APP_NAME} would log{" "}
        {formatDuration(s.onTask)} instead of the full block, so your estimates stay honest.
      </p>
    </div>
  )
}
