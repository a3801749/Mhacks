# Tilly — handoff for coding agents

Read this before changing product behavior. `AGENTS.md` points here. Human-facing setup is in the root `README.md`.

Tilly is a reflective calendar for students, and Tilly is also the name of its scheduling companion. The product rule is: the model compiles what happened; the person does the reflecting. Copy stays short. The UI is a normal student tool — flat background, modest corners, no full-page gradient, no decorative wave fills on progress bars.

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
| `/plan` | Plan | `planner-view.tsx` | Your Week. Create manually, move blocks, resize, or explicitly open optional Tilly suggestions. |
| `/rhythm` | Analytics | `rhythm-view.tsx` | Midnight-to-midnight histogram of logged work, week or month, grouped by assignment, course, or category. |
| `/timeline` | Timeline | `timeline-view.tsx` | Gantt from assigned date to due date. Fill starts the day work actually began. |
| `/welcome` | (linked, not in nav) | `onboarding-view.tsx` | Five steps: Welcome, Guidance, Extras, First assignment, Tour of all five views. Settings saves must succeed before advancing. |

Shell, nav, "New assignment" button, Tilly button, and the dialogs live in `src/components/app/app-shell.tsx`. Pages under `src/app/(app)/` only render a view; the `(app)` layout wraps them in `AppShell`.

## Today overview

`project-rail.tsx` is deliberately compact. It shows:

1. **Classes** — one row per course: number of unfinished tasks ("3 tasks"), next due date, a dot if anything in that course is behind. The row links to `/agenda?course=...`.
2. **Pinned** — assignments with `pinned`, in `pinOrder`. Drag the grip (pointer events, so mouse and touch) or use arrow keys on it. Saved with `PUT /api/projects/pin-order`. Empty state tells the user pinning makes Tilly plan them first.
3. **Due soon** — the next few unpinned assignments by due date.
4. One line when pin history is strong enough: "You pin {course} {category} most…"

The rail has a fixed height on desktop; each section scrolls on its own (`ScrollArea` in `project-rail.tsx`, with a permanently mounted custom scrollbar and a separate content gutter). Do not put a scroll on the whole column.

No estimate paragraphs on these rows. Pace is a short tag: **Done**, **Ahead**, **On pace**, **Behind pace** (`PACE_COPY` in `assignment-bits.tsx`). Progress is a plain bar (`ProgressBar`), not the old animated wave.

Creating an assignment is the **New assignment** button in the header (top right), not a button inside the rail. Editing is the assignment title (Today and Agenda) or the row on Timeline.

## Today body

- `DayStrip` has no progress bars. Day progress (actual ÷ planned work) is a small bar at the bottom right of the day header in `DayTimeline`. The summary sentence has no trailing period.
- The timeline is proportional: card height is `max(84px, minutes × 1.1px)`, and gaps scale too. Gaps of 30 minutes or more say "Xh of breathing room". Addable gaps show a centered “Add something here” button. The trailing gap is addable too. Only slots with at least 15 minutes after the current time are offered. Gaps use the furthest preceding card end, so nested/overlapping and skipped cards do not create false spacing.
- Every work block shows scheduled-vs-actual time, even before logging. The other bar is total reported assignment progress, never logged time divided by a task estimate. Personal events have no focused-time progress bar.
- Day-strip and Plan booked totals include both focus blocks and personal events, excluding skipped items. A restored personal event therefore contributes again.

## Block dialog

`block-dialog.tsx`.

- Log time with the quick buttons or a custom amount: `2.75` (hours), `1:30`, `1h 30m`, or minutes, with Add or Remove. `parseDuration` does the parsing. One entry is capped at `MAX_LOG_MINUTES` (12 hours, in `time.ts`) on the client and in the API. Removing more than the block's logged time is blocked; the store also clamps `actual_minutes` at 0. Status follows `statusForActual` (`schedule.ts`): 0 → `planned`, under length → `partial`, otherwise `completed`.
- Removals are stored as negative `time_logs` rows, so totals stay a plain sum.
- The progress trail lists every entry in a scrolling box. Each entry can be edited (minutes, note) or deleted via `PATCH` / `DELETE /api/logs/:id`; the linked event's actual time moves by the difference. Edits and deletions that would make the total negative are rejected: adjust later removal entries first. Neon updates the block and its ledger atomically.
- Marking a task done shows a highlighted "how far along is the assignment now?" slider when the block belongs to an unfinished assignment.
- **Edit block** opens the shared `BlockForm`: title, date, start/end, notes, optional assignment/task when no work is recorded. Resizing/restoring logged blocks derives status from their existing actual time; logs are unchanged. The assignment’s due date and estimate are reached through **Edit assignment**.
- Total assignment progress is editable for any linked focus block, including completed assignments (saving below 100% explicitly reopens one). Scheduled duration is not an estimate. Legacy task estimates remain internal planner data.
- Blocks do not need an assignment or task. A work block with no task can still log time (no `time_logs` row, since logs need a task) and has a "Mark done" button. If it belongs to an assignment, `projectLogged` includes that block’s actual total alongside task ledger totals without double-counting. Task-less logging has no per-entry notes/trail.
- `estimateProject` returns `uncertain: true` when progress is 0% but at least 2 hours are logged. The UI shows the "can't give an accurate estimate yet" sentence instead of a number.

## Looking back

`reflect-panel.tsx`. Planned vs actual chart and time-of-day follow-through stay. The old stat tiles (Did, Follow-through, Blocks landed) are gone on purpose. **Insights** loads the reflection only when `todayInsightsEnabled` is on. The on-page switch is independent of Plan suggestions and Analytics patterns. Turning it off hides the section and stops new requests, while the charts remain. `insights.ts` caches by date and calendar snapshot so desktop and mobile copies share one request. Superseded responses are ignored. Refresh requests a fresh reflection; the client sends its local minute so expired same-day shifts are excluded. There is no "Compile my week" button anymore.

## Assignment dialog

No subtitle under the title. Fields: name, course (`CourseField` — free text with a full-width list of every existing course), category, priority, "Estimate (hr)", dates, progress slider (edit only), notes, pin. The bottom line shows the likely total, or the uncertain sentence.

## Agenda

`agenda-view.tsx` + `schedule-dialog.tsx`.

- Left on desktop, above on mobile: the list. Toggle Assignments / Events. Filter by class and category (multi-select chips). Sort assignments by due date, priority weight, pinned first, least progress, or most time left. "Show finished" includes completed assignments.
- Right on desktop: month calendar and the selected day's events and due items.
- Day color is `dayLoad()` in `src/lib/analytics.ts`. Score = booked minutes (skipped blocks excluded) plus a due-date penalty (`accuracy` 120, `completion` 60, `flexible` 40, `optional` 20; exams ×1.5). Levels: `free` 0, `light` under 300, `medium` under 420, `heavy` otherwise. UI: open / green "Okay" / orange "Busy" / red "Packed" (`BUSY_STYLE`). Dots on a cell are things due that day.
- **Schedule event** opens `ScheduleDialog`. "Focus block" is `kind: "work"`; with an assignment it is tied to one of its open tasks, without one it just needs a title. New “Event” entries are independent `kind: "life"` personal events, with optional location/meeting link/notes. Existing linked life events remain readable. Nonrepeating entries go through `POST /api/schedule/apply` as a `create` change with an explicit `kind`. Overlaps are warned about and still allowed.

## Plan, Analytics, and Timeline controls

- Plan creates through the same `BlockForm` as Today and Agenda. The manual form comes first. `aiPlannerEnabled` controls availability of a collapsed Tilly section; expansion starts the request, closing cancels it, and editing the time window invalidates old suggestions. `/api/plan` rejects disabled suggestions. Grid movement/resizing edits one occurrence at a time, preserves actual time, snaps to 15 minutes, and offers keyboard controls. Overlaps use separate lanes. Bulk series edits are in the detail editor.
- Analytics keeps the `/rhythm` URL for existing links. It leads with focused time, active days, average per active day, and blocks with logged time. `analyticsPatternsEnabled` hides local heuristic observations independently; no model request is involved. The wind-down rings and explanatory blurbs are removed; axis labels and tooltips retain units.
- Timeline has no booked-work dots. Due dates can be edited with a date field or the bar’s right handle (arrows = one day, Shift = one week). The axis stays stable during a drag and rescales after save. Due dates cannot precede assigned dates.

## Recurring personal events

`recurrence.ts` owns validation, local-date generation, materialization, and scoped edits/deletion. `BlockForm` and `recurrence-fields.tsx` expose daily/weekly/monthly/yearly rules, 1–99 intervals, custom weekdays, monthly date or first/second/third/fourth/fifth/last weekday, and never/until/count endings. Missing month dates and non-leap February 29 are skipped. Count is 1–1000 and includes cancelled/moved exceptions.

`EventSeries` holds the template, rule, original start, `stopBefore`, and exclusions. `CalendarEvent.occurrenceDate` is the original recurrence identity even after a move; `isException` protects individual edits. Series changes preserve past/completed work and exceptions. Following edits split the definition, preserving the remaining count. All edits create a fresh generation ID to avoid collisions with preserved history. Exceptions still consume the count when the new pattern no longer lands on their date. Reducing a count does not delete preserved history or individual exceptions.

Deletion offers this/following/all, records exclusions/cutoffs, and rejects recorded time. Creation can atomically convert an unworked personal event. Generation starts with a rolling year and extends when Agenda browses farther (up to five years ahead); never-ending rules stay saved beyond that display horizon. Existing occurrences always win, preventing duplicates after skip/move/delete. Calendar times remain local wall-clock minutes through DST. This is native recurrence, not Google sync or an RFC 5545 import/export engine.

Neon stores definitions in `event_series.definition` JSONB. Occurrence uniqueness is `(series_id, occurrence_date)`. Loads use a consistent read transaction; expansion and series mutation share a calendar advisory lock. A definition revision changes when an occurrence is edited, so a stale bulk edit returns 409 instead of overwriting it. Series updates/deletions and occurrence replacement are atomic, with removed rows locked and checked. Generation/insertion is batched to avoid a request per occurrence. These SQL paths need a configured Neon database for live integration testing.

## Data model

Types: `src/lib/types.ts`. SQL: `db/schema.sql`. The app applies the SQL itself on the first Neon request (`src/lib/store/neon.ts` strips `--` comments, then splits on `;`). Do not put a semicolon inside a string literal or use `DO $$` blocks.

`projects` (assignments): `course`, `type`, `priority`, `notes` (max 2000 via the API), `pinned`, `pin_count`, `pin_order`, `target_minutes`, `assigned_date`, `due_date`, `progress_percent` (null until the user reports it), `completed_date`.

A newly pinned assignment goes to the end of the pinned list (`pin_order` = max + 1). `pin_count` increments only on the transition from unpinned to pinned (memory store and the Neon `UPDATE`). Un-pinning does not decrement it. That history is what the planner learns from, so do not reset it when the user unpins.

`events`: `date` is `YYYY-MM-DD`, `start_min` / `end_min` are minutes from local midnight. This is timezone-agnostic on purpose. `actual_minutes` is what was logged. `kind` is `work` or `life`. `moved_from_*` records the first move. Event details are `location`, `meeting_url`, and `notes`. Recurrence fields are `series_id`, `occurrence_date`, and `is_exception`; `event_series` stores definitions. New columns have idempotent upgrades. `WeekData` also returns `series`.

`time_logs` stores signed entries that can be edited or deleted. Their sum must stay consistent with the linked block's actual time. `check_ins` is one row per user per date, rating 1–10.

Schema upgrades for old databases are the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements plus the category migration at the bottom of `schema.sql` (`studying` → `exam`, `writing` → `project`, drop the old `projects_type_check`).

## Time, windows, pace, estimates

- The client sends `today` and `now`. Do not compute "today" on the server from UTC if a user-facing day is involved.
- `windowDates(today)` is today−3 through today+3 (`WINDOW_BACK`, `WINDOW_AHEAD`), so today is centered. The Today strip and backtracking stats use this window.
- `projectHealth` pace: `done` when a reliable estimate has no remaining work or percent ≥ 100; `ahead` when planned **work** minutes from today through the due date cover the estimate; `behind` when ≤4 days remain and less than 60% of the remainder is booked; otherwise `on-track`. An uncertain estimate cannot imply Done or Ahead, and is Behind near its deadline.
- `estimateProject`: if the user has reported progress and logged time, blend a pace estimate with the category estimate. The blend trusts pace more as progress passes 50% (`weight = min(1, progress/50)`). Otherwise use the course+type multiplier from finished assignments, then type-only, then the user's original target. Finished assignments are the training set (`completedDate` set).
- Rhythm wind-down (`rhythmInsights`) ignores today's night. A partial day reads as "wrapping up early" and is a known bug if you include it. Sessions before 4:00 count toward the previous night (`windDownByDay`).
- Disabling check-ins excludes saved ratings from both `recentMood` and `moodCorrelation`, including the local planner and Gemini's rhythm context. It does not delete the saved entries.

## Pins and the planner

`pinPreferences` in `analytics.ts` sums `pinCount` across assignments. It returns nothing until the total is at least 3. A course or category is "usually pinned" when it holds at least 35% of all pins.

`attentionWeight` multiplies priority weight by 1.3 if currently pinned, 1.1 if the course matches the habit, 1.1 if the category matches. `planCandidates` sorts by urgency × that weight. Gemini sees `priority`, `pinned`, `notes` (trimmed), and `usuallyPins` (`src/lib/ai/engine.ts`, prompts in `src/lib/ai/prompts.ts`). When something has to give, optional and flexible work goes before accuracy work and pins.

`mockBreakdown` (`src/lib/ai/planner.ts`) is the no-key planner. It skips tasks with under 25 minutes left, leads with heavier work unless the user has been rating days ≤5 or the block starts at 21:00 or later, and mentions the pin in the segment reason.

## AI pipeline

`src/lib/ai/engine.ts` calls Gemini (`gemini-3.5-flash-lite` first with minimal thinking, JSON schema; see the fallback list in `gemini.ts`) when `GEMINI_API_KEY` is set, and `fallback.ts` / `mockBreakdown` otherwise. Failures fall back; they do not 500 the request.

`sanitizeScheduleChanges` in `schedule-validation.ts` checks real assignment/task ids, positive intervals, local dates, past destinations, waking hours (8am–10pm), and overlaps, including within a batch. Both Gemini and local proposals go through it. The apply API validates references and intervals again and rejects stale proposals targeting a block that is no longer planned. Manual scheduling still permits overlaps and unassigned focus blocks.

Schedule application returns `createdEventIds` and `previousEvents` for that operation. Tilly uses them for Undo: newly added blocks are deleted and existing blocks restore their times, status, and original move history. A new block with logged work cannot be deleted. Failures leave the turn available for retry instead of falsely marking it undone.

Guidance prompt text is `MODE_RULES` in `prompts.ts`. Lighthouse is still the `coach` key there.

ElevenLabs: `POST /api/tts`. Returns 501 without a key; the client uses `speechSynthesis`. Voice input is the Web Speech API. Defaults in `src/lib/voice.ts` (Rachel, `21m00Tcm4TlvDq8ikWAM`, `eleven_flash_v2_5`).

## Store and API

`getStore()` (`src/lib/store/index.ts`) uses Neon when `DATABASE_URL` is set, otherwise the in-memory store on `globalThis.__calendarMemory`. The memory store is per server process and is replaced by `reset`. Both stores implement `src/lib/store/types.ts`. A new field has to be added in **both** stores, the seed, and the SQL.

Client mutations go through `src/hooks/use-week.ts` and are serialized; stale loads cannot overwrite a newer mutation. `togglePin` updates the UI immediately, then PATCHes.

| Route | Method | Body / behavior |
| --- | --- | --- |
| `/api/week?today=` | GET | Full `WeekData` plus integration flags; optional `through` extends recurrence generation |
| `/api/events/:id` | PATCH / DELETE | Edit title, status, date, duration, details, safe associations, or move history; delete an unworked block for Undo |
| `/api/event-series` | POST | Create series or convert one unworked personal event |
| `/api/events/:id/series` | PATCH / DELETE | Scoped series edit or this/following/all deletion |
| `/api/events/:id/log` | POST | `{ minutes, note }` — ±1 to 720; negative takes time off. Updates `actual_minutes` and appends a time log |
| `/api/logs/:id` | PATCH / DELETE | Edit `{ minutes, note }` or remove a trail entry; the event's actual time follows |
| `/api/projects/pin-order` | PUT | `{ ids }` in display order |
| `/api/tasks/:id` | PATCH | `{ done }` |
| `/api/projects` | POST | create assignment + first task |
| `/api/projects/:id` | PATCH | name, course, type, priority, notes, pinned, dates, target, progress, completedDate |
| `/api/checkins` | PUT | `{ date, rating, note }` upsert |
| `/api/plan` | POST | `{ date, startMin, endMin, today }` → breakdown (403 when disabled) |
| `/api/schedule/adjust` | POST | `{ message, history, now }` |
| `/api/schedule/apply` | POST | `{ changes }` |
| `/api/reflect` | POST | reflection for `{ today, minute }` (client-local time); 403 when Today insights are off |
| `/api/settings` | PUT | partial settings, including `todayInsightsEnabled` and `analyticsPatternsEnabled`. **`screenTimeEnabled` is forced `false`.** |
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
- `docs/planning-changes.md` — planning-review changes, verification actions, and tradeoffs
- `docs/screen-time-extension.md` — future extension

## Running and checking

```bash
npm ci
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:4317
npx tsc --noEmit
npm test                     # regression tests for core behavior
npm run lint
```

Every external key is optional. Gemini, ElevenLabs, and Neon each have a fallback (see the table in `README.md`).

Install from the committed lockfile. Keep `shadcn` at the pinned version: older releases lack the
`shadcn/tailwind.css` export used by `globals.css`. Keep `eslint-config-next` aligned with `next`.

`next.config.ts` sets `allowedDevOrigins` for `127.0.0.1`. Without it, Next 16 refuses the client bundle and the app sits on skeletons.

This installed Next.js version writes dev output to `.next/dev` and production output to `.next`, so the two
can run concurrently. Both directories are generated artifacts.

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
