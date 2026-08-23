import assert from "node:assert/strict";

// dsh-plugin M1-WI1: engine delegates now carry a single `executor` key
// (StepExecutor seam) instead of the legacy runAgent/runTool/runParseAgent
// trio. makeMockDelegates builds a mock executor; tests may still pass the
// legacy override keys (runAgent/runParseAgent/runTool) or assign
// delegates.executor.execute* after creation — helpers translate the former
// onto the seam so call sites stay unchanged.
export function makeMockDelegates(overrides = {}) {
  const responses = overrides.responses || {};
  const callLog = [];

  const executor = {
    async executeAgent(stepName, prompt, system, sessionId) {
      callLog.push({ type: "agent", stepName, prompt, system, sessionId });
      if (stepName in responses) {
        const r = responses[stepName];
        if (typeof r === "function") return r(stepName, prompt);
        if (typeof r === "object" && r.text !== undefined) return r;
        return { text: String(r), ok: true };
      }
      return { text: "##MOCK_OK", ok: true };
    },

    async executeTool(stepName, command, opts) {
      callLog.push({ type: "tool", stepName, command, opts });
      if (stepName in responses) {
        const r = responses[stepName];
        if (typeof r === "function") return r(stepName, command);
        return { ok: !!r, logFile: null };
      }
      return { ok: true, logFile: null };
    },

    async executeParseAgent(stepName, prompt, system) {
      callLog.push({ type: "parse", stepName, prompt });
      return { text: "<MOCK_TAG>unknown</MOCK_TAG>", ok: true };
    },
  };

  // Legacy three-key overrides → seam methods (test-call-site convenience).
  if (overrides.runAgent) executor.executeAgent = overrides.runAgent;
  if (overrides.runTool) executor.executeTool = overrides.runTool;
  if (overrides.runParseAgent) executor.executeParseAgent = overrides.runParseAgent;

  const base = {
    config: { moduleName: "test-mod", shortName: "test-mod", packageFilter: "@nop-chaos/test-mod", projectRoot: "/tmp/test", retryBackoffBaseMs: 0 },
    vars: { module: "test-mod", shortName: "test-mod", packageFilter: "@nop-chaos/test-mod", projectRoot: "/tmp/test" },
    logFile: null,
    callLog,
    executor,
    loadSubFlow(name) {
      const sub = overrides.subFlows?.[name];
      if (sub) return sub;
      throw new Error(`Mock subflow not found: ${name}`);
    },
  };

  const { responses: _r, runAgent: _a, runTool: _t, runParseAgent: _p, subFlows: _s, ...rest } = overrides;
  return { ...base, ...rest };
}

export function simpleFlow(steps, entry = "START") {
  return { name: "test-flow", maxTotalSteps: 50, maxCycleVisits: 20, entry, steps };
}

export function mockSubFlows() {
  const planExec = {
    name: "plan-execution", entry: "EXECUTE", maxTotalSteps: 10,
    steps: {
      EXECUTE: {
        type: "agent", prompt: "execute {{PLAN_FILE}}",
        transitions: { pass: { goto: "CLOSURE_SCRIPT_CHECK" }, fail: { retry: "EXECUTE", maxRetries: 2 } },
        onMaxRetries: { goto: "CLOSURE_SCRIPT_CHECK" },
      },
      CLOSURE_SCRIPT_CHECK: {
        type: "agent", prompt: "script check {{PLAN_FILE}}",
        resultTag: "AI_STEP_RESULT",
        transitions: { pass: { goto: "BUILD_VERIFY" }, fail: { goto: "CLOSURE_AUDIT" } },
      },
      CLOSURE_AUDIT: {
        type: "agent", prompt: "closure audit",
        transitions: { approved: { goto: "BUILD_VERIFY" }, issues: { done: "completed" } },
      },
      BUILD_VERIFY: {
        type: "agent", prompt: "build verify",
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } },
      },
    },
  };
  const deepAudit = {
    name: "deep-audit-loop", entry: "CHECK_OPEN_AUDITS", maxTotalSteps: 20,
    steps: {
      CHECK_OPEN_AUDITS: {
        type: "agent", prompt: "check open audits",
        resultTag: "AI_STEP_RESULT",
        transitions: { ok: { goto: "DRAFT_FROM_AUDITS" }, empty: { done: "completed" } },
      },
      DRAFT_FROM_AUDITS: {
        type: "agent", prompt: "draft from audits",
        resultTag: "AI_STEP_RESULT",
        transitions: { created: { done: "completed" }, nothing: { done: "completed" } },
      },
    },
  };
  return { "plan-execution": planExec, "deep-audit-loop": deepAudit };
}
