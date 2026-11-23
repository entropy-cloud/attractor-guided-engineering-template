import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as pathResolve, dirname as pathDirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlowEngine } from "../src/engine.js";
import { makeMockDelegates, simpleFlow } from "./helpers.js";

// F1 (postmortem 2026-09-01-starter): a plan that is legally `status: held`
// awaiting a human decision must terminate its plan-execution subflow as
// `blocked` via the `held` marker — never ride the EXECUTE fail→retry loop,
// never re-run the closure verification battery, never touch closure steps.

const __dirname = pathDirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = pathResolve(__dirname, "..");

const loadFlow = (rel) =>
  JSON.parse(readFileSync(pathResolve(TOOL_ROOT, rel), "utf8"));

describe("F1 held marker — real plan-execution flow", () => {
  it("EXECUTE emitting `held` terminates the subflow as blocked; closure steps never run", async () => {
    const flow = loadFlow("flows/plan-execution.json");
    const delegates = makeMockDelegates({
      responses: { EXECUTE: "<AI_STEP_RESULT>held</AI_STEP_RESULT>" },
    });
    const engine = new FlowEngine(flow, delegates);
    const result = await engine.run();

    assert.equal(result.status, "blocked",
      "held must done:blocked instead of riding the fail retry geometry");
    const agentSteps = delegates.callLog
      .filter((c) => c.type === "agent")
      .map((c) => c.stepName);
    assert.deepEqual(agentSteps, ["EXECUTE"],
      `held plan must dispatch EXECUTE exactly once and skip the closure battery (got: ${agentSteps.join(", ")})`);
  });

  it("CLOSURE_AUDIT emitting `held` on a held plan also exits blocked (battery skipped)", async () => {
    const flow = loadFlow("flows/plan-execution.json");
    flow.entry = "CLOSURE_AUDIT";
    const delegates = makeMockDelegates({
      responses: { CLOSURE_AUDIT: "<AI_STEP_RESULT>held</AI_STEP_RESULT>" },
    });
    const engine = new FlowEngine(flow, delegates);
    const result = await engine.run();

    assert.equal(result.status, "blocked");
    assert.equal(
      delegates.callLog.filter((c) => c.stepName === "CLOSURE_AUDIT").length, 1,
    );
  });

  it("held consumes no fail retry budget — exactly one dispatch despite retry:3 configured", async () => {
    const flow = simpleFlow({
      EXEC: {
        type: "agent",
        prompt: "exec",
        resultTag: "R",
        transitions: {
          pass: { done: "completed" },
          fail: { retry: "EXEC", maxRetries: 3 },
          held: { done: "blocked" },
        },
      },
    }, "EXEC");
    const delegates = makeMockDelegates({ responses: { EXEC: "<R>held</R>" } });
    const engine = new FlowEngine(flow, delegates);
    const result = await engine.run();

    assert.equal(result.status, "blocked");
    assert.equal(delegates.callLog.filter((c) => c.stepName === "EXEC").length, 1,
      "held is a known transition — the retry budget must stay untouched");
  });
});

describe("F1 blocked counting — subflow forEach aggregation", () => {
  const stubSubflow = {
    name: "stub-plan-exec",
    entry: "STUB",
    maxTotalSteps: 10,
    steps: {
      STUB: {
        type: "agent",
        prompt: "run {{PLAN_FILE}}",
        resultTag: "AI_STEP_RESULT",
        transitions: {
          pass: { done: "completed" },
          held: { done: "blocked" },
        },
      },
    },
  };

  const makeEngine = (plans) => {
    const flow = loadFlow("flows/mission-driver.json");
    const delegates = makeMockDelegates({
      responses: {
        STUB: (_stepName, prompt) =>
          prompt.includes("plan-held")
            ? { text: "<AI_STEP_RESULT>held</AI_STEP_RESULT>", ok: true }
            : { text: "<AI_STEP_RESULT>pass</AI_STEP_RESULT>", ok: true },
      },
      expressionFuncs: {
        activePlans: () => plans,
        draftPlans: () => [],
        openAudits: () => [],
      },
      subFlows: { "plan-execution": stubSubflow },
    });
    return { flow, engine: new FlowEngine(flow, delegates), delegates };
  };

  it("mixed outcomes: 1 completed + 1 blocked → some_failed (blocked never counted completed)", async () => {
    const { flow, engine } = makeEngine(["plan-a.md", "plan-held.md"]);
    const result = await engine._executeSubflowStep("EXEC_PLANS", flow.steps.EXEC_PLANS);
    assert.equal(result.marker, "some_failed");
    assert.equal(result.subflowRuns.length, 2);
    assert.deepEqual(
      result.subflowRuns.map((r) => r.status).sort(),
      ["blocked", "completed"],
    );
  });

  it("all blocked → all_failed (not all_complete: blocked is not success)", async () => {
    const { flow, engine } = makeEngine(["plan-held-1.md", "plan-held-2.md"]);
    const result = await engine._executeSubflowStep("EXEC_PLANS", flow.steps.EXEC_PLANS);
    assert.equal(result.marker, "all_failed");
  });
});
