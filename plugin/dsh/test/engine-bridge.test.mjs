/**
 * engine-bridge.test.mjs — selection factory + native config wiring tests
 * (dsh-plugin M2-WI7 Phase 2 Proof; fake in-process agents service, no host).
 *
 * Branches pinned (plan Phase 2 Proof item):
 *   1. factory mapping: opencode/pi/cline → ProcessExecutor (bundle runner);
 *      native → per-run NativeExecutor (two calls → two instances)
 *   2. agents service missing → explicit wire error (no silent fallback)
 *   3. bootstrapNativeConfig: allowNativeDriver + embed + driver-native
 *      default produce the expected config shape (engine config test
 *      conventions: self-contained temp mission tree)
 *   4. orchestrateRun full-chain smoke (native leg): top-level agent step's
 *      {stepName, logFile, promptFile} and {stepName, sessionId} callbacks
 *      reach engine._onAgentStepUpdate through the config.onStepUpdate
 *      channel (run-state steps[] carries logFile/promptFile/sessionId) —
 *      pins the construction-time-dead-channel class of regressions
 *   5. run-terminal executor dispose after the run settles
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveExecutor, bootstrapNativeConfig, runNativeMission } from "../src/engine-bridge.ts";
import { DshNativeExecutor } from "../src/native-executor.ts";
import { ProcessExecutor } from "../assets/src/step-executor.js";
import { createFakeAgentsService } from "./helpers/fake-agents.mjs";

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "engine-bridge-"));
}

// Self-contained temp mission tree (mirrors engine driver-whitelist.test.js
// setup so loadMission path validation passes without repo-root missions/).
function setupMission(root) {
  const missionsDir = join(root, "missions");
  mkdirSync(missionsDir, { recursive: true });
  writeFileSync(join(missionsDir, "demo.json"), JSON.stringify({
    name: "demo",
    roadmapPath: "docs/roadmap",
    plansDir: "docs/plans/demo",
    flowName: "native-smoke",
    commands: { test: "echo ok" },
  }), "utf8");
  mkdirSync(join(missionsDir, "flows"), { recursive: true });
  writeFileSync(join(missionsDir, "flows", "native-smoke.json"), JSON.stringify({
    name: "native-smoke",
    entry: "PING",
    steps: {
      PING: {
        type: "agent",
        prompt: "Reply with the pass marker.",
        transitions: {
          pass: { done: "completed" },
          fail: { done: "failed" },
        },
        onError: { done: "failed" },
      },
    },
  }), "utf8");
  for (const d of ["docs/roadmap", "docs/plans/demo"]) {
    mkdirSync(join(root, d), { recursive: true });
  }
  return missionsDir;
}

test("factory: opencode/pi/cline → ProcessExecutor over the bundle runner", async () => {
  const root = tmpProject();
  const config = { projectRoot: root, driver: "opencode", runDir: join(root, "_tmp", "x") };
  for (const driver of ["opencode", "pi", "cline"]) {
    const ex = await resolveExecutor({ driver, ctx: {}, config: { ...config, driver } });
    assert.ok(ex instanceof ProcessExecutor, `${driver} → ProcessExecutor`);
    assert.equal(typeof ex.executeAgent, "function");
    assert.equal(typeof ex.executeParseAgent, "function");
    assert.equal(typeof ex.executeTool, "function");
  }
  rmSync(root, { recursive: true, force: true });
});

test("factory: native → per-run NativeExecutor (two calls → two instances)", async () => {
  const root = tmpProject();
  const runDir = join(root, "_tmp", "run");
  mkdirSync(runDir, { recursive: true });
  const fake = createFakeAgentsService({ script: ["a", "b"] });
  const ctx = { agents: fake.service };
  const ex1 = await resolveExecutor({ driver: "native", ctx, config: { projectRoot: root, runDir } });
  const ex2 = await resolveExecutor({ driver: "native", ctx, config: { projectRoot: root, runDir } });
  assert.ok(ex1 instanceof DshNativeExecutor);
  assert.ok(ex2 instanceof DshNativeExecutor);
  assert.notEqual(ex1, ex2, "per-run construction — no cross-run singleton");
  assert.equal(typeof ex1.dispose, "function");
  rmSync(root, { recursive: true, force: true });
});

test("factory: agents service missing → explicit wire error, no silent fallback", async () => {
  const root = tmpProject();
  await assert.rejects(
    () => resolveExecutor({ driver: "native", ctx: {}, config: { projectRoot: root } }),
    (err) => err.message.includes("agents service unavailable")
      && err.message.includes("no silent ProcessExecutor fallback"),
  );
  await assert.rejects(
    () => resolveExecutor({ driver: "native", ctx: { agents: null }, config: { projectRoot: root } }),
    (err) => err.message.includes("agents service unavailable"),
  );
  rmSync(root, { recursive: true, force: true });
});

test("bootstrapNativeConfig: allowNativeDriver + embed + native default config shape", () => {
  const root = tmpProject();
  setupMission(root);
  const config = bootstrapNativeConfig(root, { mission: "demo", runDir: "smoke-run" });

  assert.equal(config.driver, "native", "driver defaults to native");
  assert.equal(config.embed, true, "embed gate set for the DSH host process");
  assert.equal(config.missionName, "demo");
  assert.equal(config.projectRoot, root);
  assert.ok(config.runDir && config.runDir.includes(join("_tmp", "smoke-run")));
  assert.ok(existsSync(config.runDir), "resolveConfig created the run dir");
  assert.equal(config.mission.flowName, "native-smoke");

  // explicit driver override still routes through the same bootstrap
  const cfgOverride = bootstrapNativeConfig(root, { mission: "demo", driver: "opencode" });
  assert.equal(cfgOverride.driver, "opencode");
  assert.equal(cfgOverride.embed, true);
  rmSync(root, { recursive: true, force: true });
});

test("M4-WI14 bootstrapNativeConfig: base.json agent defaults the native run config (explicit args/env win)", () => {
  const root = tmpProject();
  setupMission(root);
  writeFileSync(join(root, "missions", "base.json"), JSON.stringify({ model: "m1", agent: "age" }), "utf8");
  const prevEnv = process.env.OPENCODE_AGENT;

  // base.agent flows when no explicit arg/env names an agent (the engine's
  // run path alone never consults base.json — plugin-layer defaulting).
  const fromBase = bootstrapNativeConfig(root, { mission: "demo", runDir: "agent-from-base" });
  assert.equal(fromBase.agent, "age");

  // explicit args keep precedence over the base default
  const fromArgs = bootstrapNativeConfig(root, { mission: "demo", runDir: "agent-from-args", agent: "standard" });
  assert.equal(fromArgs.agent, "standard");

  // explicit env keeps precedence over the base default
  process.env.OPENCODE_AGENT = "env-agent";
  const fromEnv = bootstrapNativeConfig(root, { mission: "demo", runDir: "agent-from-env" });
  assert.equal(fromEnv.agent, "env-agent");
  if (prevEnv === undefined) delete process.env.OPENCODE_AGENT; else process.env.OPENCODE_AGENT = prevEnv;

  // no base.agent anywhere → engine's own "build" fallback unchanged
  const bare = tmpProject();
  setupMission(bare);
  const fromDefault = bootstrapNativeConfig(bare, { mission: "demo", runDir: "agent-from-default" });
  assert.equal(fromDefault.agent, "build");
  rmSync(bare, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

test("full-chain smoke (native leg): callbacks reach engine._onAgentStepUpdate; run-state steps[] updated; dispose after run", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({
    script: ["<AI_STEP_RESULT>pass</AI_STEP_RESULT>"],
  });

  const result = await runNativeMission({
    ctx: { agents: fake.service },
    projectRoot: root,
    args: { mission: "demo", runDir: "smoke-run" },
  });

  // engine terminal mapping through the bundle's orchestrateRun + EXIT_MAP
  assert.equal(result.exitCode, 0, `result: ${JSON.stringify(result)}`);
  assert.equal(result.status, "completed");

  // THE dead-channel pin: _wfClose only preserves logFile/promptFile/sessionId
  // on the closed step record when _onAgentStepUpdate received them live —
  // i.e. the executor's call-time config.onStepUpdate resolution landed on
  // the channel orchestrateRun wired AFTER executor construction.
  const runState = JSON.parse(readFileSync(join(root, "_tmp", "smoke-run", "run-state.json"), "utf8"));
  assert.equal(runState.status, "completed");
  const step = runState.steps.find((s) => s.name === "PING");
  assert.ok(step, "PING step recorded");
  assert.ok(step.logFile, "live logFile landed in run-state (callback channel alive)");
  assert.ok(step.promptFile, "live promptFile landed in run-state (callback channel alive)");
  assert.ok(step.sessionId, "live sessionId landed in run-state (callback channel alive)");
  assert.equal(step.marker, "pass", "marker extraction stayed in the engine");
  assert.ok(step.logFile.startsWith("native-"), `engine run-dir log naming: ${step.logFile}`);

  // boundary prefix + single run-scoped handle + terminal dispose
  assert.equal(fake.state.creates.length, 1, "exactly one agent handle for the whole run");
  assert.equal(fake.state.followups.length, 1);
  assert.ok(fake.state.followups[0].text.startsWith("[MISSION_DRIVER:smoke-run] "), fake.state.followups[0].text.slice(0, 50));
  assert.equal(step.sessionId, fake.state.creates[0].sessionId, "run-state sessionId is the native childId");
  assert.deepEqual(fake.state.resumes, [], "no cold-handle recovery needed on the happy path");
  assert.equal(fake.state.disposed.length, 1, "run-terminal dispose exactly once");
  assert.equal(fake.state.disposed[0], fake.state.creates[0].sessionId);

  // artifacts on disk in the engine run-dir
  assert.ok(existsSync(join(root, "_tmp", "smoke-run", step.logFile)));
  assert.ok(existsSync(join(root, "_tmp", "smoke-run", step.promptFile)));
  rmSync(root, { recursive: true, force: true });
});

test("full-chain smoke (native leg): step failure path maps to exit 1 and still disposes", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: ["<AI_STEP_RESULT>fail</AI_STEP_RESULT>"] });

  const result = await runNativeMission({
    ctx: { agents: fake.service },
    projectRoot: root,
    args: { mission: "demo", runDir: "fail-run" },
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.status, "failed");
  assert.equal(fake.state.disposed.length, 1, "abort/failure terminal also releases the handle");
  rmSync(root, { recursive: true, force: true });
});
