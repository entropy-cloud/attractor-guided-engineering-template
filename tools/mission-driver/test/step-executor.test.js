import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProcessExecutor } from "../src/step-executor.js";
import { FlowEngine } from "../src/engine.js";

// dsh-plugin M1-WI1 — StepExecutor seam contract tests.
// (a) ProcessExecutor forwards every parameter positionally per-arg.
// (b) Return objects pass through field-by-field (incl. promptFile/stderrTail).
// (c) Engine runs a minimal flow via delegates.executor with agent/tool step
//     results field-identical to the pre-change baseline (captured with the
//     git-stash method on 2026-08-23: same fixture run against the legacy
//     three-key delegates on the unmodified engine; expected values below are
//     that captured baseline).

function makeFakeRunner() {
  const calls = { agent: [], parse: [], tool: [] };
  const agentReturn = {
    text: "working...\n<R>pass</R>",
    logFile: "/tmp/fake-run/oc-START-123-abc.log",
    promptFile: "/tmp/fake-run/oc-START-123-abc.log.prompt",
    ok: true,
    sessionId: "ses_contract_1",
    exitCode: 0,
    errorTail: null,
    stderrTail: "some stderr noise",
  };
  const toolReturn = { ok: true, logFile: "/tmp/fake-run/tool-BUILD-456.log", exitCode: 0 };
  return {
    calls,
    async runAgent(stepName, prompt, system, sessionId, modelOverride, opts) {
      calls.agent.push({ stepName, prompt, system, sessionId, modelOverride, opts });
      return agentReturn;
    },
    async runParseAgent(stepName, prompt, system, sessionId) {
      calls.parse.push({ stepName, prompt, system, sessionId });
      return { text: "<R>pass</R>", ok: true, sessionId: "ses_contract_1" };
    },
    async runTool(stepName, command, opts) {
      calls.tool.push({ stepName, command, opts });
      return toolReturn;
    },
  };
}

describe("ProcessExecutor — (a) per-arg parameter forwarding to the runner", () => {
  it("executeAgent forwards all six arguments in order", async () => {
    const runner = makeFakeRunner();
    const ex = new ProcessExecutor(runner);
    const opts = { timeoutMs: 123000, resultTag: "R" };
    await ex.executeAgent("START", "the prompt", "the system", "ses_9", "model-x", opts);
    assert.equal(runner.calls.agent.length, 1);
    assert.deepEqual(runner.calls.agent[0], {
      stepName: "START", prompt: "the prompt", system: "the system",
      sessionId: "ses_9", modelOverride: "model-x", opts,
    });
  });

  it("executeAgent tolerates absent optional args (undefined modelOverride/opts)", async () => {
    const runner = makeFakeRunner();
    const ex = new ProcessExecutor(runner);
    await ex.executeAgent("A", "p", "s", null);
    assert.equal(runner.calls.agent[0].modelOverride, undefined);
    assert.equal(runner.calls.agent[0].opts, undefined);
  });

  it("executeParseAgent forwards all four arguments in order", async () => {
    const runner = makeFakeRunner();
    const ex = new ProcessExecutor(runner);
    await ex.executeParseAgent("parse-R", "infer the marker", "sys", "ses_8");
    assert.deepEqual(runner.calls.parse[0], {
      stepName: "parse-R", prompt: "infer the marker", system: "sys", sessionId: "ses_8",
    });
  });

  it("executeTool forwards (stepName, command, opts) in order", async () => {
    const runner = makeFakeRunner();
    const ex = new ProcessExecutor(runner);
    await ex.executeTool("BUILD", "pnpm build", { timeout: 77 });
    assert.deepEqual(runner.calls.tool[0], {
      stepName: "BUILD", command: "pnpm build", opts: { timeout: 77 },
    });
  });
});

describe("ProcessExecutor — (b) field-by-field result pass-through", () => {
  it("executeAgent returns the runner object untouched, incl. promptFile/stderrTail", async () => {
    const runner = makeFakeRunner();
    const ex = new ProcessExecutor(runner);
    const ret = await ex.executeAgent("S", "p", "s", null, undefined, undefined);
    assert.deepEqual(ret, {
      text: "working...\n<R>pass</R>",
      logFile: "/tmp/fake-run/oc-START-123-abc.log",
      promptFile: "/tmp/fake-run/oc-START-123-abc.log.prompt",
      ok: true,
      sessionId: "ses_contract_1",
      exitCode: 0,
      errorTail: null,
      stderrTail: "some stderr noise",
    });
    // Zero behavioral logic: the runner's return value is passed through by
    // reference, not cloned or normalized.
    const sentinel = { ok: true };
    const byRefRunner = { async runAgent() { return sentinel; }, async runParseAgent() { return sentinel; }, async runTool() { return sentinel; } };
    const byRefEx = new ProcessExecutor(byRefRunner);
    assert.equal(await byRefEx.executeAgent("S", "p", "s", null), sentinel);
    assert.equal(await byRefEx.executeTool("S", "c", {}), sentinel);
  });

  it("executeTool returns the runner result object by reference", async () => {
    const runner = makeFakeRunner();
    const ex = new ProcessExecutor(runner);
    const ret = await ex.executeTool("BUILD", "pnpm build", { timeout: 0 });
    assert.deepEqual(ret, { ok: true, logFile: "/tmp/fake-run/tool-BUILD-456.log", exitCode: 0 });
  });

  it("dry-run style mock runner forwards unchanged (mock semantics preserved)", async () => {
    const mockRunner = {
      async runAgent() { return { text: "mock", logFile: null, ok: true, sessionId: null }; },
      async runParseAgent() { return { text: "mock", logFile: null, ok: true, sessionId: null }; },
      async runTool() { return { ok: true, logFile: null }; },
    };
    const ex = new ProcessExecutor(mockRunner);
    assert.deepEqual(await ex.executeAgent("X", "p", "", null), { text: "mock", logFile: null, ok: true, sessionId: null });
    assert.deepEqual(await ex.executeTool("X", "echo", {}), { ok: true, logFile: null });
  });
});

describe("FlowEngine via delegates.executor — (c) minimal flow, field-identical to pre-change baseline", () => {
  // Baseline provenance: git-stash capture on 2026-08-23 — the identical
  // fixture/canned-results below were run through the PRE-change engine with
  // the legacy three-key delegates; the expected workflow/call shapes below
  // are that capture. The seam migration must reproduce them field-for-field.
  const flow = {
    name: "seam-contract", entry: "START", maxTotalSteps: 10, maxCycleVisits: 5,
    steps: {
      START: {
        type: "agent", prompt: "start work", resultTag: "R", timeoutMs: 123000,
        transitions: { pass: { goto: "BUILD" }, fail: { done: "failed" } },
      },
      BUILD: {
        type: "tool", command: "echo build-ok", timeout: 77,
        transitions: { pass: { goto: "FINAL" }, fail: { done: "failed" } },
      },
      FINAL: {
        type: "agent", prompt: "final step", resultTag: "R",
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } },
      },
    },
  };

  it("agent/tool step results and delegate call shapes match the captured baseline", async () => {
    const runner = makeFakeRunner();
    const delegates = {
      config: { moduleName: "contract", projectRoot: "/tmp/fake-root" },
      vars: {},
      logFile: null,
      executor: new ProcessExecutor(runner),
    };
    const engine = new FlowEngine(flow, delegates);
    const result = await engine.run();

    // Run-level outcome (baseline: status=completed, stepCount=3).
    assert.equal(result.status, "completed");
    assert.equal(result.stepCount, 3);
    assert.equal(engine.lastSessionId, "ses_contract_1");

    // Workflow step records (baseline capture, field-for-field).
    const wf = engine.workflow.steps.map((s) => ({
      name: s.name, status: s.status, logFile: s.logFile ?? null, sessionId: s.sessionId ?? null,
    }));
    assert.deepEqual(wf, [
      { name: "START", status: "completed", logFile: "oc-START-123-abc.log", sessionId: "ses_contract_1" },
      { name: "BUILD", status: "completed", logFile: null, sessionId: null },
      { name: "FINAL", status: "completed", logFile: "oc-START-123-abc.log", sessionId: "ses_contract_1" },
    ]);

    // Delegate call shapes seen by the runner (baseline capture).
    assert.deepEqual(
      runner.calls.agent.map((c) => ({ stepName: c.stepName, sessionId: c.sessionId ?? null, timeoutMs: c.opts?.timeoutMs ?? null })),
      [
        { stepName: "START", sessionId: null, timeoutMs: 123000 },
        { stepName: "FINAL", sessionId: null, timeoutMs: null },
      ],
    );
    assert.deepEqual(
      runner.calls.tool.map((c) => ({ stepName: c.stepName, command: c.command, timeout: c.opts?.timeout ?? null })),
      [{ stepName: "BUILD", command: "echo build-ok", timeout: 77 }],
    );
  });
});
