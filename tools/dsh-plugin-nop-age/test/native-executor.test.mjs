/**
 * native-executor.test.mjs — NativeExecutor unit tests over a fake in-process
 * agents service (dsh-plugin M2-WI7 Phase 1 Proof; no host, no model creds).
 *
 * Branches pinned (plan Phase 1 Proof item):
 *   1. normal turn: scripted text harvest + childId return + run-dir artifact
 *      files + exactly two ordered callbacks ({logFile,promptFile} then
 *      {sessionId})
 *   2. call-time callback resolution: setting config.onStepUpdate AFTER
 *      construction still delivers callbacks (construction-time capture would
 *      be a dead channel — orchestrateRun assigns config.onStepUpdate after
 *      building the executor)
 *   3. opts-level onStepUpdate wins over config-level (subflow wrapping form)
 *   4. marker-less text passes through verbatim (marker parsing stays in the
 *      engine — contract preservation rule 1)
 *   5. watchdog: cancel → converge (handle kept) and cancel → hang (dispose);
 *      exit synthesis code 1 + errorTail; double-dispose guard
 *   6. create failure → structured failure result; missing agents service at
 *      the factory → explicit wire error (no silent ProcessExecutor fallback)
 *   7. cold handle → agents.resume({ resumeSessionId }) recovery
 *   8. executeTool plugin-layer minimal spawn: success / failure tail / timeout
 *   9. handle lifecycle: one live handle per run reused across steps, disposed
 *      exactly once at run terminal
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DshNativeExecutor, createNativeExecutor } from "../src/native-executor.ts";
import { createFakeAgentsService } from "./helpers/fake-agents.mjs";
import { foldSubagentDescriptor, SUBAGENT_DESCRIPTOR_VERSION } from "@deepseek-ai/dsh-subagent";

function tmpRunDir() {
  return mkdtempSync(join(tmpdir(), "native-executor-"));
}

function makeExecutor(agents, configExtra = {}, optsExtra = {}) {
  // projectRoot defaults to an EXISTING dir (spawn cwd) — tool tests rely on it
  const config = { projectRoot: process.cwd(), ...configExtra };
  return new DshNativeExecutor({ agents, config, ...optsExtra });
}

test("normal turn: harvest, childId, run-dir artifacts, two ordered callbacks", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({
    script: ["<AI_STEP_RESULT>pass</AI_STEP_RESULT>"],
  });
  const calls = [];
  const config = {
    projectRoot: "/tmp/proj",
    runDir,
    agent: "build",
    missionName: "matrix-mission",
    model: "test-model",
    onStepUpdate: (p) => calls.push(p),
  };
  const ex = new DshNativeExecutor({ agents: service, config });

  const r = await ex.executeAgent("PING", "do the thing", "sys", null, undefined, undefined);

  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  assert.equal(r.text, "<AI_STEP_RESULT>pass</AI_STEP_RESULT>");
  assert.equal(r.stderrTail, null);
  assert.equal(r.errorTail, null);
  assert.ok(r.sessionId, "childId returned");
  assert.ok(r.logFile && r.logFile.startsWith(runDir), `logFile in runDir: ${r.logFile}`);
  assert.equal(r.promptFile, `${r.logFile}.prompt`);

  // exactly two callbacks, files-first order (runner.js:220-228 mirror)
  assert.equal(calls.length, 2, `callbacks: ${JSON.stringify(calls)}`);
  assert.deepEqual(Object.keys(calls[0]).sort(), ["logFile", "promptFile", "stepName"]);
  assert.equal(calls[0].stepName, "PING");
  assert.equal(calls[0].logFile, r.logFile);
  assert.equal(calls[0].promptFile, r.promptFile);
  assert.deepEqual(Object.keys(calls[1]).sort(), ["sessionId", "stepName"]);
  assert.equal(calls[1].sessionId, r.sessionId);

  // artifacts on disk: prompt carries the boundary-marked prompt, log the harvest
  const promptOnDisk = readFileSync(r.promptFile, "utf8");
  assert.ok(promptOnDisk.startsWith(`[MISSION_DRIVER:${runDir.split(/[\\/]/).pop()}] `), promptOnDisk.slice(0, 60));
  const logOnDisk = readFileSync(r.logFile, "utf8");
  assert.ok(logOnDisk.includes("<AI_STEP_RESULT>pass</AI_STEP_RESULT>"));
  assert.ok(logOnDisk.includes("# round summary:"));

  // create got the verified options shape (R1 §1) + the durable descriptor
  // seed (WI11): meta.seedLength matches, and the seed folds back through the
  // host's own descriptor parser to a valid continuable mdcontrol descriptor.
  assert.equal(state.creates.length, 1);
  assert.ok(state.creates[0].sessionId.startsWith("native-"));
  assert.equal(state.creates[0].meta.seedLength, state.creates[0].seed.length);
  const folded = foldSubagentDescriptor(state.creates[0].seed);
  assert.equal(folded.version, SUBAGENT_DESCRIPTOR_VERSION);
  assert.equal(folded.mode, "continuable");
  assert.equal(folded.provider, "mdcontrol");
  assert.equal(folded.label, "Mission: matrix-mission");
  assert.equal(folded.agentModel, "test-model");
  assert.equal(folded.agentProvider, state.creates[0].agentOptions.provider);

  // run-terminal dispose
  await ex.dispose();
  assert.deepEqual(state.disposed, [r.sessionId]);
  rmSync(runDir, { recursive: true, force: true });
});

test("descriptor seed: label falls back to runId; fresh create after watchdog dispose re-seeds a new child", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({
    script: ["first ok", { never: true }, "recovered"],
    onCancel: "hang",
  });
  // no missionName anywhere and no model resolution → label falls back to the
  // runId basename and the descriptor omits agentProvider/agentModel
  delete process.env.DSH_MODEL;
  delete process.env.DSH_PROVIDER;
  const ex = new DshNativeExecutor({
    agents: service,
    config: { projectRoot: "/tmp/proj", runDir },
    watchdogGraceMs: 30,
  });

  const r1 = await ex.executeAgent("S1", "p", "", null, undefined, undefined);
  assert.equal(r1.ok, true);
  assert.equal(state.creates.length, 1);
  const folded1 = foldSubagentDescriptor(state.creates[0].seed);
  assert.equal(folded1.label, `Mission: ${runDir.split(/[\\/]/).pop()}`);
  assert.equal(folded1.agentProvider, undefined);
  assert.equal(folded1.agentModel, undefined);
  assert.ok(!("agentOptions" in state.creates[0]), "model-less create carries no agentOptions");

  // watchdog hang → dispose → next step (no session continuity) = a FRESH
  // create: a new lifecycle gets a new childId + exactly one new descriptor.
  const rt = await ex.executeAgent("S2", "p", "", null, undefined, { timeoutMs: 40 });
  assert.equal(rt.ok, false);
  const r2 = await ex.executeAgent("S3", "p", "", null, undefined, undefined);
  assert.equal(r2.ok, true, r2.errorTail);
  assert.equal(state.creates.length, 2, "fresh create after watchdog dispose re-seeds the new child");
  assert.notEqual(state.creates[1].sessionId, state.creates[0].sessionId);
  assert.equal(foldSubagentDescriptor(state.creates[1].seed)?.provider, "mdcontrol");
  assert.deepEqual(
    state.calls.filter((c) => c.op === "create").map((c) => c.seedLength),
    [1, 1],
  );
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("call-time callback resolution: config.onStepUpdate set after construction still fires", async () => {
  const runDir = tmpRunDir();
  const { service } = createFakeAgentsService({ script: ["ok text"] });
  const calls = [];
  // config WITHOUT onStepUpdate / runDir at construction time — both assigned
  // later, mirroring resolveConfig → orchestrateRun ordering.
  const config = { projectRoot: "/tmp/proj" };
  const ex = new DshNativeExecutor({ agents: service, config });
  config.onStepUpdate = (p) => calls.push(p);
  config.runDir = runDir;

  const r = await ex.executeAgent("LATE", "prompt", "", null, undefined, undefined);
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2, "callbacks must arrive through the live channel");
  assert.equal(calls[1].sessionId, r.sessionId);
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("opts-level onStepUpdate wins over config-level (subflow wrapping form)", async () => {
  const runDir = tmpRunDir();
  const { service } = createFakeAgentsService({ script: ["a", "b"] });
  const optsCalls = [];
  const configCalls = [];
  const config = {
    projectRoot: "/tmp/proj",
    runDir,
    onStepUpdate: (p) => configCalls.push(p),
  };
  const ex = new DshNativeExecutor({ agents: service, config });

  // engine subflow wrapper form: opts carries the child engine's callback
  await ex.executeAgent("SUB", "p1", "", null, undefined, {
    onStepUpdate: (p) => optsCalls.push(p),
  });
  // top-level form: opts absent → config channel
  await ex.executeAgent("TOP", "p2", "", null, undefined, undefined);

  assert.equal(optsCalls.length, 2, "subflow step callbacks go ONLY to the opts channel");
  assert.equal(configCalls.length, 2, "top-level step callbacks go to the config channel");
  assert.equal(optsCalls[1].stepName, "SUB");
  assert.equal(configCalls[1].stepName, "TOP");
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("marker-less text passes through verbatim (marker parsing stays in the engine)", async () => {
  const runDir = tmpRunDir();
  const raw = "no markers here\njust plain assistant text <not-a-marker>";
  const { service } = createFakeAgentsService({ script: [raw] });
  const ex = makeExecutor(service, { runDir });
  const r = await ex.executeAgent("PLAIN", "p", "", null, undefined, undefined);
  assert.equal(r.text, raw);
  assert.equal(r.ok, true);
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("watchdog: hard timeout → cancel(cause) → converge within grace → handle kept, code 1 + errorTail", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({
    script: [{ never: true }],
    onCancel: "converge",
  });
  const ex = makeExecutor(service, { runDir }, { watchdogGraceMs: 1000 });
  const r = await ex.executeAgent("HANG", "p", "", null, undefined, { timeoutMs: 60 });

  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stderrTail, null);
  assert.ok(r.errorTail.includes("[TIMEOUT]"), r.errorTail);
  assert.ok(r.errorTail.includes("converged"), r.errorTail);
  assert.equal(state.canceled.length, 1, "cancel(cause) fired exactly once");
  assert.equal(state.canceled[0].agentId, r.sessionId);
  assert.equal(state.canceled[0].cause.kind, "hook");
  assert.deepEqual(state.disposed, [], "converged cancel must NOT dispose the handle");
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("watchdog: cancel does not converge → dispose as last resort; double dispose guarded", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({
    script: [{ never: true }],
    onCancel: "hang",
  });
  const ex = makeExecutor(service, { runDir }, { watchdogGraceMs: 40 });
  const r = await ex.executeAgent("HANG2", "p", "", null, undefined, { timeoutMs: 30 });

  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 1);
  assert.ok(r.errorTail.includes("dispose"), r.errorTail);
  // sequence: cancel first, then dispose
  assert.equal(state.canceled.length, 1);
  assert.equal(state.disposed.length, 1);
  assert.equal(state.disposed[0], r.sessionId);

  // double executor dispose is a no-op (run terminal already released by the
  // watchdog here → nothing left; and a second call never re-enters)
  await ex.dispose();
  await ex.dispose();
  assert.equal(state.disposed.length, 1);
  rmSync(runDir, { recursive: true, force: true });
});

test("empty harvest: quiescence with no assistant message → code 1 + errorTail", async () => {
  const runDir = tmpRunDir();
  const { service } = createFakeAgentsService({ script: [{ error: new Error("model exploded") }] });
  const ex = makeExecutor(service, { runDir });
  const r = await ex.executeAgent("EMPTY", "p", "", null, undefined, undefined);
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 1);
  assert.ok(r.errorTail.includes("no non-empty assistant message"), r.errorTail);
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("create failure → structured failure result (executor never throws)", async () => {
  const runDir = tmpRunDir();
  const { service } = createFakeAgentsService({
    script: [],
    createError: new Error("registry factory missing"),
  });
  const ex = makeExecutor(service, { runDir });
  const r = await ex.executeAgent("NOAGENT", "p", "", null, undefined, undefined);
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 1);
  assert.ok(r.errorTail.includes("create/resume failed"), r.errorTail);
  assert.ok(r.errorTail.includes("registry factory missing"), r.errorTail);
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("factory: missing agents service → explicit wire error, no silent fallback", () => {
  assert.throws(
    () => createNativeExecutor({}, { projectRoot: "/tmp/proj" }),
    (err) => err.message.includes("agents service unavailable") && err.message.includes("no silent ProcessExecutor fallback"),
  );
  assert.throws(
    () => new DshNativeExecutor({ agents: null, config: { projectRoot: "/tmp/proj" } }),
    (err) => err.message.includes("agents service unavailable"),
  );
});

test("cold handle: followup throws → agents.resume({ resumeSessionId }) recovery", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({ script: ["first ok", "second ok"] });
  const ex = makeExecutor(service, { runDir });

  const r1 = await ex.executeAgent("S1", "p1", "", null, undefined, undefined);
  assert.equal(r1.ok, true);

  // host restart between steps: the live handle goes cold
  state.agents[0]._cold = true;
  const r2 = await ex.executeAgent("S2", "p2", "", r1.sessionId, undefined, undefined);

  assert.equal(r2.ok, true, `r2: ${r2.errorTail}`);
  assert.equal(r2.text, "second ok");
  assert.equal(r2.sessionId, r1.sessionId, "session continuity via resume");
  assert.equal(state.resumes.length, 1);
  assert.deepEqual(state.resumes[0], { resumeSessionId: r1.sessionId });
  assert.equal(state.creates.length, 1, "no extra create — exactly one run-scoped handle");
  // resume path needs no re-seeding: the durable descriptor from the create
  // seed travels with the persisted session (WI11 Decision).
  assert.equal(foldSubagentDescriptor(state.creates[0].seed)?.mode, "continuable");
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("handle lifecycle: one live handle per run, reused across steps, disposed once at terminal", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({
    script: ["one <AI_STEP_RESULT>ok</AI_STEP_RESULT>", "two", "three"],
  });
  const ex = makeExecutor(service, { runDir });

  const r1 = await ex.executeAgent("A", "p", "", null, undefined, undefined);
  const r2 = await ex.executeAgent("B", "p", "", r1.sessionId, undefined, undefined);
  const rp = await ex.executeParseAgent("parse-AI_STEP_RESULT", "parse prompt", "", r1.sessionId);

  assert.ok(r1.ok && r2.ok && rp.ok);
  assert.equal(state.creates.length, 1, "handle reused across agent + parse steps");
  assert.deepEqual(state.disposed, [], "no mid-run dispose");
  assert.equal(state.followups.length, 3);
  // parse agent mirrors the same dispatch chain (documented gap: same model)
  assert.equal(rp.text, "three");

  await ex.dispose();
  assert.deepEqual(state.disposed, [r1.sessionId], "terminal dispose exactly once");

  // post-terminal executeAgent fails cleanly instead of resurrecting a handle
  const rLate = await ex.executeAgent("LATE", "p", "", null, undefined, undefined);
  assert.equal(rLate.ok, false);
  assert.ok(rLate.errorTail.includes("disposed"), rLate.errorTail);
  assert.equal(state.creates.length, 1);
  rmSync(runDir, { recursive: true, force: true });
});

// Tool-step commands mirror flow-JSON form (naive whitespace split, no shell
// on POSIX) — so tests use argument-free `node <script-file>` commands.
function writeToolScript(runDir, name, body) {
  const file = join(runDir, name);
  writeFileSync(file, body, "utf8");
  return file;
}

test("executeTool: minimal plugin spawn — success writes log, exit code honored", async () => {
  const runDir = tmpRunDir();
  const okJs = writeToolScript(runDir, "ok.js", "console.log('tool-ok')\n");
  const { service } = createFakeAgentsService({ script: [] });
  const ex = makeExecutor(service, { runDir });
  const r = await ex.executeTool("BUILD_VERIFY", `${process.execPath} ${okJs}`, { timeout: 0 });
  assert.equal(r.ok, true);
  assert.ok(r.logFile && existsSync(r.logFile));
  assert.ok(readFileSync(r.logFile, "utf8").includes("tool-ok"));
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("executeTool: failure captures exit code + stderr tail", async () => {
  const runDir = tmpRunDir();
  const failJs = writeToolScript(runDir, "fail.js", "console.error('boom-line'); process.exit(3)\n");
  const { service } = createFakeAgentsService({ script: [] });
  const ex = makeExecutor(service, { runDir });
  const r = await ex.executeTool("FAILTOOL", `${process.execPath} ${failJs}`, { timeout: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 3);
  assert.ok(r.errorTail.includes("boom-line"), r.errorTail);
  assert.ok((r.stderrTail || "").includes("boom-line"));
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("executeTool: timeout kills the child and reports [TIMEOUT]", async () => {
  const runDir = tmpRunDir();
  const slowJs = writeToolScript(runDir, "slow.js", "setTimeout(function(){}, 30000)\n");
  const { service } = createFakeAgentsService({ script: [] });
  const ex = makeExecutor(service, { runDir });
  const r = await ex.executeTool("SLOWTOOL", `${process.execPath} ${slowJs}`, { timeout: 150 });
  assert.equal(r.ok, false);
  assert.ok(r.errorTail.includes("[TIMEOUT]"), r.errorTail);
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

// ── M4-WI14: agent-preset composition setup (plan 2202-1 Phase 1 D1
// Refinement 1 + D2 route-injection leg 2). The setup rides every create;
// the fake agents service records it without invoking (host contract: the
// factory invokes setup with the child's scoped context while unpublished).

/** A fake scoped agent context resolving 'agentPresets' (or not). */
function fakeAgentCtx(roster) {
  return { get: (name) => (name === "agentPresets" ? roster : undefined) };
}

/** A fake preset roster recording mount calls on itself (`mounts`). */
function fakeRoster(ids, { failOnMount = false } = {}) {
  const roster = {
    mounts: [],
    async list() {
      return ids.map((id) => ({ id }));
    },
    async mount(agentCtx, id) {
      roster.mounts.push({ agentCtx, id });
      if (failOnMount) throw new Error(`agent-presets: preset "${id}" failed to mount: broken composition`);
      return { id };
    },
  };
  return roster;
}

test("M4-WI14: create carries a preset-mount setup; roster + id on roster → mount(agentCtx, agent)", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({ script: ["<AI_STEP_RESULT>pass</AI_STEP_RESULT>"] });
  const ex = makeExecutor(service, { runDir, agent: "age", model: "test-model" });
  const r = await ex.executeAgent("PING", "go", "sys", null, undefined, undefined);
  assert.equal(r.ok, true);
  const options = state.creates[0];
  assert.equal(typeof options.setup, "function", "create options carry the setup");

  const roster = fakeRoster(["standard", "age"]);
  const agentCtx = fakeAgentCtx(roster);
  await options.setup(agentCtx);
  assert.deepEqual(roster.mounts, [{ agentCtx, id: "age" }], "setup mounts the mission's configured preset id");
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("M4-WI14: roster absent on the context → setup no-op (roster-less compositions unchanged)", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({ script: [] });
  const ex = makeExecutor(service, { runDir, agent: "age", model: "test-model" });
  await ex.executeAgent("PING", "go", "sys", null, undefined, undefined).catch(() => {});
  const setup = state.creates[0].setup;

  await setup(fakeAgentCtx(undefined));
  // A throwing get() (WI10 no-declared-inject finding posture) is also a no-op.
  const throwingCtx = { get: () => { throw new Error("service read without inject"); } };
  await setup(throwingCtx);
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("M4-WI14: preset id not on the roster → no mount (a leftover non-DSH agent value never bricks native runs)", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({ script: [] });
  const ex = makeExecutor(service, { runDir, agent: "build", model: "test-model" });
  await ex.executeAgent("PING", "go", "sys", null, undefined, undefined).catch(() => {});
  const setup = state.creates[0].setup;

  const roster = fakeRoster(["standard", "age"]);
  await setup(fakeAgentCtx(roster));
  assert.deepEqual(roster.mounts, [], "unknown id → no mount call");
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("M4-WI14: no agent field in config → setup no-op even with a roster composed", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({ script: [] });
  const ex = makeExecutor(service, { runDir, model: "test-model" });
  await ex.executeAgent("PING", "go", "sys", null, undefined, undefined).catch(() => {});
  const setup = state.creates[0].setup;

  const roster = fakeRoster(["standard", "age"]);
  await setup(fakeAgentCtx(roster));
  assert.deepEqual(roster.mounts, [], "no configured preset id → no mount");
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});

test("M4-WI14: broken preset → setup rejects (host rolls the child creation back — fail-loud for real AGE deployments)", async () => {
  const runDir = tmpRunDir();
  const { service, state } = createFakeAgentsService({ script: [] });
  const ex = makeExecutor(service, { runDir, agent: "age", model: "test-model" });
  await ex.executeAgent("PING", "go", "sys", null, undefined, undefined).catch(() => {});
  const setup = state.creates[0].setup;

  const roster = fakeRoster(["age"], { failOnMount: true });
  await assert.rejects(() => setup(fakeAgentCtx(roster)), /failed to mount/);
  await ex.dispose();
  rmSync(runDir, { recursive: true, force: true });
});
