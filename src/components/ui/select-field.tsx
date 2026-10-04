"use client"

import { Select } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export function SelectField<T extends string>({ value, onValueChange, options, id, label, disabled, className }: {
  value: T
  onValueChange: (value: T) => void
  options: { value: T; label: string; disabled?: boolean }[]
  id?: string
  label?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <Select.Root value={value} onValueChange={(v) => v !== null && onValueChange(v)} items={options} disabled={disabled}>
      <Select.Trigger id={id} aria-label={label} className={cn("flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-background px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50", className)}>
        <Select.Value className="min-w-0 flex-1 truncate" />
        <Select.Icon><ChevronDown className="size-4 shrink-0 text-muted-foreground" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={5} className="z-[100] outline-none">
          <Select.Popup className="max-h-[min(320px,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            <Select.List>
              {options.map((o) => <Select.Item key={o.value} value={o.value} disabled={o.disabled} className="flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-highlighted:bg-accent data-disabled:opacity-40">
                <Select.ItemText className="flex-1">{o.label}</Select.ItemText>
                <Select.ItemIndicator><Check className="size-4" /></Select.ItemIndicator>
              </Select.Item>)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
