import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FlowEngine } from "../src/engine.js";
import { makeMockDelegates, simpleFlow } from "./helpers.js";
import { mergeSubflowChildren } from "../src/monitor.js";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function withDir(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "subflow-iso-"));
    mkdirSync(dir, { recursive: true });
    try { await fn(dir); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  };
}

const childFlow = {
  name: "child", entry: "WORK", maxTotalSteps: 20, steps: {
    WORK: { type: "agent", prompt: "work", transitions: { done: { done: "completed" } } },
  },
};

describe("subflow state isolation — run-state.json not overwritten by child", () => {
  it("child writes to run-state-{subflowId}.json; parent keeps all top-level steps", withDir(async (runDir) => {
    const flow = simpleFlow({
      BEFORE: { type: "agent", prompt: "before", transitions: { ok: { goto: "SUB" } } },
      SUB: { type: "subflow", flow: "child", transitions: { complete: { goto: "AFTER" }, failed: { done: "failed" } } },
      AFTER: { type: "agent", prompt: "after", transitions: { ok: { done: "completed" } } },
    }, "BEFORE");

    const delegates = makeMockDelegates({
      responses: {
        BEFORE: { text: "<AI_STEP_RESULT>ok</AI_STEP_RESULT>", ok: true },
        WORK: { text: "<AI_STEP_RESULT>done</AI_STEP_RESULT>", ok: true },
        AFTER: { text: "<AI_STEP_RESULT>ok</AI_STEP_RESULT>", ok: true },
      },
      config: { projectRoot: runDir, runDir },
    });
    delegates.loadSubFlow = () => childFlow;

    const engine = new FlowEngine(flow, delegates);
    const result = await engine.run();
    assert.equal(result.status, "completed");

    const parent = JSON.parse(readFileSync(join(runDir, "run-state.json"), "utf8"));
    assert.equal(parent.steps.length, 3,
      "parent run-state.json must retain all 3 top-level steps (BEFORE, SUB, AFTER) — not overwritten by child _initWorkflow");
    const names = parent.steps.map(s => s.name);
    assert.deepEqual(names, ["BEFORE", "SUB", "AFTER"]);

    const subStep = parent.steps[1];
    assert.equal(subStep.type, "subflow", "SUB step record must carry type=subflow");
    assert.ok(Array.isArray(subStep.subflowRuns), "SUB step must carry subflowRuns");
    assert.equal(subStep.subflowRuns.length, 1);

    const subFile = subStep.subflowRuns[0].file;
    assert.ok(subFile && subFile.startsWith("run-state-"), `subflowRun.file should be a child state file, got: ${subFile}`);
    assert.ok(existsSync(join(runDir, subFile)), `child state file ${subFile} must exist on disk`);

    const childState = JSON.parse(readFileSync(join(runDir, subFile), "utf8"));
    assert.ok(childState.steps.length > 0, "child state must contain the WORK step");
    assert.equal(childState.steps[0].name, "WORK");
  }));

  it("forEach subflow: each item gets its own child state file", withDir(async (runDir) => {
    const flow = simpleFlow({
      SUB: {
        type: "subflow", flow: "child", forEach: "items",
        transitions: { all_complete: { done: "completed" }, some_failed: { done: "failed" }, all_failed: { done: "failed" } },
      },
    }, "SUB");

    const delegates = makeMockDelegates({
      responses: { WORK: { text: "<AI_STEP_RESULT>done</AI_STEP_RESULT>", ok: true } },
      config: { projectRoot: runDir, runDir },
    });
    delegates.vars.items = '["item-a","item-b"]';
    delegates.loadSubFlow = () => childFlow;

    const engine = new FlowEngine(flow, delegates);
    await engine.run();

    const parent = JSON.parse(readFileSync(join(runDir, "run-state.json"), "utf8"));
    const subStep = parent.steps[0];
    assert.equal(subStep.subflowRuns.length, 2, "2 forEach items → 2 subflowRuns");
    const files = subStep.subflowRuns.map(r => r.file);
    assert.notEqual(files[0], files[1], "each item must have a distinct child file");
    assert.equal(subStep.subflowRuns[0].forEachItem, "item-a");
    assert.equal(subStep.subflowRuns[1].forEachItem, "item-b");
    for (const f of files) {
      assert.ok(existsSync(join(runDir, f)), `child file ${f} must exist`);
    }
  }));
});

describe("monitor mergeSubflowChildren — attach child state to step.children", () => {
  it("merges child state files into step.children tree", () => {
    const runDir = mkdtempSync(join(tmpdir(), "merge-"));
    try {
      writeFileSync(join(runDir, "run-state.json"), JSON.stringify({
        missionName: "t", status: "running", currentStep: "X",
        steps: [
          { name: "A", status: "completed" },
          { name: "SUB", status: "completed", type: "subflow", subflowRuns: [
            { forEachIndex: 0, forEachItem: "p1.md", file: "run-state-SUB-1-0.json", status: "completed" },
          ] },
        ],
      }));
      writeFileSync(join(runDir, "run-state-SUB-1-0.json"), JSON.stringify({
        status: "completed", currentStep: null,
        steps: [
          { name: "EXECUTE", status: "completed", durationMs: 5000, sessionId: "ses_x" },
          { name: "BUILD_VERIFY", status: "completed", durationMs: 3000 },
        ],
      }));

      const state = JSON.parse(readFileSync(join(runDir, "run-state.json"), "utf8"));
      mergeSubflowChildren(runDir, state.steps);

      const subStep = state.steps[1];
      assert.ok(Array.isArray(subStep.children), "SUB step must have children after merge");
      assert.equal(subStep.children.length, 1);
      const child = subStep.children[0];
      assert.equal(child.forEachItem, "p1.md");
      assert.equal(child.status, "completed");
      assert.equal(child.steps.length, 2);
      assert.equal(child.steps[0].name, "EXECUTE");
      assert.equal(child.steps[0].sessionId, "ses_x", "child step sessionId should pass through");
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });

  it("gracefully handles missing child file (no crash, empty steps)", () => {
    const runDir = mkdtempSync(join(tmpdir(), "merge-miss-"));
    try {
      const steps = [
        { name: "SUB", type: "subflow", subflowRuns: [
          { forEachIndex: 0, forEachItem: null, file: "run-state-GONE.json", status: "completed" },
        ] },
      ];
      mergeSubflowChildren(runDir, steps);
      assert.equal(steps[0].children.length, 1);
      assert.deepEqual(steps[0].children[0].steps, []);
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });

  it("ignores non-subflow steps", () => {
    const steps = [{ name: "A", status: "completed" }];
    mergeSubflowChildren("/nonexistent", steps);
    assert.ok(!steps[0].children, "non-subflow step should not get children");
  });
});
