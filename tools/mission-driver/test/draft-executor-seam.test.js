import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cmdDraftMission } from "../src/orchestrator.js";

// ── Executor injection seam (dsh-plugin M3-WI12, pre-authorized narrow diff)
//
// cmdDraftMission(desc, { executor }) consumes a StepExecutor (the WI1
// interface — orchestrateRun's injection form) instead of building the
// process runner. These cases pin the seam WITHOUT touching
// __setRunnerFactoryForTest: a missing factory override plus a passing
// executor proves the executor path is selected, and the untouched module
// factory means a CLI caller without `executor` keeps the createRunner path
// (already covered by draft-brief.test.js et al. via the factory seam).

function makeTmpProject() {
  const root = mkdtempSync(join(tmpdir(), "md-draft-exec-"));
  mkdirSync(join(root, "_tmp"), { recursive: true });
  mkdirSync(join(root, "missions"), { recursive: true });
  return root;
}

/** Fake StepExecutor: records executeAgent calls, returns canned results. */
function makeFakeExecutor(responses) {
  const calls = [];
  let disposed = 0;
  const executor = {
    async executeAgent(stepName, prompt, system, sessionId, modelOverride, opts) {
      calls.push({ stepName, prompt, system, sessionId, modelOverride, opts });
      const r = responses[stepName];
      const text = typeof r === "function" ? r(stepName, prompt) : r;
      return { text: text ?? "", logFile: null, promptFile: null, ok: true, sessionId: null, exitCode: 0, errorTail: null, stderrTail: null };
    },
    async executeParseAgent(stepName, prompt, system, sessionId) {
      return this.executeAgent(stepName, prompt, system, sessionId);
    },
    async executeTool() {
      return { ok: true, logFile: null };
    },
    async dispose() {
      disposed += 1;
    },
  };
  return { executor, calls, disposed: () => disposed };
}

describe("cmdDraftMission — executor injection seam (M3-WI12)", () => {
  it("routes brief+draft agent turns through the injected executor and disposes exactly once", async () => {
    const root = makeTmpProject();
    const jobDir = join(root, "_tmp", "draft-exec-mission-draft");
    try {
      const { executor, calls, disposed } = makeFakeExecutor({
        "mission-brief": "<BRIEF_FILE>docs/backlog/seam-brief.md</BRIEF_FILE>\n<BRIEF_GATE>pass</BRIEF_GATE>",
        "draft-mission": "<AI_STEP_RESULT>created</AI_STEP_RESULT>\n<MISSION_FILE></MISSION_FILE>",
      });

      await cmdDraftMission("build a cool thing", {
        dir: root,
        draftJobDir: jobDir,
        executor,
      });

      assert.equal(calls.length, 2, "brief + draft = 2 executeAgent calls");
      assert.equal(calls[0].stepName, "mission-brief");
      assert.equal(calls[1].stepName, "draft-mission");
      assert.equal(calls[0].system, "");
      assert.equal(calls[0].sessionId, null, "adapter maps the null sessionId the pipeline passes");
      assert.equal(calls[0].modelOverride, undefined, "no model override on the draft pipeline");
      assert.match(calls[1].prompt, /docs\/backlog\/seam-brief\.md/, "draft prompt has briefPath");
      assert.equal(disposed(), 1, "close() maps to executor.dispose() exactly once on the success path");

      const state = JSON.parse(readFileSync(join(jobDir, "draft-state.json"), "utf8"));
      assert.equal(state.status, "completed");
      assert.equal(state.phase, "completed");
      assert.equal(state.briefPath, "docs/backlog/seam-brief.md");
      assert.equal(state.briefGate, "pass");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("brief gate=blocked stops before draft; executor disposed once; state=blocked", async () => {
    const root = makeTmpProject();
    const jobDir = join(root, "_tmp", "draft-exec-blocked-mission-draft");
    try {
      const { executor, calls, disposed } = makeFakeExecutor({
        "mission-brief": "<BRIEF_GATE>blocked</BRIEF_GATE>\n<BRIEF_GATE_REASON>too thin</BRIEF_GATE_REASON>",
      });

      await cmdDraftMission("optimize", {
        dir: root,
        draftJobDir: jobDir,
        executor,
      });

      assert.equal(calls.length, 1, "gate blocked → no draft-mission dispatch");
      assert.equal(disposed(), 1, "dispose exactly once on the gate-blocked path");
      const state = JSON.parse(readFileSync(join(jobDir, "draft-state.json"), "utf8"));
      assert.equal(state.status, "blocked");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("brief dispatch failure (executor throws) rejects, writes failed state, disposes once", async () => {
    const root = makeTmpProject();
    const jobDir = join(root, "_tmp", "draft-exec-fail-mission-draft");
    try {
      const boom = { executor: null, calls: null, disposed: null };
      const calls = [];
      let disposed = 0;
      boom.executor = {
        async executeAgent(stepName) {
          calls.push(stepName);
          throw new Error("native dispatch exploded");
        },
        async dispose() { disposed += 1; },
      };

      await assert.rejects(
        () => cmdDraftMission("a real goal description", { dir: root, draftJobDir: jobDir, executor: boom.executor }),
        /native dispatch exploded/,
      );
      assert.equal(calls.length, 1);
      assert.equal(disposed, 1, "dispose exactly once on the failure path");
      const state = JSON.parse(readFileSync(join(jobDir, "draft-state.json"), "utf8"));
      assert.equal(state.status, "failed");
      assert.equal(state.phase, "brief");
      assert.match(state.error, /native dispatch exploded/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("executor without dispose() is accepted (close() degrades to a no-op)", async () => {
    const root = makeTmpProject();
    const jobDir = join(root, "_tmp", "draft-exec-nodispose-mission-draft");
    try {
      const calls = [];
      const executor = {
        async executeAgent(stepName) {
          calls.push(stepName);
          return { text: "<AI_STEP_RESULT>created</AI_STEP_RESULT>", ok: true };
        },
      };
      await cmdDraftMission("another real goal", {
        dir: root,
        draftJobDir: jobDir,
        skipBrief: true,
        executor,
      });
      assert.equal(calls.length, 1, "skipBrief → single draft dispatch");
      const state = JSON.parse(readFileSync(join(jobDir, "draft-state.json"), "utf8"));
      assert.equal(state.status, "completed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
