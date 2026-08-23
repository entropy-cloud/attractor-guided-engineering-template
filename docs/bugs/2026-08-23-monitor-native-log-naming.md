# Monitor step-log endpoints miss native-mode log artifacts (oc- prefix convention)

> Discovered: 2026-08-23 (dsh-plugin M2-WI10 L4 e2e monitor render check, plan `2026-08-23-1621-2` Phase 2)
> Status: open (follow-up; engine-side fix deliberately out of WI10's zero-engine-diff red line)
> Related: `docs/architecture/dsh-plugin-packaging.md` §Implementation state and boundaries (WI7 log-artifact claim, corrected 2026-08-23 by WI10 Phase 3); `plugin/dsh/src/native-executor.ts` `genLogFile`

## Symptom

Against a native-mode run (NativeExecutor artifacts `native-<step>-<ts>-<rand>.log[.prompt]` inside the engine run-dir):

- `GET /api/runs/:id` → `stepLogs` is an empty array (the run-detail log panel lists no files).
- `GET /api/runs/:id/logs/:step` → `{"error":"log not found","step":…}`.

Process-mode runs (`oc-<step>-…`) are unaffected. Run list, run detail steps/markers/timing, config/roadmap panels all render native runs normally — only the step-log subset is blind.

## Root cause

`tools/mission-driver/src/monitor.js` hardcodes the process-runner naming convention in two places:

- `listStepLogs` (monitor.js:461,469): regex `^oc-(.+)-(\d+)-([a-z0-9]+)\.log[\.prompt]$`.
- `handleGetLog` (monitor.js:640,646): the `file` param validation requires `safeFile.startsWith("oc-")` and the fallback prefix search uses `oc-${safeStep}-`.

NativeExecutor names its artifacts `native-<step>-…` (WI7 deliberate convention, pinned by `plugin/dsh/test/engine-bridge.test.mjs` `step.logFile.startsWith("native-")` and the L2 matrix artifact-signature assertions), so neither site matches.

## Why not fixed immediately

The discovering plan (`2026-08-23-1621-2`) carried an explicit red line: zero engine diff under `tools/mission-driver/src/` for WI10. The packaging doc's WI7 sentence "preserving monitor log viewing" was imprecise: run-state-based rendering is preserved (monitor identity = run-state file-format identity, R3 §3 group 6), but the log endpoints' prefix convention is not. The doc claim was corrected in the same change that recorded this bug.

## Suggested fix (when taken)

Widen both monitor sites to accept the shared `<label>-<step>-<ts>-<rand>.log` shape (runner labels `oc-`, native labels `native-`), e.g. regex `^(oc|native)-(.+)-(\d+)-([a-z0-9]+)\.log(\.prompt)?$` + prefix search over both labels; keep newest-first ordering. Engine test additions: monitor unit cases with both naming forms. Verify against a re-run of `npm --prefix plugin/dsh run verify:e2e` plus the engine monitor test suite.
