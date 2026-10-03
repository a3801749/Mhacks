# Demo walkthrough

A script for showing how the platform works, for teammates or a 3–4 minute hackathon demo. It uses the built-in demo
week, so it runs without any API keys (Gemini, ElevenLabs and Neon just make it real).

**Before you start:** `npm run dev`, open http://localhost:4317, then in Settings click **Reset demo week**. To show
onboarding, clear the flag first: in the browser console, run `localStorage.removeItem("andy:onboarded")`.

---

### 1. The problem (15s)

> "Weekly reflection is great advice nobody follows, because it means going back through your calendar and adding up
> hours by hand. Andy does the tallying so reflecting takes seconds."

### 2. Onboarding (40s) — `/welcome`

- Click **Start tour** on the banner.
- **Guidance:** pick **Lighthouse**. Point out that you choose up front how much the AI may change your calendar.
- **Extras:** show the three previews. Linger on **Screen time**: "The planned extension would distinguish on-task
  time from distractions within a study block." Point out that this is sample data for a future feature.
- **First assignment:** add `EECS 281 · Homework 8`, course `EECS 281`, type Homework. Point out the tagging.
- **Tour:** quickly read the five cards, then click **Take me to Today**.

### 3. Today (45s) — `/`

- "Looking back first": click a past day in the strip. Point out the planned vs. actual bars and skipped blocks.
- Open a work block: **"You're not starting from zero"**, plus the progress trail.
- Mark a task done, then drag **How far along is EECS 281 · Project 4?** and save progress. Point out the estimate
  changing: it blends your pace with how long past EECS projects took.
- **Insights** loads automatically with patterns, suggested shifts, and questions. Use **Refresh** to request a new
  reading. Note that the AI compiles what happened; the questions are for you to reflect on.

### 4. Tilly (40s)

- Click **Talk to Tilly** → "I'm ordering pizza instead" (speak it if you're in Chrome).
- She proposes a move to a time you historically follow through on → **Sounds good** → **Undo** to show it's safe.
- Switch to **Tide** mode and say "I'm not doing this right now, move it". This time it applies on its own.

### 5. Plan (30s) — `/plan`

- Drag out ~4 hours on tomorrow's column.
- Tilly splits it: hardest and most urgent work first, then a lighter reading, with breaks. Remove one, then add the rest.

### 6. Rhythm (30s) — `/rhythm`

- Switch to **Month** and **Course**. "Screen time, but for your projects."
- Point at the late-night Thesis bars and the day-by-day strips: "You're wrapping up later and later."
- Point at **Late nights cost you the next day** (from the daily check-ins) and **How long things really take**.

### 7. Timeline (20s) — `/timeline`

- "Every assignment from assigned to due. The fill starts the day you began. If it reaches the today line, you're on
  pace." Point out one that's behind.

### 8. Close (10s)

> "Gemini compiles and negotiates, ElevenLabs gives Tilly a voice, and Neon stores the planned-vs-actual time series.
> You still do the reflecting; we just made it painless."

---

## Where each sponsor shows up

| Sponsor | Where to point |
| --- | --- |
| Gemini | Insights, Tilly's replies, Plan breakdowns (`src/lib/ai/prompts.ts`) |
| ElevenLabs | Tilly's voice (`/api/tts`, `src/lib/voice.ts`) |
| Neon | `db/schema.sql`: events (planned vs. actual), time_logs, check_ins |
| Figma | The UI itself; tokens in `src/app/globals.css` |
| Cursor | Built with it |
