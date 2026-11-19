/**
 * step-executor.js — named StepExecutor seam (dsh-plugin M1-WI1).
 *
 * Formalizes the previously implicit duck-typed delegates contract
 * (runAgent / runParseAgent / runTool) that FlowEngine consumed. The engine
 * now reads a single `delegates.executor` object implementing the three
 * capability methods below; ProcessExecutor is the process-backend
 * implementation that forwards 1:1 to the existing runner (runner.js,
 * which composes executor.js spawn/heartbeat/watchdog/SIGTERM). Behavior is
 * byte-for-byte unchanged — every method is a pure positional forward.
 *
 * Backend replacement (M2 NativeExecutor) injects a different object with
 * the same three methods; no engine code changes.
 */

/**
 * StepExecutor — named interface (JSDoc; JS has no runtime interfaces).
 * A backend executor is a single replacement unit providing the three
 * process-level execution entry points the engine consumes.
 *
 * @typedef {Object} StepExecutor
 * @property {(stepName: string, prompt: string, system: string, sessionId: string|null, modelOverride: string|undefined, opts: { timeoutMs?: number, resultTag?: string, onStepUpdate?: Function }|undefined) => Promise<{text: string, logFile: string|null, promptFile: string|null, ok: boolean, sessionId: string|null, exitCode: number|null, errorTail: string|null, stderrTail: string|null}>} executeAgent
 *   Run one agent step via the backend driver process. Signature matches the
 *   legacy `delegates.runAgent` parameter-for-parameter.
 * @property {(stepName: string, prompt: string, system: string, sessionId: string|null) => Promise<{text: string, logFile: string|null, promptFile: string|null, ok: boolean, sessionId: string|null, exitCode: number|null, errorTail: string|null, stderrTail: string|null}>} executeParseAgent
 *   No-marker parse fallback + marker-correction retry, routed to the cheap
 *   parse model by the backend. Signature matches `delegates.runParseAgent`.
 * @property {(stepName: string, command: string, opts: { timeout: number }) => Promise<{ok: boolean, logFile: string|null}>} executeTool
 *   Run one tool (shell command) step. Signature matches `delegates.runTool`;
 *   result shape is whatever the underlying executor returns (passed through).
 */

/**
 * ProcessExecutor — the process backend: wraps one runner instance
 * (createRunner product, runner.js) and forwards each StepExecutor method
 * to the corresponding runner method with zero behavioral logic. Dry-run is
 * transparent here: the runner itself swaps in mock implementations, and the
 * forwarder passes them through unchanged.
 */
export class ProcessExecutor {
  /** @param {{ runAgent: Function, runParseAgent: Function, runTool: Function, close?: Function }} runner — a createRunner() product (runner.js). */
  constructor(runner) {
    this.runner = runner;
  }

  executeAgent(stepName, prompt, system, sessionId, modelOverride, opts) {
    return this.runner.runAgent(stepName, prompt, system, sessionId, modelOverride, opts);
  }

  executeParseAgent(stepName, prompt, system, sessionId) {
    return this.runner.runParseAgent(stepName, prompt, system, sessionId);
  }

  executeTool(stepName, command, opts) {
    return this.runner.runTool(stepName, command, opts);
  }
}
