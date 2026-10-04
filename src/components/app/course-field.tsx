"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Check, ChevronDown, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { courseKey } from "@/lib/courses"
import { cn } from "@/lib/utils"

/** Course picker: lists every course, and typing a new name offers to create it. */
export function CourseField({
  id,
  value,
  onChange,
  courses,
  onCreate,
  placeholder = "EECS 281",
}: {
  id: string
  value: string
  onChange: (v: string) => void
  courses: string[]
  /** Called when the user picks "Create course" for a name not in the list. */
  onCreate?: (name: string) => void
  placeholder?: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [typing, setTyping] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const clearClose = () => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  useEffect(() => {
    return () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
    }
  }, [])
  const q = courseKey(value)
  // Matches only while typing, so a long list never covers the rest of the form.
  const options = [...courses].filter((c) => !typing || !q || courseKey(c).includes(q)).sort((a, b) => a.localeCompare(b))

  const typed = value.trim().replace(/\s+/g, " ")
  const creatable = Boolean(onCreate) && typed.length > 0 && !courses.some((c) => courseKey(c) === courseKey(typed))
  const rows = creatable ? [null, ...options] : options

  const pick = (c: string | null) => {
    if (c === null) {
      onChange(typed)
      onCreate?.(typed)
    } else onChange(c)
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
        aria-activedescendant={open && active >= 0 && active < rows.length ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        maxLength={40}
        onChange={(e) => {
          onChange(e.target.value)
          setTyping(true)
          setActive(-1)
          clearClose()
          setOpen(true)
        }}
        onFocus={() => {
          setTyping(false)
          setActive(-1)
          clearClose()
          setOpen(true)
        }}
        onBlur={() => {
          clearClose()
          closeTimer.current = window.setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={(e) => {
          if (!open && e.key === "ArrowDown") setOpen(true)
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((i) => Math.min(rows.length - 1, i + 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((i) => Math.max(0, i - 1))
          } else if (e.key === "Enter" && open) {
            e.preventDefault()
            if (active >= 0 && active < rows.length) pick(rows[active])
            else if (creatable) pick(null)
          } else if (e.key === "Escape") {
            setOpen(false)
          }
        }}
        className="pr-8"
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      {open && rows.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {rows.map((c, i) => {
            if (c === null) return (
              <li
                key="create"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={false}
                onPointerDown={(e) => {
                  e.preventDefault()
                  clearClose()
                  pick(null)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-medium text-primary", i === active && "bg-secondary")}
              >
                <Plus className="size-3.5" /> Create course “{typed}”
              </li>
            )
            const selected = c === value
            return (
              <li
                key={c}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onPointerDown={(e) => {
                  e.preventDefault()
                  clearClose()
                  pick(c)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm",
                  i === active && "bg-secondary",
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
