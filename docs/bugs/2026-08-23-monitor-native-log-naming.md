# Monitor step-log endpoints miss native-mode log artifacts (oc- prefix convention)

> Discovered: 2026-08-23 (dsh-plugin M2-WI10 L4 e2e monitor render check, plan `2026-08-23-1621-2` Phase 2)
> Status: **closed 2026-08-23** — fixed engine-side by dsh-plugin M3-WI11 (plan `2026-08-23-1852-1` Phase 1, engine diff pinned to `monitor.js` + `test/monitor.test.js`)
> Related: `docs/architecture/dsh-plugin-packaging.md` §Implementation state and boundaries (WI7 log-artifact claim, corrected 2026-08-23 by WI10 Phase 3; boundary row CLOSED by WI11); `plugin/dsh/src/native-executor.ts` `genLogFile`

## Symptom

Against a native-mode run (NativeExecutor artifacts `native-<step>-<ts>-<rand>.log[.prompt]` inside the engine run-dir):

- `GET /api/runs/:id` → `stepLogs` is an empty array (the run-detail log panel lists no files).
- `GET /api/runs/:id/logs/:step` → `{"error":"log not found","step":…}`.
- `GET /api/runs/:id/nodes/:step` → `logTail` always `null` (**third site, missed by this doc's original enumeration** — discovered during the WI11 plan's draft review iteration 2; see Fix note below).

Process-mode runs (`oc-<step>-…`) are unaffected. Run list, run detail steps/markers/timing, config/roadmap panels all render native runs normally — only the step-log subset is blind.

## Root cause

`tools/mission-driver/src/monitor.js` hardcodes the process-runner naming convention:

- `listStepLogs` (monitor.js:461,469): regex `^oc-(.+)-(\d+)-([a-z0-9]+)\.log[\.prompt]$`.
- `handleGetLog` (monitor.js:640,646): the `file` param validation requires `safeFile.startsWith("oc-")` and the fallback prefix search uses `oc-${safeStep}-`.
- `handleGetNodeDetail` (monitor.js:929, route registered at :1722): filters step-log candidates by `f.startsWith(`oc-${safeStep}-`)` — the site this doc originally missed; fixing only the two enumerated sites left native runs' node-detail `logTail` permanently null.

NativeExecutor names its artifacts `native-<step>-…` (WI7 deliberate convention, pinned by `plugin/dsh/test/engine-bridge.test.mjs` `step.logFile.startsWith("native-")` and the L2 matrix artifact-signature assertions), so neither site matches.

## Why not fixed immediately

The discovering plan (`2026-08-23-1621-2`) carried an explicit red line: zero engine diff under `tools/mission-driver/src/` for WI10. The packaging doc's WI7 sentence "preserving monitor log viewing" was imprecise: run-state-based rendering is preserved (monitor identity = run-state file-format identity, R3 §3 group 6), but the log endpoints' prefix convention is not. The doc claim was corrected in the same change that recorded this bug.

## Fix (WI11, landed 2026-08-23)

All THREE sites widened to the shared dual-label shape per the suggested approach below: shared constants `STEP_LOG_LABELS = ["oc","native"]` + `STEP_LOG_NAME_RE` (`^(oc|native)-(.+)-(\d+)-([a-z0-9]+)\.log(\.prompt)?$`) + `stepLogPrefixes()` helper; `listStepLogs` single-regex match (log/prompt discriminated by the optional group), `handleGetLog` `?file=` fast-path gate now regex-based with the basename/charset safety checks and newest-first mtime ordering preserved, prefix search over both labels, and `handleGetNodeDetail` (the third site) over both labels.

Verification: engine monitor unit cases with both naming forms incl. `.prompt` variants, `?file=` fast path, and node-detail `logTail` (oc- zero-regression case included) — engine suite **656/656**; `./verify-age.sh` exit 0; `verify:e2e` re-run with in-script machine assertions (`assertMonitorRender`: stepLogs non-empty + `/logs/:step` 200 + node-detail `logFile`/`logTail` over all four runs, both labels) — three consecutive green runs, evidence `docs/testing/2026/08-23.md` (WI11 note) and `docs/logs/2026/08-23.md`.
