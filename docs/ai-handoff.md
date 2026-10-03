# Andy — handoff for coding agents

Read this before changing product behavior. `AGENTS.md` points here. Human-facing setup is in the root `README.md`.

Andy is a reflective calendar for students. **Tilly** is the scheduling companion. The product rule is: the model compiles what happened; the person does the reflecting. Copy stays short. The UI is a normal student tool — flat background, modest corners, no full-page gradient, no decorative wave fills on progress bars.

## Names that do not match the code

UI labels and stored enum values differ. Do not rename the stored values; they are in Postgres checks and existing rows.

| UI label | Stored value | Meaning |
| --- | --- | --- |
| Anchor | `anchor` | Plan is the baseline. Tilly suggests; she does not move blocks until the user agrees. |
| Lighthouse | `coach` | Tilly proposes a concrete change. Nothing applies until the user accepts. |
| Tide | `autopilot` | Tilly's changes apply immediately. The user can undo. |

Labels live in `src/lib/brand.ts` (`GUIDANCE_MODES`). Icons: Anchor, Lighthouse, Waves.

Assignment categories (`Project.type`):

| UI | Stored | Notes |
| --- | --- | --- |
| Project | `project` | Includes long writing (thesis chapters). Old rows with `writing` were migrated to `project`. |
| Exam | `exam` | Old rows with `studying` were migrated to `exam`. |
| Homework | `homework` | Treated as light work in the planner. |
| Reading | `reading` | Treated as light work in the planner. |
| Misc | `misc` | Anything else. No database check on `type`; the API validates against `ASSIGNMENT_TYPES`. |

Priority (`Project.priority`) is how the work is graded, not a 1–5 rank:

| UI | Stored | Planner weight (`PRIORITIES` in `brand.ts`) |
| --- | --- | --- |
| Accuracy | `accuracy` | 1.35 |
| Completion | `completion` | 1 |
| Flexible | `flexible` | 0.8 |
| Optional | `optional` | 0.5 |

"Projects" in code are assignments. The word "project" in the UI means the Project category only.

## Pages

| Route | Nav label | Component | What the user sees |
| --- | --- | --- | --- |
| `/` | Today | `today-view.tsx` | Seven-day strip centered on today, a proportional day timeline, check-in, Looking back. Left rail is an **overview**, not a stack of full cards. |
| `/agenda` | Agenda | `agenda-view.tsx` | Filterable assignment/event list plus a month calendar shaded by how busy the day is. Schedule from here. |
| `/plan` | Plan | `planner-view.tsx` | Week grid. Drag a block (tap on touch) and Tilly suggests a breakdown. |
| `/rhythm` | Rhythm | `rhythm-view.tsx` | Midnight-to-midnight histogram of logged work, week or month, grouped by assignment, course, or category. |
| `/timeline` | Timeline | `timeline-view.tsx` | Gantt from assigned date to due date. Fill starts the day work actually began. |
| `/welcome` | (linked, not in nav) | `onboarding-view.tsx` | Five steps: Welcome, Guidance, Extras, First assignment, Tour. |

Shell, nav, "New assignment" button, Tilly button, and the dialogs live in `src/components/app/app-shell.tsx`. Pages under `src/app/(app)/` only render a view; the `(app)` layout wraps them in `AppShell`.

## Today overview

`project-rail.tsx` is deliberately compact. It shows:

1. **Classes** — one row per course: number of unfinished tasks ("3 tasks"), next due date, a dot if anything in that course is behind. The row links to `/agenda?course=...`.
2. **Pinned** — assignments with `pinned`, in `pinOrder`. Drag the grip (pointer events, so mouse and touch) or use arrow keys on it. Saved with `PUT /api/projects/pin-order`. Empty state tells the user pinning makes Tilly plan them first.
3. **Due soon** — the next few unpinned assignments by due date.
4. One line when pin history is strong enough: "You pin {course} {category} most…"

The rail has a fixed height on desktop; each section scrolls on its own (`scrollArea` in `project-rail.tsx`, with a stable scrollbar gutter). Do not put a scroll on the whole column.

No estimate paragraphs on these rows. Pace is a short tag: **Done**, **Ahead**, **On pace**, **Behind pace** (`PACE_COPY` in `assignment-bits.tsx`). Progress is a plain bar (`ProgressBar`), not the old animated wave.

Creating an assignment is the **New assignment** button in the header (top right), not a button inside the rail. Editing is the assignment title (Today and Agenda) or the row on Timeline.

## Today body

- `DayStrip` has no progress bars. Day progress (actual ÷ planned work) is a small bar at the bottom right of the day header in `DayTimeline`. The summary sentence has no trailing period.
- The timeline is proportional: card height is `max(84px, minutes × 1.1px)`, and gaps scale too. Gaps of 30 minutes or more say "Xh of breathing room". Hovering a gap of 15 minutes or more (today after now, or a future day) shows "Add something here", which opens `ScheduleDialog` prefilled with that slot.
- Every work block shows the planned bar even when nothing has been logged.

## Block dialog

`block-dialog.tsx`.

- Log time with the quick buttons or a custom amount: `2.75` (hours), `1:30`, `1h 30m`, or minutes, with Add or Remove. `parseDuration` does the parsing. One entry is capped at `MAX_LOG_MINUTES` (12 hours, in `time.ts`) on the client and in the API. Removing more than the block's logged time is blocked; the store also clamps `actual_minutes` at 0. Status follows `statusForActual` (`schedule.ts`): 0 → `planned`, under length → `partial`, otherwise `completed`.
- Removals are stored as negative `time_logs` rows, so totals stay a plain sum.
- The progress trail lists every entry in a scrolling box. Each entry can be edited (minutes, note) or deleted via `PATCH` / `DELETE /api/logs/:id`; the linked event's actual time moves by the difference.
- Marking a task done shows a highlighted "how far along is the assignment now?" slider when the block belongs to an unfinished assignment.
- Blocks do not need an assignment. A work block with no task can still log time (no `time_logs` row, since logs need a task) and has a "Mark done" button.
- `estimateProject` returns `uncertain: true` when progress is 0% but at least 2 hours are logged. The UI shows the "can't give an accurate estimate yet" sentence instead of a number.

## Looking back

`reflect-panel.tsx`. Planned vs actual chart and time-of-day follow-through stay. The old stat tiles (Did, Follow-through, Blocks landed) are gone on purpose. **Insights** loads the reflection automatically on mount (`loadInsights`, cached per `today` so the desktop and mobile copies share one request) and has a Refresh button. There is no "Compile my week" button anymore.

## Assignment dialog

No subtitle under the title. Fields: name, course (`CourseField` — free text with a full-width list of every existing course), category, priority, "Estimate (hr)", dates, progress slider (edit only), notes, pin. The bottom line shows the likely total, or the uncertain sentence.

## Agenda

`agenda-view.tsx` + `schedule-dialog.tsx`.

- Left on desktop, above on mobile: the list. Toggle Assignments / Events. Filter by class and category (multi-select chips). Sort assignments by due date, priority weight, pinned first, least progress, or most time left. "Show finished" includes completed assignments.
- Right on desktop: month calendar and the selected day's events and due items.
- Day color is `dayLoad()` in `src/lib/analytics.ts`. Score = booked minutes (skipped blocks excluded) plus a due-date penalty (`accuracy` 120, `completion` 60, `flexible` 40, `optional` 20; exams ×1.5). Levels: `free` 0, `light` under 300, `medium` under 420, `heavy` otherwise. UI: open / green "Okay" / orange "Busy" / red "Packed" (`BUSY_STYLE`). Dots on a cell are things due that day.
- **Schedule event** opens `ScheduleDialog`. "Focus block" is `kind: "work"`; with an assignment it is tied to one of its open tasks, without one it just needs a title. "Event" is `kind: "life"` with an optional linked assignment. Both go through `POST /api/schedule/apply` as a `create` change with an explicit `kind`. Overlaps are warned about and still allowed.

## Data model

Types: `src/lib/types.ts`. SQL: `db/schema.sql`. The app applies the SQL itself on the first Neon request (`src/lib/store/neon.ts` strips `--` comments, then splits on `;`). Do not put a semicolon inside a string literal or use `DO $$` blocks.

`projects` (assignments): `course`, `type`, `priority`, `notes` (max 2000 via the API), `pinned`, `pin_count`, `pin_order`, `target_minutes`, `assigned_date`, `due_date`, `progress_percent` (null until the user reports it), `completed_date`.

A newly pinned assignment goes to the end of the pinned list (`pin_order` = max + 1). `pin_count` increments only on the transition from unpinned to pinned (memory store and the Neon `UPDATE`). Un-pinning does not decrement it. That history is what the planner learns from, so do not reset it when the user unpins.

`events`: `date` is `YYYY-MM-DD`, `start_min` / `end_min` are minutes from local midnight. This is timezone-agnostic on purpose. `actual_minutes` is what was logged. `kind` is `work` or `life`. `moved_from_*` records the first time a block was moved.

`time_logs` is append-only. `check_ins` is one row per user per date, rating 1–10.

Schema upgrades for old databases are the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements plus the category migration at the bottom of `schema.sql` (`studying` → `exam`, `writing` → `project`, drop the old `projects_type_check`).

## Time, windows, pace, estimates

- The client sends `today` and `now`. Do not compute "today" on the server from UTC if a user-facing day is involved.
- `windowDates(today)` is today−3 through today+3 (`WINDOW_BACK`, `WINDOW_AHEAD`), so today is centered. The Today strip and backtracking stats use this window.
- `projectHealth` pace: `done` when remaining is 0 or percent ≥ 100; `ahead` when upcoming planned minutes cover the estimate; `behind` when ≤4 days remain and less than 60% of the remainder is booked; otherwise `on-track`.
- `estimateProject`: if the user has reported progress and logged time, blend a pace estimate with the category estimate. The blend trusts pace more as progress passes 50% (`weight = min(1, progress/50)`). Otherwise use the course+type multiplier from finished assignments, then type-only, then the user's original target. Finished assignments are the training set (`completedDate` set).
- Rhythm wind-down (`rhythmInsights`) ignores today's night. A partial day reads as "wrapping up early" and is a known bug if you include it. Sessions before 4:00 count toward the previous night (`windDownByDay`).

## Pins and the planner

`pinPreferences` in `analytics.ts` sums `pinCount` across assignments. It returns nothing until the total is at least 3. A course or category is "usually pinned" when it holds at least 35% of all pins.

`attentionWeight` multiplies priority weight by 1.3 if currently pinned, 1.1 if the course matches the habit, 1.1 if the category matches. `planCandidates` sorts by urgency × that weight. Gemini sees `priority`, `pinned`, `notes` (trimmed), and `usuallyPins` (`src/lib/ai/engine.ts`, prompts in `src/lib/ai/prompts.ts`). When something has to give, optional and flexible work goes before accuracy work and pins.

`mockBreakdown` (`src/lib/ai/planner.ts`) is the no-key planner. It skips tasks with under 25 minutes left, leads with heavier work unless the user has been rating days ≤5 or the block starts at 21:00 or later, and mentions the pin in the segment reason.

## AI pipeline

`src/lib/ai/engine.ts` calls Gemini (`gemini-2.5-flash`, JSON schema) when `GEMINI_API_KEY` is set, and `fallback.ts` / `mockBreakdown` otherwise. Failures fall back; they do not 500 the request.

`sanitize` drops changes that edit the past, use unknown ids, have out-of-range times, or move a block onto its current slot. Do not apply model output without it.

Guidance prompt text is `MODE_RULES` in `prompts.ts`. Lighthouse is still the `coach` key there.

ElevenLabs: `POST /api/tts`. Returns 501 without a key; the client uses `speechSynthesis`. Voice input is the Web Speech API. Defaults in `src/lib/voice.ts` (Rachel, `21m00Tcm4TlvDq8ikWAM`, `eleven_flash_v2_5`).

## Store and API

`getStore()` (`src/lib/store/index.ts`) uses Neon when `DATABASE_URL` is set, otherwise the in-memory store on `globalThis.__calendarMemory`. The memory store is per server process and is replaced by `reset`. Both stores implement `src/lib/store/types.ts`. A new field has to be added in **both** stores, the seed, and the SQL.

Client mutations go through `src/hooks/use-week.ts`. `togglePin` updates the UI immediately, then PATCHes.

| Route | Method | Body / behavior |
| --- | --- | --- |
| `/api/week?today=` | GET | Full `WeekData` plus integration flags |
| `/api/events/:id` | PATCH | status, date, startMin, endMin |
| `/api/events/:id/log` | POST | `{ minutes, note }` — ±1 to 720; negative takes time off. Updates `actual_minutes` and appends a time log |
| `/api/logs/:id` | PATCH / DELETE | Edit `{ minutes, note }` or remove a trail entry; the event's actual time follows |
| `/api/projects/pin-order` | PUT | `{ ids }` in display order |
| `/api/tasks/:id` | PATCH | `{ done }` |
| `/api/projects` | POST | create assignment + first task |
| `/api/projects/:id` | PATCH | name, course, type, priority, notes, pinned, dates, target, progress, completedDate |
| `/api/checkins` | PUT | `{ date, rating, note }` upsert |
| `/api/plan` | POST | `{ date, startMin, endMin }` → breakdown |
| `/api/schedule/adjust` | POST | `{ message, history, now }` |
| `/api/schedule/apply` | POST | `{ changes }` |
| `/api/reflect` | POST | reflection for `today` |
| `/api/settings` | PUT | partial settings. **`screenTimeEnabled` is forced `false`.** |
| `/api/tts` | POST | `{ text }` → audio/mpeg, or 501 |
| `/api/reset` | POST | rebuild the demo week |

New route handlers need `npx next typegen` so `RouteContext<'/api/...'>` exists. In Next 16, `params` is a Promise.

## Demo seed

`src/lib/seed.ts` `buildSeed(today)` is the whole demo: a month of history, finished assignments that train estimates, late-night drift on the thesis, check-ins that drop after late nights, pinned thesis chapter and EECS midterm, and events out to about today+8 so the Agenda calendar has green, orange, and red days. Offsets are relative to the `today` argument. Reset from Settings or `POST /api/reset`.

## UI conventions

- Rename the product only in `brand.ts` (`APP_NAME`, `AGENT_NAME`).
- shadcn/ui is the Base UI style: primitives take a `render` prop, not `asChild`. The CLI sometimes emits `import { cn } from "cn"`; that module is wrong. Use `@/lib/utils`.
- Corners: `--radius: 0.5rem` in `globals.css`. Prefer `rounded-md` / `rounded-lg` over `rounded-full` except for the Tilly launcher and genuine dots.
- Background is flat `bg-background`. Do not bring back `.app-paper` or a page-wide gradient.
- Fonts: Fraunces for headings (`font-heading`), Geist for body.
- Shared assignment widgets: `src/components/app/assignment-bits.tsx` (`PaceTag`, `PinButton`, `ProgressBar`, `Tag`, `dueText`).
- Toasts via sonner. Loading and error states already exist on the shell.

## Screen time

Not built. Settings cannot turn it on (`screenTimeEnabled: false` in the settings route). The onboarding extras step shows `screen-time-preview.tsx` and says it is not available yet. The extension design is `docs/screen-time-extension.md`. Do not fake a working integration.

## Other docs

- `docs/onboarding.md` — why `/welcome` is shaped the way it is
- `docs/demo-walkthrough.md` — click path for a demo
- `docs/screen-time-extension.md` — future extension

## Running and checking

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:4317
npx tsc --noEmit
npm run lint
```

Every external key is optional. Gemini, ElevenLabs, and Neon each have a fallback (see the table in `README.md`).

`next.config.ts` sets `allowedDevOrigins` for `127.0.0.1`. Without it, Next 16 refuses the client bundle and the app sits on skeletons.

`next build` and `next dev` share `.next`. Stop the dev server before a production build, then start it again.

This Next.js version differs from older training data. Read `node_modules/next/dist/docs/` before using a Next API you are not sure about. The warning block at the top of `AGENTS.md` is rewritten by `next dev`; leave it in place.

## When you add a field to an assignment

Touch all of these or the memory demo and Neon will disagree:

1. `Project` in `src/lib/types.ts`
2. `ProjectPatch` / `NewProject` in `src/lib/store/types.ts`
3. `memory.ts` create + update
4. `neon.ts` insert, select mapping, and update
5. `db/schema.sql` column, plus an `ADD COLUMN IF NOT EXISTS` upgrade
6. `src/lib/seed.ts`
7. `POST` and `PATCH` handlers under `src/app/api/projects`
8. The form in `project-dialog.tsx` (and onboarding, if the field is part of first-run)
