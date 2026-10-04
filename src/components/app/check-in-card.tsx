"use client"

import { useRef, useState } from "react"
import { Annoyed, Frown, Laugh, Loader2, Meh, Pencil, Smile } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { weekdayLong } from "@/lib/time"
import { cn } from "@/lib/utils"
import { useApp } from "./app-shell"

function FaceFor({ rating }: { rating: number }) {
  const [Icon, color] =
    rating <= 2 ? [Frown, "text-rose-500"] : rating <= 4 ? [Annoyed, "text-amber-500"] : rating <= 6 ? [Meh, "text-sky-500"] : rating <= 8 ? [Smile, "text-teal-600"] : [Laugh, "text-emerald-600"]
  return <Icon className={cn("size-7", color)} aria-hidden />
}

export function CheckInCard({ date }: { date: string }) {
  const { data, today, api } = useApp()
  const existing = data.checkIns.find((c) => c.date === date)
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const lock = useRef(false)
  const label = date === today ? "today" : weekdayLong(date)

  if (existing && !editing) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
        <FaceFor rating={existing.rating} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            You rated {label} <span className="font-medium tabular-nums">{existing.rating}/10</span>
          </p>
          {existing.note && <p className="truncate text-xs text-muted-foreground">“{existing.note}”</p>}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Edit check-in"
          onClick={() => {
            setRating(existing.rating)
            setNote(existing.note)
            setEditing(true)
          }}
        >
          <Pencil />
        </Button>
      </div>
    )
  }

  const save = async () => {
    if (rating == null || lock.current) return
    lock.current = true
    setSaving(true)
    try {
      const ok = await api.saveCheckIn(date, rating, note.trim())
      if (ok) setEditing(false)
    } finally {
      lock.current = false
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-dashed bg-card/70 p-4">
      <p className="text-sm font-medium">How did {label} feel, overall?</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        One tap, once a day. It helps spot what your good days have in common.
      </p>
      <div className="mt-3 grid grid-cols-10 gap-1" role="radiogroup" aria-label="Day rating">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            disabled={saving}
            onClick={() => setRating(n)}
            className={cn(
              "h-9 rounded-lg border text-sm tabular-nums transition-colors disabled:opacity-50",
              rating === n ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Rough</span>
        <span>Great</span>
      </div>
      {rating != null && (
        <div className="mt-3 flex gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering? (optional)"
            maxLength={280}
            disabled={saving}
          />
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Save
          </Button>
          {existing && (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
