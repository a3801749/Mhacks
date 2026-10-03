# Ebb — a reflective calendar

> Working name. Rename it in `src/lib/brand.ts`.

Ebb looks back before it plans ahead. Instead of a rigid forward grid, it shows how you **actually** spent your time,
ties tasks directly to work blocks, and has a voice companion (Tilly) you can talk to when your day blows up.
The AI doesn't do the reflecting for you — it compiles the numbers so reflecting takes seconds instead of a spreadsheet.

## What's in this MVP

| Feature | Where |
| --- | --- |
| **Reflective calendar** — rolling window (4 days back, today, 2 ahead), day strip with planned-vs-actual fill, calm block cards, "breathing room" gaps, live *now* line | `src/components/ebb/day-view.tsx`, `block-card.tsx` |
| **Active projects** — progress, time to go, time booked, gentle pace labels instead of red alarms | `project-rail.tsx` |
| **Task-integrated work blocks** — open a block to see total time on the task, a momentum message, the progress trail of past sessions, and quick-log buttons | `block-dialog.tsx` |
| **Backtracking analysis** — deterministic stats (follow-through, by day, by time of day, estimate drift) + a Gemini-compiled summary, habits, one-click schedule shifts, and reflection questions | `src/lib/analytics.ts`, `reflect-panel.tsx` |
| **Voice agent (Tilly)** — speak or type ("I'm ordering pizza instead"); Gemini negotiates changes, ElevenLabs speaks the reply; accept / decline / undo | `voice-agent.tsx`, `/api/schedule/adjust`, `/api/tts` |
| **Adaptive guidance modes** — *Anchor* (strict baseline, pushes back first), *Coach* (proposes, you approve), *Tide* (applies changes automatically) | `settings-dialog.tsx`, `src/lib/ai/prompts.ts` |

## Run it

```bash
npm install
cp .env.example .env.local   # optional — every key has a fallback
npm run dev                  # http://localhost:4317
```

With no keys, everything still works:

| Service | With key | Without key |
| --- | --- | --- |
| Gemini (`GEMINI_API_KEY`) | Real reasoning for adjustments and reflections | Local heuristic engine (`src/lib/ai/fallback.ts`) |
| ElevenLabs (`ELEVENLABS_API_KEY`) | Tilly speaks with the ElevenLabs voice | Browser `speechSynthesis` |
| Neon (`DATABASE_URL`) | Postgres persistence; schema + demo week are created on first request | In-memory store (resets on server restart) |

Voice **input** uses the browser's Web Speech API (Chrome / Edge). Other browsers can type.

The settings dialog (top-right mode button) shows which services are live and has a **Reset demo week** button.

## Team handoff notes

- **Gemini system prompts** live in `src/lib/ai/prompts.ts`. The adjust prompt takes `{ now, schedule, projects, tasks, stats, conversation, message }`
  and returns `{ reply, changes[] }` via a JSON response schema. Changes are validated server-side
  (`src/lib/ai/engine.ts`) so hallucinated ids or edits to the past are dropped.
- **Neon schema** is in `db/schema.sql` — `users`, `projects`, `tasks`, `events` (planned start/end + `actual_minutes`),
  and an append-only `time_logs` time series.
- **Default voice** settings are in `src/lib/voice.ts`. Swap `ELEVENLABS_VOICE_ID` for a custom Voice Design voice when ready.
- **Figma → code**: colors and radii are CSS variables in `src/app/globals.css`; headings use Fraunces, body uses Geist.
  UI primitives are shadcn/ui (`src/components/ui`).

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/week?today=YYYY-MM-DD` | GET | Projects, tasks, events, logs, settings, integration status |
| `/api/events/:id` | PATCH | Update status / time |
| `/api/events/:id/log` | POST | Log `{ minutes, note }` against a block's task |
| `/api/tasks/:id` | PATCH | `{ done }` |
| `/api/schedule/adjust` | POST | `{ message, history, now }` → `{ reply, changes, autoApplied }` |
| `/api/schedule/apply` | POST | Apply `{ changes }` |
| `/api/reflect` | POST | Backtracking reflection |
| `/api/settings` | PUT | `{ guidanceMode }` |
| `/api/tts` | POST | `{ text }` → `audio/mpeg` (501 when ElevenLabs isn't configured) |
| `/api/reset` | POST | Restore the demo week |

## Stack

Next.js 16 (App Router, Route Handlers) · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · `@google/genai` ·
ElevenLabs REST · `@neondatabase/serverless`
