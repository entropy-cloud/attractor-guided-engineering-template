# Mission-Driver Self-Memory — Procedural Lessons

Runtime-generated durable lessons about the mission-driver harness/loop (prompts,
flow, retries, Windows/tooling quirks). Maintained by `mission-driver analyze`
under a consolidate-don't-accumulate protocol. One rule per recurring failure;
each rule is imperative and points at a concrete file or command.

---

## L001 — Treat opencode empty-body + exit≠0 as a transient fault, not an onError failure
- **Rule:** When an agent step returns a header-only/empty body with `exitCode !== 0` and no stderr, classify it as a transient provider/CLI crash and retry on the independent transient budget. Never let it consume `onError.maxRetries` or trip `maxCycleVisits`.
- **Origin:** ENV/TOOL   **Severity:** SEV1   **count:** 1   **last_seen:** 2026-07-29
- **Evidence:** `docs/postmortems/2026-07-29-mission-driver-actionable-fixes-postmortem.md` F1 — 39 retries, ~1h10m aborted; `oc-EXECUTE-1785299653961-73hw8q.log` (0-char body), run-state `empty/short output, exit=1 (no stderr captured)`.
- **Fix target:** `src/engine.js` transient block (~`:1698-1744`) — extend the transient signature to include `body.length < PARSE_MIN_BODY_CHARS && exitCode !== 0 && !stderrTail`.

## L002 — Give execute/closure prompts an "already-landed" short-circuit
- **Rule:** Tell EXECUTE and CLOSURE_AUDIT agents: if the code and tests are already present (inconsistent state: work done, boxes unticked), tick the items, run the test gate ONCE, and emit the result marker immediately. Do not re-derive or re-run the full verification suite for already-landed work.
- **Origin:** PROMPT   **Severity:** SEV1   **count:** 1   **last_seen:** 2026-07-29
- **Evidence:** `docs/postmortems/2026-07-29-mission-driver-actionable-fixes-postmortem.md` F2 — agents burned whole turns re-verifying and were cut off mid-sentence; `CLOSURE_SCRIPT_CHECK` failed all visits ("17 unchecked items remain") despite green build.
- **Fix target:** `prompts/execute.md` (near top) and `prompts/closure-audit.md`.

## L003 — Gate rate-limit backoff on a real rate-limit signal, not on duration alone
- **Rule:** Never assume a short-duration failure is a rate limit. Only back off (30s+) when there is an actual provider rate-limit/overload signature in stderr or a transient flag. For empty-body no-stderr crashes, use a short fixed delay (2–5s) or none.
- **Origin:** FLOW   **Severity:** SEV2   **count:** 1   **last_seen:** 2026-07-29
- **Evidence:** `docs/postmortems/2026-07-29-mission-driver-actionable-fixes-postmortem.md` F3 — `backing off 30-90s before retry (previous attempt lasted 6s — likely rate-limited)` ×19; `src/engine.js:1780` keys on `durationMs < 60_000`.
- **Fix target:** `src/engine.js:1780-1792`.

## L004 — Do not reference {{forEachItem}} in a forEach-container step's prompt
- **Rule:** `{{forEachItem}}` is bound per child subflow, not to the forEach-container step. Remove it from container prompts (e.g. EXEC_PLANS) or move the text into the per-item subflow prompt.
- **Origin:** FLOW   **Severity:** SEV3   **count:** 1   **last_seen:** 2026-07-29
- **Evidence:** `docs/postmortems/2026-07-29-mission-driver-actionable-fixes-postmortem.md` F4 — `WARNING: unresolved template variable {{forEachItem}}` on EXEC_PLANS.
- **Fix target:** `flows/mission-driver.json` EXEC_PLANS step.
