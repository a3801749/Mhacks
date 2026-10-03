"use client"

import { useId, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Free-text course input that always lists every existing course, full width, below the field. */
export function CourseField({
  id,
  value,
  onChange,
  courses,
  placeholder = "EECS 281",
}: {
  id: string
  value: string
  onChange: (v: string) => void
  courses: string[]
  placeholder?: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const q = value.trim().toLowerCase()
  const options = [...courses].sort((a, b) => {
    const am = q && a.toLowerCase().includes(q) ? 0 : 1
    const bm = q && b.toLowerCase().includes(q) ? 0 : 1
    return am - bm || a.localeCompare(b)
  })

  const pick = (c: string) => {
    onChange(c)
    setOpen(false)
    setActive(-1)
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!open && e.key === "ArrowDown") setOpen(true)
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((i) => Math.min(options.length - 1, i + 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((i) => Math.max(0, i - 1))
          } else if (e.key === "Enter" && open && active >= 0) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === "Escape") {
            setOpen(false)
          }
        }}
        className="pr-8"
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {options.map((c, i) => {
            const selected = c === value
            const match = q && c.toLowerCase().includes(q)
            return (
              <li
                key={c}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm",
                  i === active && "bg-secondary",
                  !match && q && "text-muted-foreground",
                )}
              >
                {c}
                {selected && <Check className="size-3.5 text-primary" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
