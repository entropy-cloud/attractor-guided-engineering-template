// dsh-plugin M1-WI4: embed-mode gating of FlowEngine.run() startup diagnostics.
// (a) cfg.embed === true → active-run registration, START sys-snapshot, and
//     orphan reaping are ALL skipped (spies via delegates.diagnosticHooks
//     assert call/no-call directly — no "called but found nothing" ambiguity);
//     the flow itself still runs to completion.
// (b) default (no embed) → registerActiveRun receives a payload containing
//     {runId, missionName} (subset assert — the real payload also carries
//     driverPid/projectRoot), sysMon receives a "START:"-prefixed label,
//     warnOrphans is called exactly once (regression). Supplementary disk
//     evidence from the REAL default path: registry file under the sandbox
//     HOME's ~/.mission-driver/active/ and a START line in runDir's
//     sys-snapshot.log.
// (c) embed + isSubflow child engine → unchanged vs status quo (subflow
//     engines already skip startup diagnostics; adding embed changes nothing).
//
// HOME isolation: ACTIVE_RUNS_DIR is an import-time constant
// (join(homedir(), ...)), so the sandbox must be in place BEFORE engine.js is
// first imported — hence the dynamic import after the env mutation. The
// diagnosticHooks seam exists precisely to avoid depending on this ordering
// for the spy assertions; the sandbox is only needed for the (b) disk
// evidence. Fixture configs MUST set runDir (engine derives runId from its
// basename) AND missionName (null missionName would take the existing skip
// guard and fake a green).
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { makeMockDelegates, simpleFlow } from "./helpers.js";

const SANDBOX_HOME = mkdtempSync(join(tmpdir(), "embed-gating-home-"));
process.env.HOME = SANDBOX_HOME;
process.env.USERPROFILE = SANDBOX_HOME;
process.on("exit", () => {
  try { rmSync(SANDBOX_HOME, { recursive: true, force: true }); } catch {}
});

const { FlowEngine } = await import("../src/engine.js");

function makeFlow() {
  return simpleFlow({
    START: {
      type: "agent",
      prompt: "step start",
      resultTag: "STATUS",
      transitions: { ok: { done: "completed" } },
    },
  });
}

function makeSpies() {
  const calls = { register: [], sysMon: [], warnOrphans: 0 };
  const hooks = {
    registerActiveRun: (payload) => calls.register.push(payload),
    sysMon: (label) => calls.sysMon.push(label),
    warnOrphans: () => { calls.warnOrphans += 1; },
  };
  return { calls, hooks };
}

async function runEngine({ embed, isSubflow, hooks, runDir } = {}) {
  const delegates = makeMockDelegates({ responses: { START: "<STATUS>ok</STATUS>" } });
  delegates.config = {
    ...delegates.config,
    runDir,
    missionName: "embed-demo",
    projectRoot: runDir,
  };
  if (embed === true) delegates.config.embed = true;
  if (isSubflow === true) delegates.config.isSubflow = true;
  if (hooks) delegates.diagnosticHooks = hooks;
  const engine = new FlowEngine(makeFlow(), delegates);
  const result = await engine.run();
  return result;
}

describe("FlowEngine embed gating — startup diagnostics", () => {
  let root;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "embed-gating-run-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("(a) embed: true → all three startup diagnostics skipped, flow completes", async () => {
    const { calls, hooks } = makeSpies();
    const result = await runEngine({ embed: true, hooks, runDir: root });
    assert.equal(result.status, "completed", "embed mode must not affect flow execution");
    assert.equal(calls.register.length, 0, "registerActiveRun must not be called");
    assert.equal(calls.sysMon.length, 0, "sysMon must not be called");
    assert.equal(calls.warnOrphans, 0, "warnOrphans must not be called");
  });

  it("(b) default → register/sysMon/warnOrphans all invoked with the real call shapes", async () => {
    const { calls, hooks } = makeSpies();
    const result = await runEngine({ hooks, runDir: root });
    assert.equal(result.status, "completed");
    const expectedRunId = basename(root);
    assert.equal(calls.register.length, 1, "registerActiveRun called exactly once");
    // Subset assert: the real payload also carries driverPid/process.pid and
    // projectRoot — not pinned field-by-field here.
    assert.equal(calls.register[0].runId, expectedRunId);
    assert.equal(calls.register[0].missionName, "embed-demo");
    assert.equal(calls.sysMon.length, 1, "sysMon called exactly once");
    assert.ok(calls.sysMon[0].startsWith("START:"), `label must be START-prefixed: ${calls.sysMon[0]}`);
    assert.equal(calls.warnOrphans, 1, "warnOrphans called exactly once");
  });

  it("(b-supplement) real default path leaves disk evidence (registry file + sys-snapshot START line)", async () => {
    const result = await runEngine({ runDir: root });
    assert.equal(result.status, "completed");
    const runId = basename(root);
    const activeDir = join(SANDBOX_HOME, ".mission-driver", "active");
    assert.ok(existsSync(activeDir), `sandbox active-run dir must exist: ${activeDir}`);
    const registryFiles = readdirSync(activeDir).filter((f) => f.startsWith(`${runId}-`));
    assert.ok(registryFiles.length >= 1, `registry entry for runId ${runId} must exist`);
    const record = JSON.parse(readFileSync(join(activeDir, registryFiles[0]), "utf8"));
    assert.equal(record.runId, runId);
    assert.equal(record.missionName, "embed-demo");
    assert.equal(record.driverPid, process.pid);
    const snapLog = join(root, "sys-snapshot.log");
    assert.ok(existsSync(snapLog), "sys-snapshot.log must exist in runDir");
    const labels = readFileSync(snapLog, "utf8")
      .split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l).label; } catch { return null; } });
    assert.ok(labels.some((l) => typeof l === "string" && l.startsWith("START:")),
      `a START-labelled snapshot line must exist, got: ${JSON.stringify(labels)}`);
  });

  it("(c) embed + isSubflow child engine → unchanged vs status quo (skipped either way)", async () => {
    const both = makeSpies();
    const r1 = await runEngine({ embed: true, isSubflow: true, hooks: both.hooks, runDir: root });
    assert.equal(r1.status, "completed");
    assert.equal(both.calls.register.length, 0);
    assert.equal(both.calls.sysMon.length, 0);
    assert.equal(both.calls.warnOrphans, 0);

    const subflowOnly = makeSpies();
    const r2 = await runEngine({ isSubflow: true, hooks: subflowOnly.hooks, runDir: root });
    assert.equal(r2.status, "completed");
    assert.equal(subflowOnly.calls.register.length, 0, "status quo: subflow engines already skip diagnostics");
    assert.equal(subflowOnly.calls.sysMon.length, 0);
    assert.equal(subflowOnly.calls.warnOrphans, 0);
  });
});
