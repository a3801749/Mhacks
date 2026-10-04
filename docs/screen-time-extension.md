# Screen time insights: build guide

**Status:** not built. The app shows a preview using sample data (`src/lib/screen-time.ts`,
`src/components/app/screen-time-preview.tsx`), and the toggle in Settings is disabled.

## What it does for the user

During a planned work block, a browser extension records **which sites are in the active tab** and **whether the
person is actually at the computer**. When the block ends, Tide gets per-domain totals for that block:

| | |
| --- | --- |
| overleaf.com | 58m (on task) |
| scholar.google.com | 17m (research) |
| youtube.com | 14m (drift) |
| instagram.com | 8m (drift) |
| idle | 14m |

From that, Tide can:

1. **Log real focused time automatically.** A 2-hour block becomes "1h 24m on task" instead of the user typing it in.
2. **Make estimates more honest.** The adaptive estimate (`estimateProject()` in `src/lib/analytics.ts`) uses focused
   minutes, not blocked-out minutes.
3. **Feed the Rhythm view.** Same midnight-to-midnight chart, but showing focus vs. drift inside each block.
4. **Answer the question from the brainstorm:** "How much of a 2-hour study block do I spend scrolling?"

It is **opt-in**, shows up in onboarding step 2 and in Settings, and should be easy to pause.

## Privacy rules (decide these first)

- Store **domains only**. Never full URLs, page titles, or page content.
- Only record **while a work block is running** (or while the user has started a manual session). Nothing outside blocks.
- Show the user exactly what will be sent before it's sent, and allow deleting it.
- Aggregate in the extension. The server receives minute totals per domain per block, not a raw browsing timeline.
- One-click pause from the extension popup.

## Architecture

```
┌──────────────────────── Chrome extension (Manifest V3) ────────────────────────┐
│  service worker (background.js)                                                 │
│   • chrome.tabs.onActivated / onUpdated   → current domain                      │
│   • chrome.windows.onFocusChanged         → is the browser even focused?        │
│   • chrome.idle.onStateChanged (60s)      → is the person at the computer?      │
│   • chrome.alarms every 1 min             → add 1 minute to the current bucket  │
│   • buckets kept in chrome.storage.local: { blockId, domain → minutes }         │
│                                                                                 │
│  popup.html  → shows the current block, live totals, Pause button               │
│  options.html → pair with Tide (paste a token), domain category overrides       │
└───────────────┬─────────────────────────────────────────────────────────────────┘
                │ GET  /api/screen-time/active-block   (which block is running now?)
                │ POST /api/screen-time/usage          (totals when the block ends)
                ▼
┌──────────────────────────── Tide (Next.js) ────────────────────────────────────┐
│  route handlers → store → Neon table screen_time_usage                          │
│  analytics: focusSummary(), focused minutes feed estimates and Rhythm           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Why the browser rather than OS-level screen time: it works on every OS, needs no native permissions, and coursework
mostly happens in the browser anyway (Overleaf, Google Docs, Canvas, Gradescope). Phone screen time is out of scope;
Apple and Google don't expose it to third parties in a usable way.

## Step-by-step build

### 1. Extension skeleton

```
extension/
  manifest.json
  background.js
  popup.html
  popup.js
  categories.js
```

`manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Tide — focus tracker",
  "version": "0.1.0",
  "description": "Counts which sites you use during your Tide work blocks. Domains only, opt-in.",
  "permissions": ["tabs", "idle", "alarms", "storage"],
  "host_permissions": ["http://localhost:4317/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html" }
}
```

For a deployed app, add its origin to `host_permissions`.

Load it with `chrome://extensions` → Developer mode → **Load unpacked** → pick `extension/`.

### 2. Track the active domain, focus, and idle

`background.js`:

```js
import { categorize } from "./categories.js"

const API = "http://localhost:4317"
let state = { domain: null, focused: true, idle: false }

chrome.idle.setDetectionInterval(60)
chrome.idle.onStateChanged.addListener((s) => (state.idle = s !== "active"))
chrome.windows.onFocusChanged.addListener((id) => (state.focused = id !== chrome.windows.WINDOW_ID_NONE))

async function refreshDomain() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  try {
    state.domain = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, "") : null
  } catch {
    state.domain = null
  }
}
chrome.tabs.onActivated.addListener(refreshDomain)
chrome.tabs.onUpdated.addListener((_, info) => info.url && refreshDomain())

chrome.alarms.create("tick", { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener(async () => {
  const { paused, token } = await chrome.storage.local.get(["paused", "token"])
  if (paused || !token) return

  const block = await fetch(`${API}/api/screen-time/active-block`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => (r.ok ? r.json() : null))

  const { bucket } = await chrome.storage.local.get("bucket")
  // The previous block just ended, so send its totals.
  if (bucket && bucket.blockId !== block?.id) {
    await flush(bucket, token)
    await chrome.storage.local.remove("bucket")
  }
  if (!block) return

  const key = state.idle || !state.focused ? "idle" : state.domain ?? "idle"
  const next = bucket?.blockId === block.id ? bucket : { blockId: block.id, minutes: {} }
  next.minutes[key] = (next.minutes[key] ?? 0) + 1
  await chrome.storage.local.set({ bucket: next })
})

async function flush(bucket, token) {
  const sites = Object.entries(bucket.minutes).map(([domain, minutes]) => ({
    domain,
    minutes,
    category: domain === "idle" ? "idle" : categorize(domain),
  }))
  await fetch(`${API}/api/screen-time/usage`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ eventId: bucket.blockId, sites }),
  })
}
```

Notes:
- A 1-minute alarm is the minimum MV3 allows, which is plenty for this.
- The service worker can be killed at any time. That's why the bucket lives in `chrome.storage.local`, not in memory.

### 3. Categorize domains

`categories.js`, starting with a default list the user can override in options:

```js
const DEFAULTS = {
  focus: ["overleaf.com", "docs.google.com", "github.com", "colab.research.google.com", "notion.so"],
  reference: ["scholar.google.com", "stackoverflow.com", "developer.mozilla.org", "wikipedia.org", "chatgpt.com"],
  distraction: ["youtube.com", "instagram.com", "tiktok.com", "reddit.com", "x.com", "netflix.com"],
}

export function categorize(domain) {
  for (const [cat, list] of Object.entries(DEFAULTS)) {
    if (list.some((d) => domain === d || domain.endsWith(`.${d}`))) return cat
  }
  return "reference"
}
```

A stretch goal is to let Gemini categorize unknown domains *relative to the block's assignment*. YouTube is a
distraction during "Write methods section" but research during "Watch lecture 12".

### 4. Server: schema

Add to `db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS screen_time_usage (
  event_id  TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  domain    TEXT NOT NULL,
  category  TEXT NOT NULL CHECK (category IN ('focus', 'reference', 'distraction', 'idle')),
  minutes   INTEGER NOT NULL,
  PRIMARY KEY (event_id, domain)
);

CREATE TABLE IF NOT EXISTS extension_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Also add `screenTimeUsage: { eventId, sites: SiteUsage[] }[]` to `WeekData` and to both stores
(`src/lib/store/memory.ts` and `src/lib/store/neon.ts`).

### 5. Server: routes

| Route | Purpose |
| --- | --- |
| `POST /api/screen-time/pair` | Settings → "Connect extension" creates a token and shows it once to paste into the extension |
| `GET /api/screen-time/active-block` | Returns the user's work block that is running right now (`{ id, title, startMin, endMin }`) or 404 |
| `POST /api/screen-time/usage` | `{ eventId, sites }` upserts rows and, if the user allows it, sets the block's `actual_minutes` to focus + reference minutes |

Everything checks the `Authorization: Bearer <token>` header against `extension_tokens`.

`active-block` must match the extension's local time. Have the extension send `?date=YYYY-MM-DD&minute=N` computed in
the browser, the same way the web app already does for `/api/schedule/adjust`.

The extension calls the API from its own origin, so the routes need CORS headers allowing `chrome-extension://<id>`.

### 6. Surface it in the UI

- **Block dialog** (`block-dialog.tsx`): if a block has usage, render `<ScreenTimePreview usage={...} />` with real data
  and a "use focused time as logged time" button.
- **Rhythm** (`rhythm-view.tsx`): split each session in the day-by-day strips into focus and drift shading.
- **Reflection / Gemini context** (`src/lib/ai/engine.ts`): add per-category focus percentages to the reflect and plan
  prompts so Tilly can say "your 9pm blocks are 40% YouTube — want to try 25-minute sprints?"
- **Settings and onboarding**: enable the toggles that are currently disabled once pairing works.

### 7. Test it

1. Load the unpacked extension and pair it with a token.
2. In Tide, create a block that started a few minutes ago (Plan page).
3. Browse a mix of sites for 5 minutes, then let it idle for 2.
4. End the block early by editing its end time, then check `screen_time_usage` in Neon (or the in-memory store) and
   open the block dialog.

## Hackathon scope

To demo it this weekend without building all of the above:

1. Build the extension with steps 1–3. Skip pairing and use a hard-coded token.
2. Implement only `active-block` and `usage` (step 5) against the memory store.
3. Show the real numbers in the block dialog (step 6, first bullet).

Everything else, including Gemini categorization, the Rhythm overlay, and Neon tables, can stay as a slide.
