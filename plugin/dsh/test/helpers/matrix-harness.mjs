/**
 * matrix-harness.mjs — shared L2 backend-parity matrix harness
 * (dsh-plugin M2-WI8, plan `2026-08-23-1447-3`; R3 §3 six assertion groups).
 *
 * One behavioral spec, two executor legs (Phase 1 Decisions):
 *
 *   ProcessExecutor leg — `new ProcessExecutor(scripted duck-typed runner)`
 *     (step-executor.js is a pure forwarder; the fake-runner convention is the
 *     existing engine-test style, test/step-executor.test.js / helpers.js).
 *     Agent/parse turns are scripted; tool steps forward to the REAL runner's
 *     runTool (createRunner → executor.js spawn) so the documented tool-path
 *     drift (packaging doc §Implementation state and boundaries: the process
 *     path drops the engine's `timeout` opt; the native path consumes it as
 *     milliseconds) is pinned against live code on both sides.
 *
 *   NativeExecutor leg — `new DshNativeExecutor({ agents: fakeService, config })`
 *     over the in-process fake agents service (WI7 base, matrix-extended).
 *
 * Drive level (Phase 1 Decision 2): FlowEngine DIRECT drive — the engine is
 * constructed with `delegates.executor` injected per leg; `config.onStepUpdate`
 * is wired to `engine._onAgentStepUpdate` AFTER construction, mirroring the
 * only production injection point (`orchestrateRun`, orchestrator.js:644 —
 * R3 §2's `__setRunnerFactoryForTest` reference is a draft-pipeline seam, see
 * the R3 erratum note this plan adds). Fixture flows are inline and minimal,
 * in the engine mkdtemp runDir convention; `embed: true` is set for BOTH legs
 * (engine startup diagnostics are executor-agnostic engine behavior, M1-WI4;
 * embedding keeps the matrix hermetic — no ~/.mission-driver writes, no ps
 * scans) and introduces nothing backend-dependent.
 *
 * Shared scenario vocabulary — `turns` is a flat list of abstract per-turn
 * outcomes consumed in ENGINE executor-call order (deterministic and
 * identical for both legs, so a native followup and a process runner call
 * consume the same slot):
 *   { text }            completed turn, final assistant text
 *   { transient: sig }  transient-classifiable failure (engine reads
 *                       stderrTail [process] / errorTail [native])
 *   { hard: msg }       non-transient failure (empty output, exit 1)
 *   { timeout: true }   watchdog timeout (native: never-converging turn +
 *                       stepDef.timeoutMs; process: scripted timeout product)
 *   { spawnFail: msg }  backend create/spawn failure (single-agent-step
 *                       scenarios only — the native service fails create)
 *
 * Timing determinism (Phase 2 Proof): scripted delays are near-zero (fake
 * agents turnDelayMs default 1ms; transient backoff 1ms/2ms); no assertion
 * reads durations — timing fields are compared by presence/type only.
 */

import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { writeFileSync } from "node:fs";

// Live engine, cross-directory relative import (Phase 1 Decision 1): the
// engine is zero-npm-dependency, so this resolves with no plugin node_modules
// involvement; the engine's own test chain never imports anything from the
// plugin (boundary preserved both ways).
import { FlowEngine } from "../../../../tools/mission-driver/src/engine.js";
import { ProcessExecutor } from "../../../../tools/mission-driver/src/step-executor.js";
import { EXIT_MAP } from "../../../../tools/mission-driver/src/exit-map.js";
import { createRunner } from "../../../../tools/mission-driver/src/runner.js";

import { DshNativeExecutor } from "../../src/native-executor.ts";
import { createFakeAgentsService } from "./fake-agents.mjs";

export { EXIT_MAP };

// ── leg builders ────────────────────────────────────────────────────────────

function roleOf(stepName) {
  if (typeof stepName === "string" && stepName.startsWith("parse-")) return "parse";
  if (typeof stepName === "string" && stepName.startsWith("correct-")) return "correct";
  return "agent";
}

/**
 * ProcessExecutor leg — scripted duck-typed runner.
 * Mirrors the observable runner contract (runner.js): 8-field agent result,
 * two-point onStepUpdate callbacks (files first, session second) resolved at
 * CALL time from `opts.onStepUpdate ?? config.onStepUpdate`, run-dir prompt +
 * log artifacts with the runner's `oc-<step>` naming, and runTool forwarded
 * to the REAL createRunner product (executor.js spawn path).
 */
export async function makeProcessLeg(config, scenario) {
  const turns = [...scenario.turns];
  const sessionId = "ses_matrix_proc_1";
  let turnIndex = 0;
  const nextTurn = () => {
    if (turnIndex >= turns.length) {
      throw new Error(`process leg: script exhausted at index ${turnIndex} (len ${turns.length})`);
    }
    return turns[turnIndex++];
  };

  const genFile = (stepName) =>
    resolve(config.runDir, `oc-${stepName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`);

  const agentTurn = async (stepName, opts) => {
    const t = nextTurn();
    // call-time callback resolution, verbatim runner.js form
    const onStepUpdate = typeof opts?.onStepUpdate === "function"
      ? opts.onStepUpdate
      : (typeof config.onStepUpdate === "function" ? config.onStepUpdate : null);

    const logFile = genFile(stepName);
    const promptFile = `${logFile}.prompt`;
    const header = `# backend: process (scripted fake runner)\n# step: ${stepName}\n# started: now\n\n`;

    if (t && t.spawnFail !== undefined) {
      // Faithful to the real backend's ENOENT product: the executor writes
      // the log header BEFORE attempting the spawn, so logFile exists; the
      // promptFile PATH is returned (runner derives it from logFile) but the
      // file itself is never written (onSpawn never fired) — see ledger D3.
      writeFileSync(logFile, header, "utf8");
      return { text: "", logFile, promptFile, ok: false, sessionId: null,
        exitCode: -1, errorTail: `[SPAWN_ERROR] ${t.spawnFail}`, stderrTail: null };
    }

    let result;
    if (typeof t === "string" || (t && t.text !== undefined)) {
      const text = typeof t === "string" ? t : t.text;
      writeFileSync(promptFile, `[MISSION_DRIVER:${basename(config.runDir)}] prompt for ${stepName}`, "utf8");
      writeFileSync(logFile, header + text + "\n", "utf8");
      result = { text, logFile, promptFile, ok: true, sessionId, exitCode: 0, errorTail: null, stderrTail: null };
    } else if (t && t.transient !== undefined) {
      writeFileSync(promptFile, `[MISSION_DRIVER:${basename(config.runDir)}] prompt for ${stepName}`, "utf8");
      writeFileSync(logFile, header, "utf8");
      result = { text: "", logFile, promptFile, ok: false, sessionId, exitCode: 1, errorTail: null, stderrTail: t.transient };
    } else if (t && t.hard !== undefined) {
      writeFileSync(promptFile, `[MISSION_DRIVER:${basename(config.runDir)}] prompt for ${stepName}`, "utf8");
      writeFileSync(logFile, header, "utf8");
      result = { text: "", logFile, promptFile, ok: false, sessionId, exitCode: 1, errorTail: null, stderrTail: t.hard };
    } else if (t && t.timeout) {
      writeFileSync(promptFile, `[MISSION_DRIVER:${basename(config.runDir)}] prompt for ${stepName}`, "utf8");
      writeFileSync(logFile, header, "utf8");
      result = { text: "", logFile, promptFile, ok: false, sessionId, exitCode: 1,
        errorTail: "[TIMEOUT] no output before the step watchdog, killed process tree (scripted timeout product)", stderrTail: null };
    } else {
      throw new Error(`process leg: unknown turn entry ${JSON.stringify(t)}`);
    }
    // two-point callbacks, runner.js onSpawn ordering: files first, session second
    if (onStepUpdate) onStepUpdate({ stepName, logFile, promptFile });
    if (onStepUpdate) onStepUpdate({ stepName, sessionId });
    return result;
  };

  // REAL tool path: createRunner product's runTool → executor.js spawn.
  // (Constructed with the same config so logFile lands in the same runDir.)
  const realRunner = await createRunner({ ...config });

  const runner = {
    runAgent: (stepName, prompt, system, ses, modelOverride, opts) => agentTurn(stepName, opts),
    runParseAgent: (stepName, prompt, system, ses) => agentTurn(stepName, undefined),
    runTool: (stepName, command, opts) => realRunner.runTool(stepName, command, opts),
  };

  return { name: "process", executor: new ProcessExecutor(runner), state: { consumed: () => turnIndex } };
}

/**
 * NativeExecutor leg — fake in-process agents service over the same abstract
 * turns. Translation: text → scripted final text; transient → whenIdle()
 * rejects with the signature (executor maps to errorTail, which the engine's
 * classifier reads via stderrTail||errorTail); hard → empty-harvest failure;
 * timeout → never-converging turn (watchdog fires at stepDef.timeoutMs);
 * spawnFail → service-level create error.
 */
export function makeNativeLeg(config, scenario) {
  const spawnFailTurn = scenario.turns.find((t) => t && typeof t === "object" && t.spawnFail !== undefined);
  const script = scenario.turns
    .filter((t) => !(t && typeof t === "object" && t.spawnFail !== undefined))
    .map((t) => {
      if (typeof t === "string" || (t && t.text !== undefined)) return typeof t === "string" ? t : t.text;
      if (t && t.transient !== undefined) return { rejectIdle: new Error(t.transient) };
      if (t && t.hard !== undefined) return { error: new Error(t.hard) };
      if (t && t.timeout) return { never: true };
      throw new Error(`native leg: unknown turn entry ${JSON.stringify(t)}`);
    });
  const { service, state } = createFakeAgentsService({
    script,
    ...(spawnFailTurn ? { createError: new Error(spawnFailTurn.spawnFail) } : {}),
  });
  const executor = new DshNativeExecutor({ agents: service, config });
  return { name: "native", executor, state };
}

// ── engine-perspective call log (identical consumption proof) ───────────────

export function withCallLog(executor, callLog) {
  return {
    executeAgent(stepName, ...rest) {
      callLog.push({ method: "executeAgent", stepName, role: roleOf(stepName) });
      return executor.executeAgent(stepName, ...rest);
    },
    executeParseAgent(stepName, ...rest) {
      callLog.push({ method: "executeParseAgent", stepName, role: roleOf(stepName) });
      return executor.executeParseAgent(stepName, ...rest);
    },
    executeTool(stepName, ...rest) {
      callLog.push({ method: "executeTool", stepName, role: "tool" });
      return executor.executeTool(stepName, ...rest);
    },
  };
}

// ── scenario runner ─────────────────────────────────────────────────────────

export async function runScenario(scenario, legBuilder) {
  const runDir = mkdtempSync(join(tmpdir(), `l2-${scenario.id}-${legBuilder.name}-`));
  const config = {
    moduleName: "matrix",
    shortName: "matrix",
    projectRoot: runDir,
    runDir,
    missionName: "matrix",
    retryBackoffBaseMs: 0,
    // hermetic for BOTH legs (executor-agnostic engine diagnostics are gated
    // by M1-WI4's embed flag; see file header)
    embed: true,
    // near-zero transient backoff — timing determinism (Phase 2 Proof)
    transient: { enabled: true, maxRetries: 2, backoffBaseMs: 1, backoffCapMs: 2 },
    ...(scenario.config || {}),
  };

  const leg = await legBuilder(config, scenario);
  const callLog = [];
  const delegates = {
    config,
    vars: { module: "matrix" },
    logFile: null,
    executor: withCallLog(leg.executor, callLog),
    loadSubFlow:
      scenario.loadSubFlow ||
      ((name) => {
        throw new Error(`mock subflow not found: ${name}`);
      }),
  };
  const engine = new FlowEngine(scenario.flow, delegates);
  // Mirrors the production wiring point (orchestrator.js assigns this AFTER
  // executor construction; both legs' executors resolve callbacks at call time).
  config.onStepUpdate = (payload) => engine._onAgentStepUpdate(payload);

  let result;
  let runError = null;
  try {
    result = await engine.run();
  } catch (e) {
    runError = e;
  } finally {
    await leg.executor.dispose?.();
  }

  const runState = existsSync(join(runDir, "run-state.json"))
    ? JSON.parse(readFileSync(join(runDir, "run-state.json"), "utf8"))
    : null;
  const eventsFile = join(runDir, "events.jsonl");
  const events = existsSync(eventsFile)
    ? readFileSync(eventsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];

  // artifact existence for every referenced logFile/promptFile (basenames are
  // runDir-relative by the engine's storage contract)
  const artifacts = [];
  for (const s of runState?.steps || []) {
    for (const key of ["logFile", "promptFile"]) {
      if (s[key]) artifacts.push({ key, base: s[key], exists: existsSync(join(runDir, s[key])) });
    }
  }
  const subflowStateFiles = (runState?.steps || [])
    .filter((s) => s.type === "subflow" && Array.isArray(s.subflowRuns))
    .flatMap((s) => s.subflowRuns.map((r) => r.file))
    .filter(Boolean)
    .map((f) => ({ base: f, exists: existsSync(join(runDir, f)) }));

  return {
    leg: leg.name,
    legState: leg.state,
    result,
    runError,
    runState,
    events,
    artifacts,
    subflowStateFiles,
    callLog,
    runDir,
  };
}

// ── normalizers / comparators (R3 §3: presence/type vs value semantics) ─────

// Fields whose VALUES are backend-dependent or non-deterministic; compared by
// presence + type only. sessionId: opencode ses_* vs native childId (R3 §3
// assertion-3 exemption). startedAt/endedAt/durationMs: timing (order-only
// contract). error: diagnostic text built from backend tails (packaging doc
// §Implementation state and boundaries — content shape is not byte-equivalent).
// logFile/promptFile: basenames carry ts+rand; existence is asserted instead.
const TYPE_ONLY_STEP_FIELDS = new Set([
  "sessionId", "startedAt", "endedAt", "durationMs", "error",
  "logFile", "promptFile", "suspendGapMs", "waitMs",
]);

export function normalizeStepRecord(rec) {
  const out = { __fieldSet: Object.keys(rec).sort().join(",") };
  for (const [k, v] of Object.entries(rec)) {
    out[k] = TYPE_ONLY_STEP_FIELDS.has(k) ? `<type:${typeof v}>` : v;
  }
  return out;
}

export function normalizeRunState(rs) {
  if (!rs) return null;
  return {
    __topFieldSet: Object.keys(rs).sort().join(","),
    status: rs.status,
    missionName: rs.missionName,
    flowName: rs.flowName,
    auditRound: rs.auditRound,
    maxAuditRounds: rs.maxAuditRounds,
    forEachItem: rs.forEachItem === undefined ? "<absent>" : "<present>",
    steps: rs.steps.map(normalizeStepRecord),
  };
}

export function eventCounts(events) {
  const m = new Map();
  for (const e of events) m.set(e.type, (m.get(e.type) || 0) + 1);
  return Object.fromEntries([...m.entries()].sort());
}

export function artifactSignature(artifacts) {
  // value-independent existence pattern (count + all-exist); naming prefixes
  // differ by backend for agent logs (oc-* vs native-*) — documented in the
  // divergence ledger (content-shape boundary, packaging doc)
  return { count: artifacts.length, allExist: artifacts.every((a) => a.exists) };
}

export function exitOf(status) {
  return EXIT_MAP[status];
}

export function cleanupRun(out) {
  if (out?.runDir) rmSync(out.runDir, { recursive: true, force: true });
}
