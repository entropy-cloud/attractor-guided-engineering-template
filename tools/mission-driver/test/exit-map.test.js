// O7 — `exit-map.js` (hoisted from main.js by dsh-plugin M1-WI2)
// `EXIT_MAP` exit-code contract regression suite (plan
// 2026-07-22-1223-2). Pins `EXECUTION-PRINCIPLE.md §11` row-by-row: every
// status the operator doc promises an exit code for must actually have one
// in the map, mapped to the documented value.
//
// Before the O7 fix the map was
//   { completed: 0, single_step_done: 0, failed: 1,
//     max_cycles: 2, max_total_steps: 2, max_retries: 2 }
// so `unknown_step` / `unknown_type` / `no_transition` / `invalid_transition`
// (documented exit 1) and `ping_pong` (documented ambiguously as `—`) all
// fell through to `undefined` → Node's default exit 0 (success). Anyone
// scripting the driver (`./tools/mission-driver.sh X && next-step`, or a CI
// gate) treated a flow-definition error or a death-loop as success.
//
// Two assertion blocks:
//   1. Documented-status mapping — for each documented terminal status in
//      EXECUTION-PRINCIPLE.md §11 (`completed`, `failed`, `max_cycles`,
//      `max_total_steps`, `max_retries`, `ping_pong`, `unknown_step`,
//      `unknown_type`, `no_transition`, `invalid_transition`, `partial`,
//      `blocked`) AND `single_step_done` (documented in
//      single-step.test.js:6 comment), assert `EXIT_MAP[status]` equals the
//      documented exit code. This is the row-by-row contract pin O7 names.
//   2. No-documented-status-maps-to-undefined sweep — iterate the same
//      documented set and assert none is `undefined` in `EXIT_MAP`.
//      Scoped EXPLICITLY to the documented set: the engine emits
//      additional statuses NOT in §11 (notably `skipped` at engine.js
//      `_result(...)` call sites, and dynamic `done` values like
//      `onMaxRetries.done`) which are intentionally NOT in `EXIT_MAP` and
//      therefore intentionally map to `undefined` (exit 0 by Node's
//      default). Asserting the engine's full terminal-status set would be
//      self-contradictory with the `skipped` deferral; the sweep's contract
//      is "every status the doc promises an exit code for actually has one"
//      — the exact gap O7 names. (See plan `Deferred But Adjudicated`.)
//
// M5-WI38 (plan 2026-08-27-1023-2) added `partial`/`blocked` → exit 3.
// They are SUPERVISOR terminal words (03-supervisor.md §8 R1–R4) — the
// engine `_result(...)` never emits them; the rows exist so an
// independent-form exposure surface cannot fall into the unmapped-word →
// exit 0 channel. The `skipped`/dynamic-word fall-through carve-out is
// unchanged and still pinned by the dedicated describe blocks below.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Hoisted home (dsh-plugin M1-WI2): exit-map.js owns the table; main.js
// re-exports it for compatibility. The pin targets the definition module.
import { EXIT_MAP } from "../src/exit-map.js";

// Single source of truth for the documented contract. Each row: status →
// documented exit code per `EXECUTION-PRINCIPLE.md §11` (+ the
// `single_step_done → 0` note in `single-step.test.js:6`; `partial`/`blocked`
// → 3 per §11 M5-WI38 rows). If §11 adds or changes a row, this table is
// the one place to update; both assertion blocks below consume it, so the
// contract stays pinned end-to-end.
const DOCUMENTED = {
  completed: 0,
  single_step_done: 0,
  failed: 1,
  unknown_step: 1,
  unknown_type: 1,
  no_transition: 1,
  invalid_transition: 1,
  max_cycles: 2,
  max_total_steps: 2,
  max_retries: 2,
  ping_pong: 2,  // Phase 1 Decision alternative 1 — loop-guard alignment
  partial: 3,   // M5-WI38 — supervisor terminal word, human disposition
  blocked: 3,   // M5-WI38 — supervisor terminal word, human disposition
};

describe("O7 — EXIT_MAP documented-status mapping (EXECUTION-PRINCIPLE.md §11)", () => {
  for (const [status, expected] of Object.entries(DOCUMENTED)) {
    it(`maps ${status} → exit ${expected}`, () => {
      assert.equal(
        EXIT_MAP[status],
        expected,
        `EXIT_MAP[${JSON.stringify(status)}] must be ${expected} per EXECUTION-PRINCIPLE.md §11 (got ${EXIT_MAP[status]})`,
      );
    });
  }
});

describe("O7 — no documented status maps to undefined (sweep, scoped to §11 set)", () => {
  it("every documented status has an explicit EXIT_MAP entry", () => {
    const unmapped = Object.keys(DOCUMENTED).filter((s) => EXIT_MAP[s] === undefined);
    assert.deepEqual(
      unmapped,
      [],
      `documented statuses missing from EXIT_MAP (would silently exit 0): ${JSON.stringify(unmapped)}. ` +
        `Note: engine statuses NOT in §11 (skipped, dynamic done values) are intentionally unmapped — ` +
        `see plan 2026-07-22-1223-2 Deferred But Adjudicated.`,
    );
  });

  it("DOCUMENTED table covers exactly the 13 §11 statuses (guard against accidental table drift)", () => {
    assert.equal(
      Object.keys(DOCUMENTED).length,
      13,
      "DOCUMENTED must list exactly the 13 statuses named in the plan Exit Criteria " +
        "(completed, single_step_done, failed, unknown_step, unknown_type, no_transition, " +
        "invalid_transition, max_cycles, max_total_steps, max_retries, ping_pong, " +
        "partial, blocked — M5-WI38 added the last two)",
    );
  });
});

// M5-WI38 (plan 2026-08-27-1023-2) — supervisor terminal-word rows: new-row
// pin, pre-existing 11-row regression, and the fall-through/header-note
// consistency face. The words belong to the supervisor terminal domain
// (03-supervisor.md §8 R1–R4); the engine never emits them, so their
// absence would be invisible to any engine-driven test — these cases pin
// the table rows directly.
describe("M5-WI38 — EXIT_MAP partial/blocked rows (supervisor terminal words → exit 3)", () => {
  it("maps partial → exit 3 (terminal, not completed, needs human disposition)", () => {
    assert.equal(
      EXIT_MAP.partial,
      3,
      "partial must map to exit 3 per EXECUTION-PRINCIPLE.md §11 M5-WI38 row " +
        "(not 0 — an unfinished roadmap must never silently read as completed)",
    );
  });

  it("maps blocked → exit 3 (terminal, not completed, needs human disposition)", () => {
    assert.equal(
      EXIT_MAP.blocked,
      3,
      "blocked must map to exit 3 per EXECUTION-PRINCIPLE.md §11 M5-WI38 row " +
        "(not 2 — remedy is human disposition (unlock/dispose), not a budget re-run)",
    );
  });

  it("regresses the pre-existing 11 rows byte-for-byte (single_step_done → 0 and the four-key 2-code family included)", () => {
    assert.deepEqual(
      {
        completed: EXIT_MAP.completed,
        single_step_done: EXIT_MAP.single_step_done,
        failed: EXIT_MAP.failed,
        unknown_step: EXIT_MAP.unknown_step,
        unknown_type: EXIT_MAP.unknown_type,
        no_transition: EXIT_MAP.no_transition,
        invalid_transition: EXIT_MAP.invalid_transition,
        max_cycles: EXIT_MAP.max_cycles,
        max_total_steps: EXIT_MAP.max_total_steps,
        max_retries: EXIT_MAP.max_retries,
        ping_pong: EXIT_MAP.ping_pong,
      },
      {
        completed: 0,
        single_step_done: 0,
        failed: 1,
        unknown_step: 1,
        unknown_type: 1,
        no_transition: 1,
        invalid_transition: 1,
        max_cycles: 2,
        max_total_steps: 2,
        max_retries: 2,
        ping_pong: 2,
      },
      "the M5-WI38 addition must be purely additive — every pre-existing exit code stays byte-identical",
    );
  });

  it("keeps skipped / unmapped dynamic words falling through to exit 0, and the exit-map.js header note says so (note-consistency pin)", () => {
    assert.equal(
      EXIT_MAP.skipped,
      undefined,
      "skipped is intentionally NOT mapped (Node default exit 0) — plan 2026-07-22-1223-2 Deferred But Adjudicated; M5-WI38 must not change this",
    );
    assert.equal(
      EXIT_MAP["some-dynamic-done-value"],
      undefined,
      "dynamic done values stay unmapped (fall through to exit 0)",
    );
    const header = readFileSync(fileURLToPath(new URL("../src/exit-map.js", import.meta.url)), "utf8");
    assert.match(
      header,
      /`skipped` and dynamic `done` values[\s\S]*?intentionally NOT mapped[\s\S]*?fall[\s\S]*?through to Node's default exit 0/,
      "exit-map.js header must keep documenting the skipped/dynamic-word fall-through carve-out",
    );
    assert.match(
      header,
      /`partial`\/`blocked`[\s\S]*?SUPERVISOR[\s\S]*?never emits/i,
      "exit-map.js header must document that partial/blocked are supervisor words the engine never emits (M5-WI38 entry rationale)",
    );
  });
});
