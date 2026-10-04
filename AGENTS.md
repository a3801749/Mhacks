<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tide

Reflective calendar. Product name **Tide**, scheduling companion **Tilly**. Before changing behavior, read `docs/ai-handoff.md`. It is the source of truth for data model, pages, and the traps below.

- Stored guidance values are `anchor` | `coach` | `autopilot`. The UI calls `coach` **Lighthouse** and `autopilot` **Tide**. Do not rename the stored values.
- Assignment categories are `project` | `exam` | `homework` | `reading` | `misc`. Priority is `accuracy` | `completion` | `flexible` | `optional`.
- Times are a `YYYY-MM-DD` date plus minutes from local midnight. The client sends `today`.
- New assignment fields must be added to both stores (`memory.ts` and `neon.ts`), `db/schema.sql` (including an `ADD COLUMN IF NOT EXISTS` upgrade), the seed, and the project API routes.
- `pin_count` only increases when a pin turns on. Do not decrement it on unpin.
- Rhythm wind-down insights must exclude today.
- Time logs can be negative (removals). Keep `actual_minutes` clamped at 0 and status from `statusForActual`. One entry is at most `MAX_LOG_MINUTES`.
- Blocks do not need an assignment or a task.
- `screenTimeEnabled` stays false. Screen time is a documented future extension, not a working feature.
- UI: flat background, `--radius: 0.5rem`, short pace labels (On pace, Behind pace, Ahead, Done). No page-wide gradient, no wave progress bars.
- shadcn primitives use a `render` prop, not `asChild`. `cn` comes from `@/lib/utils`, never from a package named `cn`.
- After adding a route, run `npx next typegen`. `params` in route handlers is a Promise.
