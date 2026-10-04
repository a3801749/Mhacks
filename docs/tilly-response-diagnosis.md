# Tilly response diagnosis — October 4, 2026

Both the app and Gemini contributed. The reported Lighthouse messages were:

- Typed: “I wanna have lunch with sam again on wednesday at 3pm for an hour,”
- Spoken in the same thread: “I want to have lunch with Sam on Wednesday”

## Findings

The typed response matches the app's fallback template exactly. The old parser missed “wanna have lunch,” so the fallback chose the first upcoming work block and tried to move it. Unrecognized messages generally followed this same path. Historical logs are unavailable, so the reason Gemini fell back in that particular conversation cannot be established.

Live Gemini requests returned HTTP 200 while producing incomplete creates and unnecessary moves. The old schema allowed a create without its date or times. Validation then discarded that create while retaining unrelated moves, or discarded every action while retaining a reply claiming success. Tightening the schema made creates complete in four reruns, but unnecessary moves remained. App validation is essential: Google's [structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output) distinguishes valid JSON from semantically correct values.

The spoken reply also claimed actions were complete in Lighthouse, where changes require Apply. An 8 a.m. to 8 a.m. move has no effect and must disappear from both the proposal and its reply.

## Corrections

- Recognize the reported wording, noon, spoken clock times, and explicit durations. Retain the user's earlier time for a repeat of the same event; ask for missing times.
- Require complete action fields. Ensure the requested personal event survives without a task or assignment association.
- Keep only the requested create and moves of actual clashes, preserving their duration. Discard accommodation moves if the create cannot survive.
- Build replies from effective changes. Lighthouse and Anchor describe proposals; Tide claims completion after persistence. Reject no-op moves and shortenings.
- Ask for clarification on unsupported fallback messages. Negated and hypothetical scheduling/edit requests produce no changes.

These changes use the existing flow and add no UI components or service dependencies.

## Verification

- 101 unit tests passed, including incomplete provider output, unrelated moves, no-ops, exact reported wording, history, and truthful replies.
- Seven final live Gemini cases returned HTTP 200 and the correct requested event: the exact typed message in all three modes, the spoken repeat, a free slot with an 8 a.m. block, noon, and a spoken clock. Missing-time and declined-edit checks returned no actions without calling Gemini.
- Seven focused browser checks passed: Lighthouse Apply actually saves lunch, the final speech transcript carries conversation history, Anchor proposes, Tide persists automatically, clarification completes the event, only real clashes move, and unsupported/declined requests leave the calendar unchanged. Speech recognition itself was simulated; the app's transcript handling was exercised.
- All eight existing product-readiness browser checks passed.
- Production build and ESLint passed; ESLint retains six pre-existing warnings.

For deterministic browser regressions, build and start an isolated server with keys disabled:

```sh
npm run build
DATABASE_URL= GEMINI_API_KEY= ELEVENLABS_API_KEY= npx next start -p 4318
# In another terminal:
E2E_BASE=http://127.0.0.1:4318 npm run e2e:tilly
```

Current live calls were healthy. The fixes protect the app against the observed model mistakes; they do not establish a historical Gemini outage or guarantee every possible natural-language request.
