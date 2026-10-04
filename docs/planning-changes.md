# Planning review: calendar controls and editing

This pass applies the user’s request to the proposals in `MHacks Planning.md`. The document supplied product feedback; it was not treated as a separate set of agent instructions. Two clarifications determined the scope: custom recurrence with series editing, and the Plan header showing “open” after restoring a booked personal event.

The main product boundary is unchanged: assignments own estimates and reported completion; blocks reserve time and record what happened. Tilly is an optional companion. Manual calendar editing must remain useful with every suggestion panel hidden and with no external service keys.

## What changed and why

| Area | Change | Reason |
| --- | --- | --- |
| Visibility | Independent, saved switches for Today insights, Plan suggestions, and Analytics patterns, available on the page and in Settings | People can choose the assistance they want in each view. Analytics patterns are local calculations; hiding them does not require an AI request. |
| Plan creation | Manual form first; Tilly’s suggestions in a collapsed section below it | Drawing a time window should immediately let the user create their own block. Suggestions load only after expansion, can be removed individually, and expire when their time window or calendar changes. |
| Shared editor | Today, Agenda, and Plan use the same form for title, date, start/end, notes, and optional assignment/task | Calendar edits should not require finding a particular tab. Scheduled duration is shown as scheduled time, without a block estimate. |
| Assignment progress | Linked focus blocks expose total reported assignment progress and an **Edit assignment** action for due date/estimate | A work session is part of an assignment; finishing or resizing a block does not by itself establish assignment completion. Finished assignments can explicitly be reopened by saving progress below 100%. |
| Personal events | Location, meeting URL, notes, repeat rules, and this/following/all edit/delete scopes | Appointments and classes need calendar details without requiring an assignment. |
| Plan grid | Move existing blocks between days and resize their end; 15-minute snapping, separate overlap lanes, keyboard controls, touch movement grip | Users can directly change the time they reserved. Logged time and history survive movement/resizing. |
| Timeline | Remove booked-work dots; add due-date fields and draggable right edges | The view stays focused on assignment span, completion, and deadline changes. It can extend into the future after an edit. |
| Today | Balanced gap spacing, correct overlap frontier, visible add controls after the final block and in valid gaps | Empty time should be usable, including on touch devices. Nested overlaps should not produce a false gap. |
| Overview / Looking Back | Visible scroll tracks with content gutters; consistent heading style and size | Long lists remain navigable without covering their text. |
| Analytics | Rename the visible page/nav, add focused-time stat boxes, remove the screen-time blurb and wind-down rings | The view should explain recorded work without suggesting an unavailable screen-time integration. Units remain in axes and tooltips. Existing `/rhythm` links still work. |
| Small UI details | Larger Agenda key, styled select menus with inset chevrons, matching Tide favicon, updated onboarding/tour text | Fix specific legibility and consistency problems without replacing the app’s design. |
| Booked totals | Count both focus blocks and personal events; exclude skipped entries | Restoring a three-hour event now restores “3h booked” instead of leaving the day “open.” This total is reserved duration, not focused work. |

## Where to try the changes

Run the branch with `npm run dev` and open `http://localhost:4317`. A published deployment needs to be built from this branch before these changes appear there. Without `DATABASE_URL`, data and preferences live in the server process and reset on restart.

| Page | Action | Expected result |
| --- | --- | --- |
| Today `/` | Toggle **Show Tilly insights** off; reopen Settings | Charts remain, the insight panel hides, and the saved preference appears in Settings. It does not disable Plan or Analytics controls. |
| Today `/` | Use **Add something here** after the final block, while at least 15 minutes remain | A manual block form opens with a valid time window. |
| Today `/` | Open a linked focus block, change total assignment progress, then choose **Edit block** | Assignment completion updates independently of scheduled/logged time; date and length can be edited in place. |
| Today `/` | From a block choose **Edit assignment** | Edit the assignment’s estimate or due date without leaving the current view. |
| Plan `/plan` | Draw a window | Manual fields appear first. Opening the dialog alone does not request suggestions. Expand **Tilly’s suggestions** to request them. |
| Plan `/plan` | Turn **Tilly suggestions** off, then draw another window | Manual creation remains available; the optional section is hidden. |
| Plan `/plan` | Drag a block to another day; drag its bottom edge | Date/start or duration changes in 15-minute increments. Focus logged time remains intact. For a repeating event, grid edits affect that occurrence. |
| Plan `/plan` | Focus a move/resize handle and use arrow keys | The same edits are available by keyboard. Move left/right changes day; move up/down and resize arrows change minutes. |
| Plan `/plan` | Create a personal event lasting three hours, skip it, then restore it | The day header changes from “3h booked” to “open” and back to “3h booked,” assuming it has no other bookings. |
| Agenda `/agenda` | **Schedule event** → **Event** → enter details → **Repeats** | Create custom recurrence without selecting an assignment. Browse a later month to load occurrences beyond the initial year. |
| Agenda or Today | Open an occurrence → **Edit block** → choose an edit scope | “This event” creates an exception. “This and following” splits the rule. “All events in this series” updates that series while preserving history and individual exceptions. Delete uses the same scope and a confirmation. |
| Timeline `/timeline` | Drag the right edge of an assignment bar or change its date field | The deadline changes; the chart rescales after save. Arrow keys change one day; Shift changes a week. A due date before the assigned date is rejected. |
| Analytics `/rhythm` | Switch Week/Month or Project/Course; toggle **Show patterns** | Stat boxes and charts update. Local pattern observations can be hidden independently; the removed rings and blurb stay absent. |

## Recurrence behavior

- Daily, weekly, monthly, and yearly intervals from 1 to 99; weekly rules can select multiple weekdays.
- Monthly rules use a calendar date or first/second/third/fourth/fifth/last weekday. The weekday follows the chosen start date.
- Endings: never, inclusive end date, or 1–1000 occurrences. Missing month dates and February 29 in non-leap years are skipped.
- Local dates and minutes preserve wall-clock time through daylight saving changes.
- An occurrence retains its original recurrence key after moving. Skips, one-off edits, and deletions survive subsequent generation; deleted entries do not reappear.
- Cancelled and moved exceptions consume the count. Reducing a count preserves recorded history and existing individual exceptions, so those protected entries can exceed the newly reduced limit.
- A following edit creates a separate series for the changed portion. A later “all” edit applies to that portion, not to the earlier definition.
- The initial display generates through a rolling year. Agenda browsing and a requested Plan suggestion window expand generation up to five years ahead. Never-ending definitions remain saved beyond that horizon.

These are native calendar rules. Google Calendar synchronization, RFC 5545 import/export, attendee invitations, reminders, all-day events, cross-midnight events, and per-event timezone conversion are separate work. They are not implied by the event-details editor.

## Review decisions and feedback

**Keep recorded work stable.** Date and duration can change after logging. Reassigning a logged block to a different assignment/task is rejected, and blocks with ledger entries cannot be deleted. Those restrictions protect the totals and estimate training data; they are not arbitrary limits on calendar editing. Use Skip to retain history.

**Keep completion self-reported.** Booking or logging an hour does not prove a percentage of an assignment is complete. The assignment progress control therefore remains explicit. Legacy task estimates remain internal planner inputs, but their estimate bars are removed from Today cards and block details.

**Keep optional associations optional.** Editing independent focus time retains its empty assignment selection. An assignment block can also omit a task, including when all its tasks are already marked done. Its logged total feeds the assignment’s estimates and Timeline without double-counting task ledger entries. Task-less blocks store the time total on the block; they do not currently have per-entry notes or an editable progress trail.

**Keep manual overlaps available.** Some real plans overlap. The editor warns and the grid separates the cards; it does not silently move or reject them. Booked totals sum reserved durations, so overlapping blocks can count the same wall-clock interval twice. Analytics focused time uses recorded work instead.

**Preserve the app’s useful facts.** Removing AI-heavy copy and rings does not remove chart units, source distinctions, or the documented screen-time preview in onboarding. Screen time remains unavailable and cannot be enabled by the settings API.

**Autonomy is per view.** These switches control optional panels and their requests. Tilly’s conversation and the existing Anchor/Lighthouse/Tide guidance modes retain their established behavior, including Tide’s automatic application of conversational proposals. Hiding Plan suggestions does not silently change that mode.

## Verification and remaining limits

Regression coverage includes booked totals after restore, overlap gaps, drag/resize boundaries and lanes, far-future Timeline layout, recurrence interval/date/count rules, missing dates, DST, exception preservation, scoped edits/deletion, optional task associations, assignment totals without double-counting, and recorded-work safety.

Local HTTP checks cover series creation, moved exceptions, following/all editing, log-preserving resize and skip/restore, due-date validation, independent settings, disabled suggestion endpoints, page responses, and the favicon. Test-created data is removed and the original calendar/settings are restored afterward.

Type generation, TypeScript, ESLint, and all 42 regression tests pass. The default dev server serves the pages. Production Webpack compilation passes with the existing cached font files, avoiding Google requests. Default Turbopack production verification is limited by its handling of the offline font responses; it is not counted as a passed build.

Both memory and Neon implementations and idempotent SQL upgrades are updated. Neon series mutations use transactions, an advisory lock, revision checks, and batched occurrence writes. No live Neon, Gemini, or ElevenLabs calls were made under the user’s network restriction, so those integrations still need verification in a configured environment. Browser visual review covered the week grid and manual/event dialog structure; complete pointer/touch and mobile journeys remain a useful hands-on check.

The existing MVP still uses a shared demo account and has no production account isolation. This pass does not change that architecture.
