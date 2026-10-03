# Onboarding

**Live at `/welcome`.** New visitors see a "Start tour" banner on Today; it can be replayed from Settings.
Code: `src/components/app/onboarding-view.tsx`.

## Goals

1. Explain the idea in one screen: *look back before you plan ahead*.
2. Let people choose how much AI they want **before** it starts doing things.
3. Make every extra (check-ins, AI planner, screen time) clearly optional.
4. Get one real assignment in, so the estimate model shows its value right away.
5. End with a map of the four views, so nothing feels hidden.

Target time: under a minute. Every step can be skipped.

## The flow

| Step | Screen | What the user does | What gets saved |
| --- | --- | --- | --- |
| 0 | **Welcome** | Reads three value props: look back first, blocks that know your tasks, Tilly renegotiates | — |
| 1 | **Guidance** | Picks Anchor / Coach / Tide, each with an example of what Tilly would say | `settings.guidanceMode` |
| 2 | **Extras** | Toggles the daily check-in and the AI planner. Sees a live preview of each. Screen time is shown as "coming soon" with sample data | `settings.checkInEnabled`, `settings.aiPlannerEnabled` |
| 3 | **First assignment** | Adds one assignment with course + type + guess + due date, or skips to the demo data | New project + first task |
| 4 | **Tour** | Four cards (Today, Plan, Rhythm, Timeline) with what each is and how to use it, plus a Tilly card. Each card opens that page | `localStorage["andy:onboarded"]` |

### Design notes

- **Previews over descriptions.** Each extra shows what it looks like (the 1–10 row, a sample planner breakdown,
  the screen-time chart) so people decide based on the actual feature.
- **Guidance is chosen up front** because it determines whether the AI ever changes the calendar on its own. People
  should never be surprised by that.
- **No per-session ratings.** The team agreed rating every study session is too much. The single daily rating is the
  low-effort version, and it's still enough for the "late nights → rough days" insight.
- **The first assignment teaches tagging.** The copy explains *why* course and type matter ("EECS projects take you
  longer than EECS homeworks"), so later tagging doesn't feel like busywork.

## Ideas for later

- **Import from Canvas / Google Calendar** at step 3 instead of typing assignments. This is the biggest friction cut.
- **Ask for typical hours** ("When do you usually work?") to seed the Rhythm view before there's history.
- **A sample week mode**: let people try Tilly on demo data before connecting anything (already true today, since
  the demo week is always loaded).
- **Screen time pairing** as a step 2 action once the extension exists (see `screen-time-extension.md`).
- **Persist onboarding per user** in Neon instead of `localStorage` when real accounts exist.
