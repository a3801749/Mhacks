# Product readiness review

Reviewed on October 4, 2026. The incoming range was `c475b01..ea63a62`: all 19 commits since the previous demo-readiness checkpoint, ending at the fetched `origin/main`. Corrections are committed individually on `fix/product-readiness-review`.

The review found necessary changes in data consistency, stale writes, Undo, accessibility, request validation, and documentation. Product names, stored enums, local-time representation, and the established visual design remain as documented in the handoff.

## Required corrections

| Finding | Verified failure | Correction |
| --- | --- | --- |
| Per-change Undo | Same-time creates returned in a different order could delete the wrong event. Later Undo in a batch restored the whole batch's original state. Older Undo could overwrite a later move. | Match created blocks by full identity, record each item's preceding state, and reject Undo after conflicting later changes. Preserve recorded work. |
| Stale schedule writes | A proposal validated earlier could be applied after a block was completed or deleted. Neon could overwrite a concurrent edit or recreate a deleted row. | Both stores validate at the write boundary. Neon locks and compares affected rows inside the batch transaction; conflicts return 409 and roll back the entire batch. |
| Guidance during model requests | Automatic application used the guidance setting captured before the model responded. | Reload the calendar and guidance after the model returns, sanitize against the latest state, and honor the current mode. |
| Course identity | `CHEM 101`, `chem 101`, and ` CHEM   101 ` appeared as one picker option but filtered, grouped, estimated, or prioritized as different courses. Saved colors were ignored in course-level views. | Share normalized course matching across filters, overview, analytics, learned estimates, and pin habits; retain catalog display names and colors. |
| Course picker accessibility | Keyboard highlighting did not expose the active option to assistive technology. | Supply option IDs and `aria-activedescendant`; reset selection when the query changes. |
| Catalog updates | Existing courses could not be updated at the 100-course limit; an omitted color could replace a saved color. | Apply the limit only to new entries and preserve existing colors when omitted. |
| Previous-week creation | **Add a block** while viewing the previous week opened tomorrow's date, outside the visible week. | Initialize new blocks in the displayed week when browsing away from the current week. |
| Requested event completion | An unrelated make-up work create could suppress the requested dinner or inherit its time. The offline reply could call an occupied slot free. | Identify and fill only the requested event, retain other creates, and acknowledge remaining overlaps. |
| Offline scheduling discussion | Declining or asking hypothetically about scheduling could move an unrelated work block, including in Tide mode. | Return no offline changes for explicitly negated or hypothetical scheduling messages; regression-test Lighthouse and Tide. |
| Malformed requests and local dates | Null bodies or non-text assignment names could produce server errors. Initial assignment creation did not send the client's day. | Return 400 for invalid payload shapes, filter conversation history, validate local minutes, and send `today` when creating assignments. |
| Documentation | Setup and demo instructions still named **Add class** and **Sounds good**, and omitted the standalone course API. | Update README, handoff, and walkthrough to the current controls and behavior. |

## Incoming commit coverage

Each commit's product changes were inspected, then checked against the final app and its regression suite.

| Commit | Area reviewed | Result |
| --- | --- | --- |
| `d37146d` | Progress labels and browser click-through | Retained; accessibility and browser checks run. |
| `f6f335a` | Completed/skipped blocks; series, check-in, task validation | Retained; added payload-shape guards and write-boundary validation. |
| `67186f7` | Plan click handling, shared insights, dates, recurrence | Retained; regression suite and browser sweep pass. |
| `6927c7e` | Duplicate submissions and assignment form synchronization | Retained; mutation flows included in browser checks. |
| `15e14c3` | Scratch probe removal | Reviewed repository/test changes. |
| `3329bb7` | Onboarding settings and tour replay | Retained; welcome flow included in browser sweep. |
| `22cd4e1` | Hover gap controls and leading-slot creation | Retained; gap regressions pass. |
| `6dad95e` | Breathing-room label and hover replacement | Retained; controls checked in the final app. |
| `d46b1a6` | Companion rename to Tilly | Checked final branding with the later Tide rename. |
| `5db7e91` | Gemini lite models and thinking settings | Configured Gemini request returned a validated proposal. |
| `de6cdaf` | Requested events and making room | Corrected requested-event identity and overlap reporting. |
| `c3de35a` | Per-change proposals, application, Undo, day preview | Corrected Undo identity, sequential snapshots, and later-change protection. |
| `35c6ce0` | Adding Plan suggestions individually | Retained; scheduling and browser checks pass. |
| `8d54a2b` | Weekly lecture, section, and lab series | Course creation with recurring class times verified in the browser. |
| `4ab3085` | Filling incomplete events and proposing moves | Corrected filling of unrelated creates; added scheduling-request regressions. |
| `612d044` | Feature documentation | Updated to match subsequent course and control changes. |
| `1ee7cec` | Tide product name; Tilly companion | Final shared brand constants checked. |
| `35f1491` | Standalone courses and optional class times | Corrected identity, colors, catalog limits, and keyboard selection. |
| `ea63a62` | Plan week navigation | Corrected previous-week block initialization; both navigation directions verified. |

## Verification

- `npm ci` installed the committed lockfile; dependency versions and lockfile were not changed.
- `npm test`: **77/77 pass**, including 13 added regressions.
- `npx next typegen`, `npx tsc --noEmit`, and `npm run build`: pass.
- `npm run lint`: no errors; six pre-existing unused-variable warnings in old probes and recurrence tests.
- `npm run e2e`: **221 clicks across all six pages**, zero reported issues.
- `npm run e2e:readiness`: **eight focused scenarios pass**, covering course identity/color, keyboard selection, week dates, recurring classes, malformed payloads, catalog limits, unordered creates, and sequential Undo with mobile controls.
- Actual Neon-store SQL executed against local PostgreSQL through PGlite: normal application, concurrent completion/deletion/detail edits, recorded-work protection, and case-insensitive course upsert all pass. Races were injected between snapshot loading and the write transaction.
- Configured Gemini: HTTP 200, `source: "gemini"`, with dinner creation and moves validated by the app.
- Configured ElevenLabs: HTTP 200, valid `audio/mpeg` response.
- `git diff --check`: pass.

## Remaining limits

`DATABASE_URL` is not configured in this workspace. The SQL check exercises actual PostgreSQL statements with an injected local transport; live Neon HTTP behavior and concurrent database connections still need a configured database. Gemini and voice checks establish that the configured integrations respond, rather than exhaustively evaluating model quality or browser speech recognition.

`npm audit` reports nine high-severity package entries through the `braces` dependency chain in shadcn/Next lint tooling. The upstream advisory lists no patched version as of this review. See [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Audit's suggested downgrades conflict with the required shadcn CSS export and matching Next ESLint version, so they were not applied. App inspection found no direct route accepting user-provided glob patterns; that observation is not an assurance that every transitive use is safe.

## Reproduce the focused browser checks

The browser test resets its server's demo data. Use the isolated memory/no-key server below; the script rejects a server reporting Neon or enabled paid integrations before resetting.

```bash
npx playwright install chromium
DATABASE_URL= GEMINI_API_KEY= ELEVENLABS_API_KEY= npx next dev -p 4318
```

In a second terminal:

```bash
E2E_BASE=http://127.0.0.1:4318 npm run e2e:readiness
```
