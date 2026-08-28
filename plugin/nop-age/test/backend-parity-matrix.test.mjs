/**
 * backend-parity-matrix.test.mjs — L2 contract matrix: one behavioral spec,
 * two executor backends (dsh-plugin M2-WI8, plan `2026-08-23-1447-3`; R3 §3).
 *
 * Six assertion groups (R3 §3), executed per scenario for BOTH legs:
 *   1. marker outcome classification (pass/fail/unknown → correction retry)
 *   2. correction-retry budget (onUnknownMaxRetries) + transient-fault
 *      backoff classification (ProcessExecutor exitCode/stderrTail vs
 *      NativeExecutor synthesized code/errorTail — the engine reads
 *      `stderrTail || errorTail`, so both classify identically)
 *   3. run-state.json shape: steps[] field sets, types, status/marker/visits
 *      sequences (sessionId presence/type only — R3 §3 exemption; timing
 *      presence/type only — never durations)
 *   4. exit-code synthesis → identical EXIT_MAP terminal mapping (imported
 *      from the live engine exit-map.js; row-level table pinning stays with
 *      the engine's exit-map.test.js — complementary, not duplicated)
 *   5. flow budget enforcement (maxTotalSteps / maxCycleVisits / maxRetries)
 *      fires identically
 *   6. file-format identity (narrowed per plan Non-Goals): run-state shape
 *      superset + artifact file-set existence (logFile/promptFile incl. tool
 *      steps) — the monitor consumes run-state files only (packaging doc
 *      §Service Surface "invisible to it"), so shape identity IS monitor
 *      identity; no monitor-side re-verification here.
 *
 * Divergence ledger (Phase 2 Proof — every non-equality adjudicated with
 * owner-doc backing; an unbacked divergence is a defect, never "tolerated"):
 *   D1 tool-step timeout drift — process runTool drops the engine `timeout`
 *      opt (60min default), native runNativeTool consumes it in ms. Pinned
 *      as-is by scenario `tool-timeout-drift`. Backing: packaging doc
 *      §Implementation state and boundaries ("Known residual drift … is
 *      pinned by the WI8 L2 matrix's tool-step assertions").
 *   D2 sessionId value semantics — opencode ses_* vs native childId;
 *      presence/type only. Backing: R3 §3 assertion 3.
 *   D3 artifact/diagnostic content shape — agent log naming (oc-* vs
 *      native-*), log body, failedMeta.error text, and promptFile on-disk
 *      presence when the backend failed BEFORE dispatch (process ENOENT
 *      references the path without writing it; native writes dispatch
 *      artifacts before create) are not byte-equivalent. Existence of
 *      referenced artifacts is the contract; spawn-fail scenario compares
 *      logFile existence only. Backing: packaging doc §Implementation state
 *      and boundaries ("file existence/readability is the compatibility
 *      contract; byte-level content shape is not").
 *
 * Timing determinism: scripted turn delays are near-zero (fake agents
 * turnDelayMs=1), transient backoff 1ms/2ms, no assertion reads durations.
 * Real driver spawns are out of scope (L3/L4, R3 §2); tool steps spawn REAL
 * short-lived commands on both legs (that is the documented drift pin).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  makeProcessLeg,
  makeNativeLeg,
  runScenario,
  normalizeRunState,
  eventCounts,
  artifactSignature,
  exitOf,
  cleanupRun,
  EXIT_MAP,
} from "./helpers/matrix-harness.mjs";

const TAG = "AI_STEP_RESULT";
const marker = (v) => `<${TAG}>${v}</${TAG}>`;

// long enough to clear PARSE_MIN_BODY_CHARS (engine.js: 10) for the parse
// fallback leg, with no tag-like content anywhere
const proseNoMarker =
  "The assistant reviewed the workspace and produced a plain prose summary " +
  "without any result tag; nothing in this text looks like a marker pair " +
  "and the parse fallback will also be asked and will also answer in prose.";

const passText = marker("pass");
const failText = marker("fail");
const maybeText = marker("maybe");

const baseFlow = (steps, extra = {}) => ({
  name: "matrix-flow",
  entry: "START",
  maxTotalSteps: 50,
  maxCycleVisits: 20,
  steps,
  ...extra,
});

/**
 * The scenario corpus. `expectTurnRoles` pins the engine→executor call
 * sequence (marker-classification + correction-budget consumption proof);
 * `expect` pins absolute (status, exit) per leg; `divergent: true` replaces
 * the cross-leg equality assertions with the documented-drift assertions.
 */
const SCENARIOS = [
  // ── group 1: marker classification ──────────────────────────────────────
  {
    id: "marker-pass",
    group: 1,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { goto: "B" }, fail: { done: "failed" } } },
      B: { type: "agent", prompt: "b", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    turns: [{ text: passText }, { text: passText }],
    expectTurnRoles: ["agent", "agent"],
    expect: { status: "completed", exit: 0 },
  },
  {
    id: "marker-fail",
    group: 1,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    turns: [{ text: failText }],
    expectTurnRoles: ["agent"],
    expect: { status: "failed", exit: 1 },
  },
  {
    id: "multi-marker-last-wins",
    group: 1,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    // extractTag takes the LAST match → pass wins over the earlier fail
    turns: [{ text: `${failText} intermediate reasoning ${passText}` }],
    expectTurnRoles: ["agent"],
    expect: { status: "completed", exit: 0 },
  },
  {
    id: "no-marker-parse-fallback-fails",
    group: 1,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    turns: [{ text: proseNoMarker }, { text: proseNoMarker }],
    expectTurnRoles: ["agent", "parse"],
    expect: { status: "failed", exit: 1 },
  },
  {
    id: "unknown-marker-correction-recovers",
    group: 1,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    turns: [{ text: maybeText }, { text: passText }],
    expectTurnRoles: ["agent", "correct"],
    expect: { status: "completed", exit: 0 },
  },

  // ── group 2: correction budget + transient classification ───────────────
  {
    id: "correction-budget-exhausted-default-2",
    group: 2,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    // default onUnknownMaxRetries = 2 → exactly two correction re-prompts,
    // both still invalid → no_transition
    turns: [{ text: maybeText }, { text: maybeText }, { text: maybeText }],
    expectTurnRoles: ["agent", "correct", "correct"],
    expect: { status: "no_transition", exit: 1 },
  },
  {
    id: "correction-budget-custom-1",
    group: 2,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG, onUnknownMaxRetries: 1,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    turns: [{ text: maybeText }, { text: maybeText }],
    expectTurnRoles: ["agent", "correct"],
    expect: { status: "no_transition", exit: 1 },
  },
  {
    id: "transient-retry-then-success",
    group: 2,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    // two transient-classifiable failures, then success: recovered on the
    // INDEPENDENT transient budget — transient_retry events, no step_failed
    turns: [
      { transient: "HTTP 429 Too Many Requests, rate_limit exceeded" },
      { transient: "HTTP 429 Too Many Requests, rate_limit exceeded" },
      { text: passText },
    ],
    expectTurnRoles: ["agent", "agent", "agent"],
    expect: { status: "completed", exit: 0 },
    expectEvents: { transient_retry: 2, step_failed: 0 },
  },
  {
    id: "transient-budget-exhaustion-degrades",
    group: 2,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    turns: [
      { transient: "HTTP 429 Too Many Requests, rate_limit exceeded" },
      { transient: "HTTP 429 Too Many Requests, rate_limit exceeded" },
      { transient: "HTTP 429 Too Many Requests, rate_limit exceeded" },
    ],
    expectTurnRoles: ["agent", "agent", "agent"],
    expect: { status: "failed", exit: 1 },
    expectEvents: { transient_retry: 2, step_failed: 1 },
  },
  {
    id: "hard-failure-non-transient",
    group: 2,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    // empty output + exit 1 + a stderr WITHOUT any transient signature →
    // real failure, no transient_retry
    turns: [{ hard: "boom: local disk on fire" }],
    expectTurnRoles: ["agent"],
    expect: { status: "failed", exit: 1 },
    expectEvents: { transient_retry: 0, step_failed: 1 },
  },

  // ── backend failure synthesis (exit contract, packaging doc rule 3) ─────
  {
    id: "agent-watchdog-timeout",
    group: 2,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG, timeoutMs: 80,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    turns: [{ timeout: true }],
    expectTurnRoles: ["agent"],
    expect: { status: "failed", exit: 1 },
    expectEvents: { transient_retry: 0, step_failed: 1 },
  },
  {
    id: "backend-create-failure",
    group: 2,
    artifactKeys: ["logFile"],
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }),
    turns: [{ spawnFail: "driver binary not found (scripted)" }],
    expectTurnRoles: ["agent"],
    expect: { status: "failed", exit: 1 },
    expectEvents: { step_failed: 1 },
  },

  // ── group 6 + tool steps: real spawns on both legs ──────────────────────
  // NB: neither backend routes tool commands through a shell (executor.js /
  // runNativeTool both split on spaces and spawn argv directly), so `node -e`
  // payloads must be space-free.
  {
    id: "tool-success",
    group: 6,
    flow: baseFlow({
      BUILD: { type: "tool", command: "node -e console.log('tool-ok')",
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }, { entry: "BUILD" }),
    turns: [],
    expectTurnRoles: ["tool"],
    expect: { status: "completed", exit: 0 },
  },
  {
    id: "tool-fast-fail",
    group: 6,
    flow: baseFlow({
      BUILD: { type: "tool", command: "node -e process.exit(3)",
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }, { entry: "BUILD" }),
    turns: [],
    expectTurnRoles: ["tool"],
    expect: { status: "failed", exit: 1 },
  },
  {
    // D1 documented drift (packaging doc §Implementation state and
    // boundaries): the process path drops `timeout` (60min default → command
    // completes → pass); the native path consumes it in ms (killed at 100ms
    // → fail). Asserted EXACTLY as documented — either side changing forces
    // this pin (and its doc citation) to be revisited.
    id: "tool-timeout-drift",
    group: 6,
    divergent: true,
    flow: baseFlow({
      BUILD: { type: "tool", timeout: 100,
        command: "node -e setTimeout(()=>{console.log('late')},800)",
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
    }, { entry: "BUILD" }),
    turns: [],
    expectTurnRoles: ["tool"],
    expectByLeg: {
      process: { status: "completed", exit: 0 },
      native: { status: "failed", exit: 1 },
    },
  },

  // ── group 5: flow budgets ────────────────────────────────────────────────
  {
    id: "budget-max-total-steps",
    group: 5,
    flow: baseFlow({
      A: { type: "agent", prompt: "a", resultTag: TAG,
        transitions: { pass: { goto: "B" }, fail: { done: "failed" } } },
      B: { type: "agent", prompt: "b", resultTag: TAG,
        transitions: { pass: { goto: "A" }, fail: { done: "failed" } } },
    }, { entry: "A", maxTotalSteps: 3 }),
    turns: [{ text: passText }, { text: passText }, { text: passText }],
    expectTurnRoles: ["agent", "agent", "agent"],
    expect: { status: "max_total_steps", exit: 2 },
  },
  {
    id: "budget-max-cycle-visits",
    group: 5,
    flow: baseFlow({
      A: { type: "agent", prompt: "a", resultTag: TAG,
        transitions: { pass: { goto: "A" }, fail: { done: "failed" } } },
    }, { entry: "A", maxCycleVisits: 2 }),
    turns: [{ text: passText }, { text: passText }],
    expectTurnRoles: ["agent", "agent"],
    expect: { status: "max_cycles", exit: 2 },
  },
  {
    id: "budget-max-retries",
    group: 5,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { done: "completed" }, fail: { retry: "START", maxRetries: 1 } } },
    }),
    turns: [{ text: failText }, { text: failText }],
    expectTurnRoles: ["agent", "agent"],
    expect: { status: "max_retries", exit: 2 },
  },

  // ── group 4: EXIT_MAP terminal coverage (engine-side statuses) ──────────
  {
    id: "unknown-step-goto",
    group: 4,
    flow: baseFlow({
      START: { type: "agent", prompt: "s", resultTag: TAG,
        transitions: { pass: { goto: "NOWHERE" }, fail: { done: "failed" } } },
    }),
    turns: [{ text: passText }],
    expectTurnRoles: ["agent"],
    expect: { status: "unknown_step", exit: 1 },
  },
  {
    id: "unknown-step-type",
    group: 4,
    flow: baseFlow({
      START: { type: "bogus", transitions: {} },
    }),
    turns: [],
    expectTurnRoles: [],
    expect: { status: "unknown_type", exit: 1 },
  },

  // ── group 3: subflow placeholder + _wfClose terminal overwrite ──────────
  {
    id: "subflow-single-child",
    group: 3,
    flow: baseFlow({
      KICK: { type: "agent", prompt: "k", resultTag: TAG,
        transitions: { pass: { goto: "SUB" }, fail: { done: "failed" } } },
      SUB: { type: "subflow", flow: "child-flow",
        transitions: { complete: { done: "completed" }, failed: { done: "failed" } } },
    }, { entry: "KICK" }),
    loadSubFlow: () => ({
      name: "child-flow", entry: "CHILD_A", maxTotalSteps: 10, maxCycleVisits: 5,
      steps: {
        CHILD_A: { type: "agent", prompt: "c", resultTag: TAG,
          transitions: { pass: { done: "completed" }, fail: { done: "failed" } } },
      },
    }),
    turns: [{ text: passText }, { text: passText }],
    expectTurnRoles: ["agent", "agent"],
    expect: { status: "completed", exit: 0 },
  },
];

// ── helpers ─────────────────────────────────────────────────────────────────

function rolesOf(callLog) {
  return callLog.map((c) => c.role);
}

function filterArtifacts(out, keys) {
  return out.artifacts.filter((a) => !keys || keys.includes(a.key));
}

async function runBothLegs(scenario) {
  const proc = await runScenario(scenario, makeProcessLeg);
  const nat = await runScenario(scenario, makeNativeLeg);
  return { proc, nat };
}

// ── the matrix ──────────────────────────────────────────────────────────────

describe("L2 backend-parity matrix (R3 §3, plan 2026-08-23-1447-3)", () => {
  for (const scenario of SCENARIOS) {
    it(`scenario ${scenario.id} (group ${scenario.group})`, async () => {
      const { proc, nat } = await runBothLegs(scenario);
      try {
        // engine never saw a thrown error on either leg (executors settle
        // with result objects — ProcessExecutor parity contract)
        assert.equal(proc.runError, null, `process leg threw: ${proc.runError}`);
        assert.equal(nat.runError, null, `native leg threw: ${nat.runError}`);

        // identical engine→executor call sequence (groups 1+2 consumption
        // proof: same steps, same parse/correction dispatch counts/order)
        assert.deepEqual(
          nat.callLog,
          proc.callLog,
          "engine→executor call sequences must be identical across backends",
        );
        if (scenario.expectTurnRoles) {
          assert.deepEqual(rolesOf(proc.callLog), scenario.expectTurnRoles);
          assert.deepEqual(rolesOf(nat.callLog), scenario.expectTurnRoles);
        }

        if (scenario.divergent) {
          // documented drift (D1): assert each leg's absolute outcome
          for (const out of [proc, nat]) {
            const exp = scenario.expectByLeg[out.leg];
            assert.ok(exp, `expectByLeg missing for ${out.leg}`);
            assert.equal(out.result.status, exp.status, `${out.leg} status`);
            assert.equal(exitOf(out.result.status), exp.exit, `${out.leg} EXIT_MAP lookup`);
          }
          // shared invariants that still hold across the drift: same engine
          // call sequence, same step population/field sets, run-state present
          assert.equal(nat.result.stepCount, proc.result.stepCount);
          const shapes = (out) => (out.runState?.steps || []).map((s) => Object.keys(s).sort().join(","));
          assert.deepEqual(shapes(nat), shapes(proc), "step field sets must still match across the drift");
          for (const out of [proc, nat]) {
            assert.ok(out.runState, `${out.leg} run-state written`);
            assert.equal((out.runState.steps || []).length, 1, `${out.leg}: exactly the BUILD step recorded`);
          }
        } else {
          // groups 1+4+5: identical terminal classification + exit mapping
          assert.equal(nat.result.status, proc.result.status, "terminal status must match");
          assert.equal(nat.result.stepCount, proc.result.stepCount, "stepCount must match");
          const status = proc.result.status;
          assert.ok(status in EXIT_MAP, `status ${status} must be an EXIT_MAP key`);
          assert.equal(exitOf(nat.result.status), exitOf(proc.result.status));
          if (scenario.expect) {
            for (const out of [proc, nat]) {
              assert.equal(out.result.status, scenario.expect.status, `${out.leg} absolute status`);
              assert.equal(exitOf(out.result.status), scenario.expect.exit, `${out.leg} absolute exit`);
            }
          }

          // group 3 (+6 superset): run-state shape identity — field sets,
          // types, status/marker/visits sequences; sessionId/timing/error/
          // artifact-name VALUES exempt (R3 §3 + packaging doc boundaries)
          assert.deepEqual(
            normalizeRunState(nat.runState),
            normalizeRunState(proc.runState),
            "normalized run-state must be identical across backends",
          );

          // group 6 (narrowed): artifact file-set existence, incl. tool steps
          const keys = scenario.artifactKeys;
          const sigProc = artifactSignature(filterArtifacts(proc, keys));
          const sigNat = artifactSignature(filterArtifacts(nat, keys));
          assert.deepEqual(sigNat, sigProc, "artifact existence pattern must match");
          assert.equal(sigProc.allExist, true, `process artifacts all exist: ${JSON.stringify(filterArtifacts(proc, keys))}`);
          assert.equal(sigNat.allExist, true, `native artifacts all exist: ${JSON.stringify(filterArtifacts(nat, keys))}`);

          // events identity (transient_retry / step_failed / transition / …)
          assert.deepEqual(eventCounts(nat.events), eventCounts(proc.events), "event type counts must match");
          if (scenario.expectEvents) {
            const counts = eventCounts(proc.events);
            for (const [type, n] of Object.entries(scenario.expectEvents)) {
              assert.equal(counts[type] || 0, n, `process leg ${type} count`);
              assert.equal(eventCounts(nat.events)[type] || 0, n, `native leg ${type} count`);
            }
          }

          // _wfClose terminal overwrite: no record left in "running" at
          // terminal state on either leg
          for (const out of [proc, nat]) {
            const running = (out.runState?.steps || []).filter((s) => s.status === "running");
            assert.deepEqual(running, [], `${out.leg}: no stale running placeholders`);
          }
        }

        // subflow placeholder behavior (group 3): parent record carries the
        // terminal-overwritten subflowRuns and the child run-state file exists
        if (scenario.id === "subflow-single-child") {
          for (const out of [proc, nat]) {
            const sub = out.runState.steps.find((s) => s.name === "SUB");
            assert.ok(sub, "SUB step recorded");
            assert.equal(sub.type, "subflow");
            assert.equal(sub.marker, "complete");
            assert.equal(sub.status, "completed");
            assert.deepEqual(
              sub.subflowRuns.map((r) => ({ status: r.status, forEachIndex: r.forEachIndex })),
              [{ status: "completed", forEachIndex: 0 }],
            );
            assert.ok(out.subflowStateFiles.length === 1 && out.subflowStateFiles[0].exists,
              `child run-state file must exist: ${JSON.stringify(out.subflowStateFiles)}`);
          }
        }

        // native handle lifecycle (run-scoped): at most one live handle,
        // disposed exactly once at run terminal
        if (nat.legState?.agents) {
          assert.ok(nat.legState.agents.length <= 1, "one run-scoped agent handle");
          assert.ok(nat.legState.disposed.length <= 1, "at most one run-terminal dispose");
        }
      } finally {
        cleanupRun(proc);
        cleanupRun(nat);
      }
    });
  }

  // group 4 complementary boundary: the corpus exercises 8 of the 10 EXIT_MAP
  // keys end-to-end through BOTH backends; the remaining engine statuses
  // (single_step_done, ping_pong, invalid_transition) are backend-agnostic
  // engine paths (single-step CLI mode / loop-guard / malformed transition
  // objects) with no executor-dependence — their row-level pinning lives in
  // the engine's exit-map.test.js ("table ↔ EXECUTION-PRINCIPLE §11"), this
  // matrix pins "synthesized exit → terminal status → table lookup" equality.
  it("group 4: corpus covers the executor-reachable EXIT_MAP keys identically on both legs", async () => {
    const covered = new Set();
    for (const scenario of SCENARIOS) {
      if (scenario.divergent || !scenario.expect) continue;
      covered.add(scenario.expect.status);
      assert.ok(scenario.expect.status in EXIT_MAP, `${scenario.id}: ${scenario.expect.status} in EXIT_MAP`);
      assert.equal(exitOf(scenario.expect.status), scenario.expect.exit, `${scenario.id}: table row matches pinned exit`);
    }
    for (const status of [
      "completed", "failed", "no_transition", "unknown_step", "unknown_type",
      "max_cycles", "max_total_steps", "max_retries",
    ]) {
      assert.ok(covered.has(status), `corpus must cover ${status}`);
    }
  });
});
