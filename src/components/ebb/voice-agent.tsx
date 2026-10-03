"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, Check, Loader2, Mic, MicOff, SendHorizontal, Undo2, Volume2, VolumeX, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AGENT_NAME, GUIDANCE_MODES } from "@/lib/brand"
import { describeChange } from "@/lib/describe"
import type { AdjustResponse, CalendarEvent, ChatTurn, Integrations, ScheduleChange, WeekData } from "@/lib/types"
import { cn } from "@/lib/utils"
import { request, type WeekApi } from "@/hooks/use-week"

interface AgentTurn extends ChatTurn {
  id: number
  changes?: ScheduleChange[]
  state?: "pending" | "applied" | "declined" | "undone"
  before?: CalendarEvent[]
  source?: AdjustResponse["source"]
}

const QUICK_PROMPTS = [
  "I'm ordering pizza instead",
  "I'm not doing this right now, move it",
  "I only have 20 minutes for the next block",
  "Move my evening work to tomorrow morning",
]

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

export function VoiceAgent({
  open,
  onOpenChange,
  data,
  api,
  now,
  integrations,
  queued,
  onQueuedConsumed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: WeekData
  api: WeekApi
  now: { date: string; minute: number }
  integrations: Integrations | null
  queued: string | null
  onQueuedConsumed: () => void
}) {
  const [turns, setTurns] = useState<AgentTurn[]>([])
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [muted, setMuted] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const recognitionRef = useRef<Recognition | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)
  const [speechSupported, setSpeechSupported] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection needs window
    setSpeechSupported(getRecognition() !== null)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [turns, thinking, interim])

  const stopAudio = () => {
    audioRef.current?.pause()
    if (typeof window !== "undefined") window.speechSynthesis?.cancel()
    setSpeaking(false)
  }

  const speak = useCallback(
    async (text: string) => {
      if (muted) return
      stopAudio()
      setSpeaking(true)
      if (integrations?.elevenlabs) {
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          })
          if (res.ok) {
            const url = URL.createObjectURL(await res.blob())
            const audio = new Audio(url)
            audioRef.current = audio
            audio.onended = () => {
              setSpeaking(false)
              URL.revokeObjectURL(url)
            }
            await audio.play()
            return
          }
        } catch {
          // fall through to the browser voice
        }
      }
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(text)
        u.rate = 1.03
        u.pitch = 1.05
        u.onend = () => setSpeaking(false)
        window.speechSynthesis.speak(u)
      } else {
        setSpeaking(false)
      }
    },
    [integrations?.elevenlabs, muted],
  )

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim()
      if (!message || thinking) return
      setInput("")
      setInterim("")
      const history: ChatTurn[] = turns.map(({ role, text }) => ({ role, text }))
      setTurns((t) => [...t, { id: idRef.current++, role: "user", text: message }])
      setThinking(true)
      const before = data.events
      try {
        const res = await request<AdjustResponse & { autoApplied: boolean; week: WeekData | null }>(
          "/api/schedule/adjust",
          { method: "POST", body: JSON.stringify({ message, history, now }) },
        )
        if (res.week) api.replace(res.week)
        setTurns((t) => [
          ...t,
          {
            id: idRef.current++,
            role: "agent",
            text: res.reply,
            changes: res.changes,
            state: res.changes.length ? (res.autoApplied ? "applied" : "pending") : undefined,
            before,
            source: res.source,
          },
        ])
        speak(res.reply)
      } catch (err) {
        setTurns((t) => [
          ...t,
          {
            id: idRef.current++,
            role: "agent",
            text: "I lost my train of thought for a second. Mind saying that again?",
          },
        ])
        toast.error(err instanceof Error ? err.message : "Tilly couldn't respond")
      } finally {
        setThinking(false)
      }
    },
    [api, data.events, now, speak, thinking, turns],
  )

  useEffect(() => {
    if (open && queued) {
      onQueuedConsumed()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- message handed off from a block
      send(queued)
    }
  }, [open, queued, onQueuedConsumed, send])

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const rec = getRecognition()
    if (!rec) {
      toast("Voice input needs Chrome or Edge — type instead for now.")
      return
    }
    stopAudio()
    rec.lang = "en-US"
    rec.interimResults = true
    rec.continuous = false
    let finalText = ""
    rec.onresult = (e) => {
      let text = ""
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript
        if (e.results[i].isFinal) finalText = text
      }
      setInterim(text)
    }
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") toast.error(`Mic error: ${e.error}`)
    }
    rec.onend = () => {
      setListening(false)
      recognitionRef.current = null
      if (finalText) send(finalText)
      else setInterim("")
    }
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

  const setTurnState = (id: number, state: AgentTurn["state"]) =>
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, state } : x)))

  const accept = async (turn: AgentTurn) => {
    if (!turn.changes) return
    const ok = await api.applyChanges(turn.changes, "Done — your calendar shifted")
    if (ok) setTurnState(turn.id, "applied")
  }

  const undo = async (turn: AgentTurn) => {
    if (!turn.changes || !turn.before) return
    for (const change of turn.changes) {
      if (change.action === "create") continue
      const prev = turn.before.find((e) => e.id === change.eventId)
      if (prev) {
        await api.updateEvent(prev.id, {
          status: prev.status,
          date: prev.date,
          startMin: prev.startMin,
          endMin: prev.endMin,
        })
      }
    }
    toast.success("Put back the way it was")
    setTurnState(turn.id, "undone")
  }

  const mode = GUIDANCE_MODES[data.settings.guidanceMode]

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          recognitionRef.current?.stop()
          stopAudio()
        }
        onOpenChange(o)
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <TillyOrb active={speaking || listening || thinking} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="font-heading text-lg font-medium">{AGENT_NAME}</SheetTitle>
              <SheetDescription className="text-xs">
                {mode.label} mode · {mode.short}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                if (!muted) stopAudio()
                setMuted((m) => !m)
              }}
              aria-label={muted ? "Unmute voice" : "Mute voice"}
              className="mr-8"
            >
              {muted ? <VolumeX /> : <Volume2 />}
            </Button>
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {turns.length === 0 && (
            <div className="space-y-4 py-6 text-center">
              <p className="font-heading text-xl">Schedule blew up?</p>
              <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                Tell me what&apos;s going on — out loud or typed. I&apos;ll find a way to rearrange things without
                the guilt trip.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="rounded-xl border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    “{p}”
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                  turn.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-secondary",
                )}
              >
                <p>{turn.text}</p>
                {turn.changes && turn.changes.length > 0 && (
                  <div className="mt-2.5 space-y-1.5 rounded-xl bg-background/80 p-2.5 text-foreground">
                    {turn.changes.map((c, i) => {
                      const d = describeChange(c, turn.before ?? data.events)
                      return (
                        <div key={i} className="text-xs">
                          <p className="font-medium">
                            {d.verb} · {d.title}
                          </p>
                          <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
                            {d.from && <span>{d.from}</span>}
                            {d.from && d.to && <ArrowRight className="size-3" />}
                            {d.to && <span className="text-foreground">{d.to}</span>}
                          </p>
                        </div>
                      )
                    })}
                    <div className="flex gap-2 pt-1">
                      {turn.state === "pending" && (
                        <>
                          <Button size="xs" onClick={() => accept(turn)}>
                            <Check /> Sounds good
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => setTurnState(turn.id, "declined")}>
                            <X /> Not now
                          </Button>
                        </>
                      )}
                      {turn.state === "applied" && (
                        <>
                          <span className="flex items-center gap-1 text-xs text-emerald-700">
                            <Check className="size-3" /> Applied
                          </span>
                          <Button size="xs" variant="ghost" onClick={() => undo(turn)}>
                            <Undo2 /> Undo
                          </Button>
                        </>
                      )}
                      {turn.state === "declined" && <span className="text-xs text-muted-foreground">Left as is</span>}
                      {turn.state === "undone" && <span className="text-xs text-muted-foreground">Undone</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {interim && (
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md border border-dashed px-3.5 py-2.5 text-sm text-muted-foreground">
                {interim}
              </p>
            </div>
          )}
          {thinking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {AGENT_NAME} is shuffling things around…
            </div>
          )}
        </div>

        <form
          className="flex items-center gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <Button
            type="button"
            size="icon-lg"
            variant={listening ? "destructive" : "default"}
            className={cn("shrink-0 rounded-full", listening && "animate-pulse")}
            onClick={toggleListening}
            aria-label={listening ? "Stop listening" : "Talk to Tilly"}
            title={speechSupported ? undefined : "Voice input works in Chrome and Edge"}
          >
            {listening ? <MicOff /> : <Mic />}
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening…" : "Or type: “move my 4pm to tomorrow”"}
            disabled={listening}
            className="h-10"
          />
          <Button type="submit" size="icon-lg" variant="ghost" disabled={!input.trim() || thinking} aria-label="Send">
            <SendHorizontal />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function TillyOrb({ active, className }: { active?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-10 shrink-0 items-center justify-center", className)} aria-hidden>
      {active && (
        <span className="absolute inset-0 rounded-full bg-primary/40 motion-safe:animate-[ebb-breathe_1.6s_ease-in-out_infinite]" />
      )}
      <span className="relative size-10 rounded-full bg-[radial-gradient(circle_at_30%_30%,#9fe0d8,#3e8f95_55%,#2b5f78)] shadow-inner" />
      <span className="absolute top-[38%] left-[34%] size-1.5 rounded-full bg-white/90" />
      <span className="absolute top-[38%] right-[34%] size-1.5 rounded-full bg-white/90" />
      <span className="absolute bottom-[30%] h-1 w-2.5 rounded-b-full border-b-2 border-white/80" />
    </span>
  )
}
