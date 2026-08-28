/**
 * mdcontrol-routes.test.mjs — wire routes + async job contract + active-run
 * guard unit suite (dsh-plugin M2-WI10, plan `2026-08-23-1621-2` Phase 1
 * Proof; fake HostContext + fake agents service, route DIRECT calls + fake
 * HTTP dispatcher — zero network, zero credentials, zero real host).
 * Extended M3-WI12 (plan `2026-08-23-1852-2` Phase 2): mdcontrol.draft
 * (async job contract, engine draft-state vocabulary, shared guard slot,
 * fail-fast desc validation, gate-blocked, receipt) + mdcontrol.analyze
 * (three target states, seam dispatch, verbatim result, failure parity).
 *
 * Branches pinned (plan Phase 1 Proof item):
 *   1. async contract: mdcontrol.run resolves IMMEDIATELY (measured window)
 *      while the detached task is still advancing; { runId, status:'started' }
 *      shape; runId = basename(runDir); run-state runId agreement.
 *   2. guard (1447-1 adjudication): concurrent same-root run → explicit
 *      run-in-progress wire error; cross-root independent; cleared on
 *      success terminal AND failure paths (bootstrap error, task crash).
 *   3. session decoupling: the requesting session disappearing (receipt
 *      target gone) never stops the run — task reaches terminal state.
 *   4. terminal receipt (opt-in both sides): posted to the live requesting
 *      agent (one plain-text line via agents.get → followup); not posted
 *      when not opted in; skipped with a warn when the session is not live.
 *   5. status: in-flight (live record) / terminal (run-state passthrough) /
 *      missing (found:false) — no second state machine (engine status field
 *      is passed through verbatim).
 *   6. list: empty / running-only / with-terminal / mixed (disk + live) /
 *      cross-root visibility.
 *   7. executor release: exactly ONE dispose at terminal (the detached
 *      variant adds no double-release site).
 *   8. HTTP dispatcher (fake webServer + fake req/res): envelope shapes,
 *      405/404/400 paths, absent-webServer degradation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ActiveRunGuard,
  MdControlError,
  createMdControlRoutes,
  registerMdControlHttpDispatcher,
} from "../src/mdcontrol-routes.ts";
import { createFakeAgentsService } from "./helpers/fake-agents.mjs";

const PASS_MARKER = "<AI_STEP_RESULT>pass</AI_STEP_RESULT>";

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "mdcontrol-routes-"));
}

// Self-contained temp mission tree (engine-bridge.test.mjs convention).
function setupMission(root, { flowName = "native-smoke", missionName = "demo" } = {}) {
  const missionsDir = join(root, "missions");
  mkdirSync(missionsDir, { recursive: true });
  writeFileSync(join(missionsDir, `${missionName}.json`), JSON.stringify({
    name: missionName,
    roadmapPath: "docs/roadmap",
    plansDir: "docs/plans/demo",
    flowName,
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
  mkdirSync(join(root, "docs", "roadmap"), { recursive: true });
  mkdirSync(join(root, "docs", "plans", "demo"), { recursive: true });
  return missionsDir;
}

function makeRoutes(fake, options = {}) {
  const logs = [];
  const logger = {
    info: (m, f) => logs.push({ level: "info", m, f }),
    warn: (m, f) => logs.push({ level: "warn", m, f }),
  };
  const built = createMdControlRoutes({ ctx: { agents: fake.service }, logger, ...options });
  return { ...built, logs };
}

async function waitFor(check, { timeoutMs = 8000, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`waitFor(${label}) timed out; last=${JSON.stringify(last)}`);
}

// ── 1. Async job contract ────────────────────────────────────────────────────

test("mdcontrol.run returns immediately with { runId, status:'started' } while the task keeps advancing", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: [PASS_MARKER], turnDelayMs: 250 });
  const routes = makeRoutes(fake);

  const t0 = Date.now();
  const started = await routes["mdcontrol.run"]({
    projectRoot: root,
    args: { mission: "demo", runDir: "async-run" },
  });
  const elapsed = Date.now() - t0;

  assert.equal(started.status, "started");
  assert.equal(started.runId, "async-run");
  assert.ok(started.runDir.endsWith(join("_tmp", "async-run")));
  assert.ok(typeof started.startedAt === "string");
  // Non-blocking machine assertion: the route resolved well inside the
  // scripted 250ms turn — the engine loop dispatched its first step but was
  // still in flight (no terminal, no dispose) at resolve time.
  assert.ok(elapsed < 150, `route call took ${elapsed}ms — expected immediate return`);
  assert.equal(fake.state.followups.length, 1, "task dispatched its first step before the route resolved");
  assert.equal(fake.state.disposed.length, 0, "run was still in flight (no terminal dispose) at resolve time");

  const status = await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "async-run" }).then((s) => (s.terminal ? s : null)),
    { label: "terminal status" },
  );
  assert.equal(status.terminal.exitCode, 0);
  assert.equal(status.terminal.status, "completed");
  assert.equal(status.runState.status, "completed");
  assert.equal(status.runState.runId, "async-run", "route runId = engine run-state runId vocabulary");
  rmSync(root, { recursive: true, force: true });
});

test("run-state lands under _tmp/<runId>/ and monitor shares the file (file-format identity)", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: [PASS_MARKER] });
  const routes = makeRoutes(fake);

  await routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "file-run" } });
  const status = await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "file-run" }).then((s) => (s.terminal ? s : null)),
    { label: "terminal" },
  );
  assert.ok(existsSync(join(status.runDir, "run-state.json")));
  rmSync(root, { recursive: true, force: true });
});

// ── 2. Active-run guard (1447-1 adjudication) ───────────────────────────────

test("guard: concurrent same-root run → explicit run-in-progress wire error; cross-root independent", async () => {
  const rootA = tmpProject();
  const rootB = tmpProject();
  setupMission(rootA);
  setupMission(rootB);
  const fake = createFakeAgentsService({ script: [PASS_MARKER, PASS_MARKER], turnDelayMs: 120 });
  const routes = makeRoutes(fake);

  await routes["mdcontrol.run"]({ projectRoot: rootA, args: { mission: "demo", runDir: "a-1" } });

  await assert.rejects(
    () => routes["mdcontrol.run"]({ projectRoot: rootA, args: { mission: "demo", runDir: "a-2" } }),
    (err) => err instanceof MdControlError
      && err.code === "run-in-progress"
      && err.message.includes("single engine activity per project root")
      && err.message.includes("a-1"),
  );

  // Cross-root: an independent engine instance — starts cleanly.
  const bStarted = await routes["mdcontrol.run"]({ projectRoot: rootB, args: { mission: "demo", runDir: "b-1" } });
  assert.equal(bStarted.status, "started");

  await waitFor(
    () => Promise.all([
      routes["mdcontrol.status"]({ projectRoot: rootA, runId: "a-1" }),
      routes["mdcontrol.status"]({ projectRoot: rootB, runId: "b-1" }),
    ]).then((s) => (s[0].terminal && s[1].terminal ? s : null)),
    { label: "both terminals" },
  );

  // Terminal cleared the slot: a new same-root run is accepted again.
  const aAgain = await routes["mdcontrol.run"]({ projectRoot: rootA, args: { mission: "demo", runDir: "a-3" } });
  assert.equal(aAgain.status, "started");
  await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: rootA, runId: "a-3" }).then((s) => (s.terminal ? s : null)),
    { label: "a-3 terminal" },
  );
  rmSync(rootA, { recursive: true, force: true });
  rmSync(rootB, { recursive: true, force: true });
});

test("guard: bootstrap failure (unknown mission) → fail-fast error, guard NOT left occupied", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: [] });
  const routes = makeRoutes(fake);
  const guard = routes.guard;

  await assert.rejects(
    () => routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "nope" } }),
    (err) => !(err instanceof MdControlError) && /nope|mission/i.test(err.message),
  );
  assert.equal(guard.current(root), null, "failed bootstrap released the root");

  // …and the root is immediately usable.
  const ok = await routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "after-fail" } });
  assert.equal(ok.status, "started");
  await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "after-fail" }).then((s) => (s.terminal ? s : null)),
    { label: "terminal after recovery" },
  );
  rmSync(root, { recursive: true, force: true });
});

test("guard: missing agents service → explicit wire error (no silent fallback), guard released", async () => {
  const root = tmpProject();
  setupMission(root);
  const routes = createMdControlRoutes({ ctx: {} }); // no ctx.agents at all

  await assert.rejects(
    () => routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "x" } }),
    (err) => err.message.includes("agents service unavailable"),
  );
  assert.equal(routes.guard.current(root), null);
  rmSync(root, { recursive: true, force: true });
});

test("guard: task crash (engine throws post-start) → terminal.error recorded, guard cleared", async () => {
  const root = tmpProject();
  // Valid mission tree, but flowName points at a flow that does not exist:
  // bootstrap passes (mission checks only pin name/roadmapPath/plansDir),
  // the detached orchestrateRun task throws inside createMissionDriverFlow.
  setupMission(root);
  writeFileSync(join(root, "missions", "demo.json"), JSON.stringify({
    name: "demo",
    roadmapPath: "docs/roadmap",
    plansDir: "docs/plans/demo",
    flowName: "missing-flow",
    commands: { test: "echo ok" },
  }), "utf8");
  const fake = createFakeAgentsService({ script: [] });
  const routes = makeRoutes(fake);

  const started = await routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "crash-run" } });
  assert.equal(started.status, "started");
  const status = await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "crash-run" }).then((s) => (s.terminal ? s : null)),
    { label: "crash terminal" },
  );
  assert.equal(status.terminal.exitCode, 1);
  assert.ok(status.terminal.error, "crash error captured on the terminal record");
  assert.equal(routes.guard.current(root), null, "crash path cleared the guard");
  rmSync(root, { recursive: true, force: true });
});

test("guard unit: release is owner-checked and cross-slot safe", () => {
  const guard = new ActiveRunGuard();
  const h1 = guard.tryAcquire("/r");
  assert.ok(h1);
  assert.equal(guard.tryAcquire("/r"), null);
  guard.release(h1);
  assert.equal(guard.tryAcquire("/r") !== null, true, "slot reusable after release");
  const stale = guard.tryAcquire("/r2");
  guard.release(stale);
  guard.release(stale); // double release is a no-op
  assert.equal(guard.current("/r2"), null);
});

// ── 3+4. Session decoupling + terminal receipt ───────────────────────────────

test("session decoupling: requesting session disappearing never stops the run; missing receipt target is a warn-only skip", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: [PASS_MARKER] });
  // get() returns undefined — the requesting "session" is gone (host restart).
  const routes = makeRoutes(fake);

  const started = await routes["mdcontrol.run"]({
    projectRoot: root,
    args: { mission: "demo", runDir: "decoupled-run" },
    followup: { sessionId: "gone-session" },
  });
  assert.equal(started.status, "started");

  const status = await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "decoupled-run" }).then((s) => (s.terminal ? s : null)),
    { label: "terminal despite gone session" },
  );
  assert.equal(status.terminal.status, "completed", "run reached terminal state with the requesting session gone");
  assert.ok(
    routes.logs.some((l) => l.level === "warn" && /receipt skipped/.test(l.m)),
    "receipt skip is logged, not thrown",
  );
  rmSync(root, { recursive: true, force: true });
});

test("receipt (opt-in): one plain-text line posted to the live requesting agent via agents.get → followup", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: [PASS_MARKER] });
  const receipts = [];
  const serviceWithGet = Object.create(fake.service);
  serviceWithGet.get = (id) =>
    id === "ses_requester" ? { followup: (message) => receipts.push(message) } : undefined;
  const routes = makeRoutes({ ...fake, service: serviceWithGet });

  await routes["mdcontrol.run"]({
    projectRoot: root,
    args: { mission: "demo", runDir: "receipt-run" },
    followup: { sessionId: "ses_requester" },
  });
  await waitFor(() => (receipts.length === 1 ? receipts : null), { label: "receipt posted" });

  const message = receipts[0];
  const text = (message.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  assert.match(text, /^\[mdcontrol\] run receipt-run finished: status=completed exitCode=0[^\n]*$/);
  assert.ok(routes.logs.some((l) => l.level === "info" && /receipt posted/.test(l.m)));
  assert.equal(receipts.length, 1, "exactly one receipt line");
  rmSync(root, { recursive: true, force: true });
});

test("receipt (not opted in): terminal settles with zero host get/followup calls", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: [PASS_MARKER] });
  let getCalls = 0;
  const serviceWithGet = Object.create(fake.service);
  serviceWithGet.get = () => { getCalls += 1; return undefined; };
  const routes = makeRoutes({ ...fake, service: serviceWithGet });

  await routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "quiet-run" } });
  await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "quiet-run" }).then((s) => (s.terminal ? s : null)),
    { label: "terminal" },
  );
  assert.equal(getCalls, 0, "no receipt lookup when the flag is absent");
  rmSync(root, { recursive: true, force: true });
});

// ── 5. status ────────────────────────────────────────────────────────────────

test("status: in-flight (live record, no run-state yet) / terminal / missing", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: [PASS_MARKER], turnDelayMs: 120 });
  const routes = makeRoutes(fake);

  await routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "st-run" } });

  const inFlight = await routes["mdcontrol.status"]({ projectRoot: root, runId: "st-run" });
  assert.equal(inFlight.found, true);
  assert.equal(inFlight.live, true);
  assert.equal(inFlight.terminal, null);
  assert.ok(inFlight.runDir.endsWith(join("_tmp", "st-run")));

  const terminal = await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "st-run" }).then((s) => (s.terminal ? s : null)),
    { label: "terminal" },
  );
  assert.equal(terminal.live, false);
  assert.equal(terminal.runState.status, "completed", "engine status vocabulary passed through verbatim");
  assert.equal(terminal.terminal.status, "completed");
  assert.equal(terminal.terminal.error, null);

  const missing = await routes["mdcontrol.status"]({ projectRoot: root, runId: "never-started" });
  assert.equal(missing.found, false);
  assert.equal(missing.runState, null);
  assert.equal(missing.runDir, null);

  await assert.rejects(
    () => routes["mdcontrol.status"]({ runId: "st-run" }),
    (err) => err instanceof MdControlError && err.code === "bad-request",
  );
  rmSync(root, { recursive: true, force: true });
});

// ── 6. list ──────────────────────────────────────────────────────────────────

test("list: empty root → empty rows", async () => {
  const root = tmpProject();
  const routes = makeRoutes(createFakeAgentsService({ script: [] }));
  const out = await routes["mdcontrol.list"]({ projectRoot: root });
  assert.deepEqual(out.runs, []);
  rmSync(root, { recursive: true, force: true });
});

test("list: running-only / with-terminal / mixed disk+live / cross-root visibility", async () => {
  const rootA = tmpProject();
  const rootB = tmpProject();
  setupMission(rootA);
  setupMission(rootB);

  // A disk-only historical run (monitor listRuns precedent: _tmp/<dir>/run-state.json).
  const oldDir = join(rootA, "_tmp", "old-mission-driver");
  mkdirSync(oldDir, { recursive: true });
  writeFileSync(join(oldDir, "run-state.json"), JSON.stringify({
    runId: "old-mission-driver",
    status: "failed",
    missionName: "legacy",
  }), "utf8");

  const fake = createFakeAgentsService({ script: [PASS_MARKER], turnDelayMs: 120 });
  const routes = makeRoutes(fake);

  await routes["mdcontrol.run"]({ projectRoot: rootA, args: { mission: "demo", runDir: "live-run" } });

  const runningOnly = await routes["mdcontrol.list"]({ projectRoot: rootB });
  assert.deepEqual(runningOnly.runs, [], "root B sees neither A's live run nor A's disk run (cross-root visibility)");

  const mixed = await routes["mdcontrol.list"]({ projectRoot: rootA });
  assert.equal(mixed.runs.length, 2, "disk row + live row");
  const liveRow = mixed.runs.find((r) => r.runId === "live-run");
  const diskRow = mixed.runs.find((r) => r.runId === "old-mission-driver");
  assert.ok(liveRow && liveRow.live && liveRow.startedAt, "live row flagged");
  assert.ok(diskRow && !diskRow.live && diskRow.status === "failed" && diskRow.missionName === "legacy", "disk row passthrough");

  await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: rootA, runId: "live-run" }).then((s) => (s.terminal ? s : null)),
    { label: "live-run terminal" },
  );
  const withTerminal = await routes["mdcontrol.list"]({ projectRoot: rootA });
  const doneRow = withTerminal.runs.find((r) => r.runId === "live-run");
  assert.equal(doneRow.live, false);
  assert.equal(doneRow.status, "completed", "run-state status merged into the row");
  assert.equal(doneRow.terminal.status, "completed");
  rmSync(rootA, { recursive: true, force: true });
  rmSync(rootB, { recursive: true, force: true });
});

// ── 7. Executor release invariant ────────────────────────────────────────────

test("detached run releases the agents handle EXACTLY once at terminal (no double dispose)", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: [PASS_MARKER] });
  const routes = makeRoutes(fake);

  await routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "dispose-run" } });
  await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "dispose-run" }).then((s) => (s.terminal ? s : null)),
    { label: "terminal" },
  );
  assert.equal(fake.state.creates.length, 1);
  assert.equal(fake.state.disposed.length, 1, "exactly one dispose across the whole detached run");
  rmSync(root, { recursive: true, force: true });
});

// ── 8. HTTP dispatcher (fake webServer + fake req/res) ───────────────────────

function fakeReq(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(body, "utf8")];
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  };
}

function fakeRes() {
  const out = { status: null, headers: null, body: "" };
  return {
    out,
    writeHead(status, headers) {
      out.status = status;
      out.headers = headers;
    },
    end(body) {
      out.body = body ?? "";
    },
  };
}

function makeHttp(routes) {
  const registered = [];
  const webServer = {
    register(route) {
      registered.push(route);
      return () => {};
    },
  };
  const dispose = registerMdControlHttpDispatcher({ get: (name) => (name === "webServer" ? webServer : undefined) }, routes);
  assert.ok(dispose);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].kind, "prefix");
  assert.equal(registered[0].path, "/mdcontrol/api");
  return registered[0].handler;
}

test("HTTP dispatcher: success envelope, unknown method 404, GET 405, wire error 400, bad JSON 400", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({ script: [PASS_MARKER], turnDelayMs: 120 });
  const routes = makeRoutes(fake);
  const handler = makeHttp(routes);

  const okRes = fakeRes();
  await handler(fakeReq("POST", "/mdcontrol/api/mdcontrol.list", JSON.stringify({ projectRoot: root })), okRes);
  assert.equal(okRes.out.status, 200);
  const okBody = JSON.parse(okRes.out.body);
  assert.equal(okBody.ok, true);
  assert.equal(okBody.value.projectRoot, root);

  await routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "http-run" } });

  const busyRes = fakeRes();
  await handler(fakeReq("POST", "/mdcontrol/api/mdcontrol.run", JSON.stringify({
    projectRoot: root,
    args: { mission: "demo", runDir: "http-run-2" },
  })), busyRes);
  assert.equal(busyRes.out.status, 400);
  const busyBody = JSON.parse(busyRes.out.body);
  assert.equal(busyBody.ok, false);
  assert.equal(busyBody.error.code, "run-in-progress");

  const notFoundRes = fakeRes();
  await handler(fakeReq("POST", "/mdcontrol/api/mdcontrol.nope", "{}"), notFoundRes);
  assert.equal(notFoundRes.out.status, 404);
  assert.equal(JSON.parse(notFoundRes.out.body).error.code, "not-found");

  const getRes = fakeRes();
  await handler(fakeReq("GET", "/mdcontrol/api/mdcontrol.list"), getRes);
  assert.equal(getRes.out.status, 405);

  const badJsonRes = fakeRes();
  await handler(fakeReq("POST", "/mdcontrol/api/mdcontrol.list", "{not json"), badJsonRes);
  assert.equal(badJsonRes.out.status, 400);
  assert.equal(JSON.parse(badJsonRes.out.body).error.code, "bad-request");

  await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "http-run" }).then((s) => (s.terminal ? s : null)),
    { label: "http-run terminal" },
  );
  rmSync(root, { recursive: true, force: true });
});

test("HTTP dispatcher: absent webServer → registration skipped without throwing", () => {
  const logs = [];
  const routes = createMdControlRoutes({ ctx: {}, logger: { info: (m) => logs.push(m) } });
  const dispose = registerMdControlHttpDispatcher({ get: () => undefined }, routes, { info: (m) => logs.push(m) });
  assert.equal(dispose, null);
  assert.ok(logs.some((m) => /webServer service absent/.test(m)));
});

// ── Payload validation ───────────────────────────────────────────────────────

test("mdcontrol.run payload validation: bad args / bad followup shapes", async () => {
  const root = tmpProject();
  setupMission(root);
  const routes = makeRoutes(createFakeAgentsService({ script: [] }));

  await assert.rejects(
    () => routes["mdcontrol.run"]({ projectRoot: root, args: ["not", "an", "object"] }),
    (err) => err instanceof MdControlError && err.code === "bad-request" && /args/.test(err.message),
  );
  await assert.rejects(
    () => routes["mdcontrol.run"]({ projectRoot: root, followup: { sessionId: 42 } }),
    (err) => err instanceof MdControlError && err.code === "bad-request" && /followup/.test(err.message),
  );
  await assert.rejects(
    () => routes["mdcontrol.run"]({}),
    (err) => err instanceof MdControlError && err.code === "bad-request",
  );
  assert.equal(routes.guard.current(root), null, "validation failures never occupy the guard");
  rmSync(root, { recursive: true, force: true });
});

// ── 9. mdcontrol.draft (M3-WI12, async job contract + executor seam) ────────

function readDraftState(jobDir) {
  return JSON.parse(readFileSync(join(jobDir, "draft-state.json"), "utf8"));
}

test("mdcontrol.draft: immediate start, two-stage state progression, engine draft-state vocabulary", async () => {
  const root = tmpProject();
  setupMission(root);
  const genMission = join(root, "missions", "generated-mission.json");
  writeFileSync(genMission, JSON.stringify({
    name: "generated-mission",
    roadmapPath: "docs/backlog/gen-roadmap.md",
    plansDir: "docs/plans/generated-mission",
  }), "utf8");
  const fake = createFakeAgentsService({
    script: [
      "<BRIEF_FILE>docs/backlog/gen-brief.md</BRIEF_FILE>\n<BRIEF_GATE>pass</BRIEF_GATE>",
      `<AI_STEP_RESULT>created</AI_STEP_RESULT>\n<MISSION_FILE>${genMission}</MISSION_FILE>`,
    ],
    turnDelayMs: 120,
  });
  const routes = makeRoutes(fake);

  const t0 = Date.now();
  const started = await routes["mdcontrol.draft"]({
    projectRoot: root,
    desc: "add an audit counter to the mission dashboard",
  });
  const elapsed = Date.now() - t0;

  assert.equal(started.status, "started");
  assert.match(started.jobId, /^draft-\d{8}-\d{6}-\d{3}(-\w+)?-mission-draft$/, "engine startDraftJob jobId vocabulary");
  assert.ok(started.jobDir.endsWith(join("_tmp", started.jobId)));
  assert.ok(typeof started.startedAt === "string");
  assert.ok(elapsed < 150, `draft route took ${elapsed}ms — expected immediate return`);

  // Engine vocabulary on disk at start: running + phase brief (no second state machine).
  const initialState = readDraftState(started.jobDir);
  assert.equal(initialState.status, "running");
  assert.equal(initialState.phase, "brief");
  assert.equal(initialState.desc, "add an audit counter to the mission dashboard");

  await waitFor(() => {
    const s = readDraftState(started.jobDir);
    return s.status === "completed" ? s : null;
  }, { label: "draft completed state" });
  const finalState = readDraftState(started.jobDir);
  assert.equal(finalState.phase, "completed");
  assert.equal(finalState.briefPath, "docs/backlog/gen-brief.md");
  assert.equal(finalState.briefGate, "pass");
  assert.equal(finalState.missionName, "generated-mission", "MISSION_FILE tag → read mission.json name");
  assert.equal(finalState.roadmapPath, "docs/backlog/gen-roadmap.md");
  assert.equal(finalState.missionFile, genMission);

  // Guard released at terminal; agents handle disposed exactly once.
  await waitFor(() => (routes.guard.current(root) === null ? true : null), { label: "guard release" });
  assert.equal(fake.state.disposed.length, 1, "exactly one agents-handle dispose across the draft");
  rmSync(root, { recursive: true, force: true });
});

test("mdcontrol.draft: guard semantics — draft blocks run (shared slot), released on terminal", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({
    script: ["<BRIEF_GATE>pass</BRIEF_GATE>"],
    turnDelayMs: 120,
  });
  const routes = makeRoutes(fake);

  const started = await routes["mdcontrol.draft"]({ projectRoot: root, desc: "build a widget factory" });
  await waitFor(() => (fake.state.followups.length >= 1 ? true : null), { label: "brief dispatched" });

  await assert.rejects(
    () => routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "blocked-run" } }),
    (err) => err instanceof MdControlError && err.code === "run-in-progress" && err.message.includes(started.jobId),
  );
  await assert.rejects(
    () => routes["mdcontrol.draft"]({ projectRoot: root, desc: "a second concurrent draft goal" }),
    (err) => err instanceof MdControlError && err.code === "run-in-progress",
  );

  await waitFor(() => (routes.guard.current(root) === null ? true : null), { label: "draft terminal" });
  const after = await routes["mdcontrol.run"]({ projectRoot: root, args: { mission: "demo", runDir: "after-draft" } });
  assert.equal(after.status, "started", "root usable again after draft terminal");
  await waitFor(
    () => routes["mdcontrol.status"]({ projectRoot: root, runId: "after-draft" }).then((s) => (s.terminal ? s : null)),
    { label: "post-draft run terminal" },
  );
  rmSync(root, { recursive: true, force: true });
});

test("mdcontrol.draft: engine validateDraftDesc fail-fast (thin wrapper, no jobDir, guard free)", async () => {
  const root = tmpProject();
  setupMission(root);
  const routes = makeRoutes(createFakeAgentsService({ script: [] }));

  await assert.rejects(
    () => routes["mdcontrol.draft"]({ projectRoot: root, desc: "xxx" }),
    (err) => err instanceof MdControlError && err.code === "bad-request" && /placeholder/.test(err.message),
  );
  await assert.rejects(
    () => routes["mdcontrol.draft"]({ projectRoot: root, desc: "ab" }),
    (err) => err instanceof MdControlError && err.code === "bad-request" && /too short/.test(err.message),
  );
  await assert.rejects(
    () => routes["mdcontrol.draft"]({ projectRoot: root }),
    (err) => err instanceof MdControlError && err.code === "bad-request" && /desc/.test(err.message),
  );
  const tmpEntries = (() => {
    try { return readdirSync(join(root, "_tmp")); } catch { return []; }
  })();
  assert.deepEqual(tmpEntries, [], "rejected descs never create a jobDir");
  assert.equal(routes.guard.current(root), null);
  rmSync(root, { recursive: true, force: true });
});

test("mdcontrol.draft: brief gate=blocked stops before Stage 2; state=blocked; guard released", async () => {
  const root = tmpProject();
  setupMission(root);
  const fake = createFakeAgentsService({
    script: ["<BRIEF_GATE>blocked</BRIEF_GATE>\n<BRIEF_GATE_REASON>too thin to scope</BRIEF_GATE_REASON>"],
    turnDelayMs: 60,
  });
  const routes = makeRoutes(fake);

  const started = await routes["mdcontrol.draft"]({ projectRoot: root, desc: "optimize" });
  const finalState = await waitFor(() => {
    const s = readDraftState(started.jobDir);
    return s.status === "blocked" ? s : null;
  }, { label: "blocked state" });
  assert.equal(finalState.briefGate, "blocked");
  assert.equal(finalState.briefGateReason, "too thin to scope");
  await waitFor(() => (fake.state.followups.length === 1 ? true : null), { label: "exactly one dispatch" });
  assert.equal(fake.state.followups.length, 1, "no Stage-2 dispatch after a blocked gate");
  await waitFor(() => (routes.guard.current(root) === null ? true : null), { label: "guard release (blocked)" });
  rmSync(root, { recursive: true, force: true });
});

test("mdcontrol.draft: missing agents service → explicit error, guard released, no leak", async () => {
  const root = tmpProject();
  setupMission(root);
  const routes = createMdControlRoutes({ ctx: {} });

  await assert.rejects(
    () => routes["mdcontrol.draft"]({ projectRoot: root, desc: "a legitimate draft goal" }),
    (err) => err.message.includes("agents service unavailable"),
  );
  assert.equal(routes.guard.current(root), null);
  rmSync(root, { recursive: true, force: true });
});

test("mdcontrol.draft: opt-in terminal receipt posted with draft-state status + mission", async () => {
  const root = tmpProject();
  setupMission(root);
  const genMission = join(root, "missions", "receipt-mission.json");
  writeFileSync(genMission, JSON.stringify({
    name: "receipt-mission",
    roadmapPath: "docs/backlog/receipt-roadmap.md",
  }), "utf8");
  const fake = createFakeAgentsService({
    script: [
      "<BRIEF_GATE>pass</BRIEF_GATE>",
      `<MISSION_FILE>${genMission}</MISSION_FILE>`,
    ],
    turnDelayMs: 40,
  });
  const receipts = [];
  const serviceWithGet = Object.create(fake.service);
  serviceWithGet.get = (id) =>
    id === "ses_draft_requester" ? { followup: (message) => receipts.push(message) } : undefined;
  const routes = makeRoutes({ ...fake, service: serviceWithGet });

  await routes["mdcontrol.draft"]({
    projectRoot: root,
    desc: "draft a mission with a receipt",
    followup: { sessionId: "ses_draft_requester" },
  });
  await waitFor(() => (receipts.length === 1 ? receipts : null), { label: "draft receipt posted" });
  const text = (receipts[0].content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  assert.match(text, /^\[mdcontrol\] draft draft-\S+ finished: status=completed mission=receipt-mission[^\n]*$/);
  assert.equal(receipts.length, 1, "exactly one draft receipt line");
  rmSync(root, { recursive: true, force: true });
});

// ── 10. mdcontrol.analyze (M3-WI12, synchronous single-turn job) ────────────

function seedRunDir(root, runId, { mtimeMs } = {}) {
  const runDir = join(root, "_tmp", runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "run-state.json"), JSON.stringify({
    runId,
    status: "completed",
    missionName: "demo",
  }), "utf8");
  if (mtimeMs !== undefined) utimesSync(join(runDir, "run-state.json"), mtimeMs, mtimeMs);
  return runDir;
}

test("mdcontrol.analyze: explicit runId → postmortem dispatched natively + return tags parsed verbatim", async () => {
  const root = tmpProject();
  setupMission(root);
  const runDir = seedRunDir(root, "an-target-mission-driver");
  const fake = createFakeAgentsService({
    script: ["<POSTMORTEM_FILE>docs/postmortems/an-target.md</POSTMORTEM_FILE>\n<MEMORY_UPDATED>no</MEMORY_UPDATED>"],
  });
  const routes = makeRoutes(fake);

  const result = await routes["mdcontrol.analyze"]({ projectRoot: root, runId: "an-target-mission-driver" });

  assert.equal(result.targetRunId, "an-target-mission-driver");
  assert.equal(result.targetRunDir, runDir);
  assert.ok(result.jobDir.includes(join("_tmp", "analyze-run-")), "engine CLI analyze-run jobDir vocabulary");
  assert.equal(result.postmortemFile, "docs/postmortems/an-target.md");
  assert.equal(result.memoryUpdated, "no");
  assert.match(result.text, /<POSTMORTEM_FILE>/);

  // Seam path: ONE dispatch through the agents service (runPostmortem's single
  // analyze-run turn), prompt = the engine's postmortem template.
  assert.equal(fake.state.followups.length, 1);
  assert.match(fake.state.followups[0].text, /Reliability Engineer/, "engine run-postmortem.md prompt routed");
  assert.match(fake.state.followups[0].text, /an-target-mission-driver/);
  assert.equal(fake.state.disposed.length, 1, "single dispose owned by the adapter's finally (N3)");
  assert.ok(existsSync(result.jobDir), "analyze jobDir created (native log artifacts land there)");
  rmSync(root, { recursive: true, force: true });
});

test("mdcontrol.analyze: omitted runId → most recent run by mtime (mdcontrol.list scan reuse)", async () => {
  const root = tmpProject();
  setupMission(root);
  const oldMs = Date.now() / 1000 - 500;
  const newMs = Date.now() / 1000;
  seedRunDir(root, "an-older-mission-driver", { mtimeMs: oldMs });
  const newest = seedRunDir(root, "an-newest-mission-driver", { mtimeMs: newMs });

  const fake = createFakeAgentsService({ script: ["<POSTMORTEM_FILE>x.md</POSTMORTEM_FILE>"] });
  const routes = makeRoutes(fake);
  const result = await routes["mdcontrol.analyze"]({ projectRoot: root });

  assert.equal(result.targetRunId, "an-newest-mission-driver");
  assert.equal(result.targetRunDir, newest);
  rmSync(root, { recursive: true, force: true });
});

test("mdcontrol.analyze: no runs / unknown runId → not-found wire errors (three target states)", async () => {
  const emptyRoot = tmpProject();
  const routes = makeRoutes(createFakeAgentsService({ script: [] }));
  await assert.rejects(
    () => routes["mdcontrol.analyze"]({ projectRoot: emptyRoot }),
    (err) => err instanceof MdControlError && err.code === "not-found" && /no runs found/.test(err.message),
  );
  rmSync(emptyRoot, { recursive: true, force: true });

  const root = tmpProject();
  setupMission(root);
  seedRunDir(root, "an-present-mission-driver");
  await assert.rejects(
    () => routes["mdcontrol.analyze"]({ projectRoot: root, runId: "never-ran" }),
    (err) => err instanceof MdControlError && err.code === "not-found" && /never-ran/.test(err.message),
  );
  await assert.rejects(
    () => routes["mdcontrol.analyze"]({ projectRoot: root, runId: 42 }),
    (err) => err instanceof MdControlError && err.code === "bad-request" && /runId/.test(err.message),
  );
  await assert.rejects(
    () => routes["mdcontrol.analyze"]({}),
    (err) => err instanceof MdControlError && err.code === "bad-request",
  );
  rmSync(root, { recursive: true, force: true });
});

test("mdcontrol.analyze: failed dispatch settles as a verbatim empty result (CLI parity), never a crash", async () => {
  const root = tmpProject();
  setupMission(root);
  seedRunDir(root, "an-failtarget-mission-driver");
  const fake = createFakeAgentsService({ script: [{ error: new Error("analyze turn exploded") }] });
  const routes = makeRoutes(fake);

  const result = await routes["mdcontrol.analyze"]({ projectRoot: root, runId: "an-failtarget-mission-driver" });
  assert.equal(result.text, "");
  assert.equal(result.postmortemFile, null);
  assert.equal(result.memoryUpdated, null);
  assert.equal(fake.state.disposed.length, 1, "adapter still disposes its executor on the failure path");
  rmSync(root, { recursive: true, force: true });
});

test("mdcontrol.analyze: missing agents service → explicit wire error (no silent fallback)", async () => {
  const root = tmpProject();
  setupMission(root);
  seedRunDir(root, "an-noagents-mission-driver");
  const routes = createMdControlRoutes({ ctx: {} });
  await assert.rejects(
    () => routes["mdcontrol.analyze"]({ projectRoot: root, runId: "an-noagents-mission-driver" }),
    (err) => err.message.includes("agents service unavailable"),
  );
  rmSync(root, { recursive: true, force: true });
});
