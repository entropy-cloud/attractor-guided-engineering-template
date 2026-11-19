/**
 * exit-map.js — engine terminal status → process exit code (O7, plan
 * 2026-07-22-1223-2; hoisted out of main.js by dsh-plugin M1-WI2).
 *
 * MUST stay row-by-row in sync with `EXECUTION-PRINCIPLE.md §11` (the
 * controlling exit-code contract table); the audit O7 itself was a
 * doc-vs-code drift where flow-definition errors were documented as exit 1
 * but silently exited 0 here because they were missing from the map.
 *
 * Exported so test/exit-map.test.js can pin the contract without spawning
 * a full cmdRunMission process. `skipped` and dynamic `done` values emitted
 * by `_result(...)` in engine.js are intentionally NOT mapped (they fall
 * through to Node's default exit 0); see EXECUTION-PRINCIPLE.md §11 + the
 * plan's `Deferred But Adjudicated` section. That carve-out is UNCHANGED by
 * the M5-WI38 addition below.
 *
 * `partial`/`blocked` (M5-WI38, plan 2026-08-27-1023-2) are SUPERVISOR
 * terminal words (03-supervisor.md §8 rules R1–R4, terminal-rules.ts); the
 * engine's `_result(...)` never emits them during the engine's lifetime —
 * the DSH form surfaces them via run-terminal receipt + mdcontrol.status,
 * not exit codes. They enter the table as forward protection required by
 * the §8 terminal-mapping discipline (frozen-contract change via its own
 * work item, before any exposure surface exists): an independent-form
 * surface (CLI wrapper / supervisor CLI / retirement-path backend) exposing
 * them must not fall into the unmapped-word → Node default exit 0 channel
 * ("never silently record an unfinished roadmap as completed"). exit 3 =
 * new class "terminal, not completed, needs human disposition" (remedy =
 * unlock/dispose), deliberately distinct from 2 (budget/limit guards —
 * re-run) and 1 (unrecoverable failure — CI red).
 *
 * Owns zero dependencies so any layer (CLI shell, orchestrator, future
 * plugin hosts) can import the exit-code table alone. `main.js` re-exports
 * it for backward compatibility.
 */
export const EXIT_MAP = {
  completed: 0, single_step_done: 0,
  failed: 1,
  unknown_step: 1, unknown_type: 1, no_transition: 1, invalid_transition: 1,
  max_cycles: 2, max_total_steps: 2, max_retries: 2,
  ping_pong: 2,  // loop-guard alignment (Phase 1 Decision alternative 1)
  partial: 3, blocked: 3,  // supervisor terminal words — human disposition (M5-WI38)
};
