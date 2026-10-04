# Andy — a reflective calendar

> Working name. Rename it in `src/lib/brand.ts`.

Andy looks back before it plans ahead. Instead of a rigid forward grid, it shows how you **actually** spent your time,
ties tasks directly to work blocks, and has a voice companion (Tilly) you can talk to when your day blows up.
The AI doesn't do the reflecting for you — it compiles the numbers so reflecting takes seconds instead of a spreadsheet.

## What's in this MVP

| Page / feature | What it does | Where |
| --- | --- | --- |
| **Today** | Seven days centered on today. A proportional day timeline with planned-vs-actual bars, a live *now* line, and hover-to-add in the gaps. The left rail is a compact overview: classes, drag-to-reorder pinned assignments, and what is due soon; each section scrolls on its own | `today-view.tsx`, `day-view.tsx`, `project-rail.tsx` |
| **Agenda** | All assignments and events, filtered by class and category and sorted by due date, priority, pins, progress, or time left. Month calendar shaded green / orange / red by how busy the day is. Schedule a work session or event from the day | `agenda-view.tsx`, `schedule-dialog.tsx` |
| **Assignments** | Course, category (project, exam, homework, reading, misc), and priority (accuracy, completion, flexible, optional). Notes, pin, assigned/due dates, adaptive estimates | `project-dialog.tsx`, `assignment-bits.tsx` |
| **Task-integrated blocks** | Open a block to see total time on the task, log or take off any amount (up to 12h at a time), edit the progress trail, and update how far along the assignment is | `block-dialog.tsx` |
| **Adaptive estimates** | Time left comes from your reported progress and pace, blended with how long finished assignments of the same course + type really took | `estimateProject()` in `src/lib/analytics.ts` |
| **Daily check-in** (opt-in) | One tap, 1–10, once a day. Feeds "after late nights you rate your day 4.4 vs 7.2" style insights | `check-in-card.tsx`, `moodCorrelation()` |
| **Plan** | Week grid: drag out a block (tap on mobile) and Tilly suggests how to split it across your tasks, or pick one task yourself | `planner-view.tsx`, `plan-dialog.tsx`, `/api/plan` |
| **Rhythm** | When in the day you work (midnight → midnight), stacked by assignment, course, or category, over a week or month; wind-down trend; "how long things really take" | `rhythm-view.tsx` |
| **Timeline** | Gantt view: assigned → due bars, progress fill starting the day you began, today line, on-pace / behind status | `timeline-view.tsx` |
| **Looking back** | Planned vs actual by day and time of day, plus Insights that load on their own (Gemini or the local engine) with a refresh button: patterns, one-click shifts, and reflection questions | `reflect-panel.tsx` |
| **Tilly (voice agent)** | Speak or type ("I'm ordering pizza instead"); Gemini negotiates, ElevenLabs speaks; accept / decline / undo | `voice-agent.tsx` |
| **Guidance modes** | *Anchor* (strict baseline), *Lighthouse* (proposes, you approve), *Tide* (applies automatically) | `settings-dialog.tsx` |

Optional features (daily check-in, AI planner, screen time) are toggled in Settings. Screen time is shown as
"coming soon" — it needs a browser extension.

## Run it

```bash
npm ci
cp .env.example .env.local   # optional — every key has a fallback
npm run dev                  # http://localhost:4317
```

Use the committed lockfile for installs. `shadcn` is pinned because the app imports its `tailwind.css` export;
the Next.js ESLint config must match the installed Next.js version.

With no keys, everything still works:

| Service | With key | Without key |
| --- | --- | --- |
| Gemini (`GEMINI_API_KEY`) | Real reasoning for adjustments and reflections | Local heuristic engine (`src/lib/ai/fallback.ts`) |
| ElevenLabs (`ELEVENLABS_API_KEY`) | Tilly speaks with the ElevenLabs voice | Browser `speechSynthesis` |
| Neon (`DATABASE_URL`) | Postgres persistence; schema + demo week are created on first request | In-memory store (resets on server restart) |

Voice **input** uses the browser's Web Speech API (Chrome / Edge). Other browsers can type.

The settings dialog (top-right mode button) shows which services are live and has a **Reset demo week** button.

## Docs

- [`docs/ai-handoff.md`](docs/ai-handoff.md): architecture, data model, and conventions for anyone (including other coding agents) changing this repo. `AGENTS.md` points here.
- [`docs/demo-walkthrough.md`](docs/demo-walkthrough.md): a step-by-step demo script covering every feature
- [`docs/onboarding.md`](docs/onboarding.md): the onboarding flow (live at `/welcome`) and the reasoning behind it
- [`docs/screen-time-extension.md`](docs/screen-time-extension.md): how to build the screen-time browser extension

## Team handoff notes

- **Gemini system prompts** live in `src/lib/ai/prompts.ts`. The adjust prompt takes `{ now, schedule, projects, tasks, stats, conversation, message }`
  and returns `{ reply, changes[] }` via a JSON response schema. Changes are validated server-side
  (`src/lib/ai/engine.ts`) so hallucinated ids or edits to the past are dropped.
- **Neon schema** is in `db/schema.sql` — `users`, `projects` (assignments with course, category, priority, notes, pin, progress), `tasks`,
  `events` (planned start/end + `actual_minutes`), an editable, signed `time_logs` time series, and `check_ins`.
- **Demo data** (`src/lib/seed.ts`) includes a month of history: finished assignments that train the estimate model,
  a late-night drift on the thesis, and daily ratings that dip after late nights.
- **Default voice** settings are in `src/lib/voice.ts`. Swap `ELEVENLABS_VOICE_ID` for a custom Voice Design voice when ready.
- **Figma → code**: colors and radii are CSS variables in `src/app/globals.css`; headings use Fraunces, body uses Geist.
  UI primitives are shadcn/ui (`src/components/ui`).

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/week?today=YYYY-MM-DD` | GET | Projects, tasks, events, logs, settings, integration status |
| `/api/events/:id` | PATCH / DELETE | Update status / time, or remove an unworked block for Undo |
| `/api/events/:id/log` | POST | Log `{ minutes, note }` on a block; negative minutes take time off |
| `/api/logs/:id` | PATCH / DELETE | Edit or remove a progress-trail entry |
| `/api/projects/pin-order` | PUT | Save pinned order `{ ids }` |
| `/api/tasks/:id` | PATCH | `{ done }` |
| `/api/projects` | POST | Create an assignment |
| `/api/projects/:id` | PATCH | Edit category, priority, notes, pin, dates, estimate, progress, or mark finished |
| `/api/checkins` | PUT | `{ date, rating, note }` |
| `/api/plan` | POST | `{ date, startMin, endMin }` → suggested breakdown |
| `/api/schedule/adjust` | POST | `{ message, history, now }` → `{ reply, changes, autoApplied }` |
| `/api/schedule/apply` | POST | Apply `{ changes }` |
| `/api/reflect` | POST | Backtracking reflection |
| `/api/settings` | PUT | `{ guidanceMode?, checkInEnabled?, aiPlannerEnabled? }` |
| `/api/tts` | POST | `{ text }` → `audio/mpeg` (501 when ElevenLabs isn't configured) |
| `/api/reset` | POST | Restore the demo week |

## Stack

Next.js 16 (App Router, Route Handlers) · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · `@google/genai` ·
ElevenLabs REST · `@neondatabase/serverless`
