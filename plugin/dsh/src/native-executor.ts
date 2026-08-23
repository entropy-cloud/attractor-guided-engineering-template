/**
 * native-executor.ts — StepExecutor over the DSH host agents service,
 * interface placeholder only (dsh-plugin M2-WI6 Phase 3; implementation is
 * M2-WI7 plan `2026-08-23-1447-2`).
 *
 * The three capability methods mirror the named StepExecutor seam contract
 * in the engine (tools/mission-driver/src/step-executor.js JSDoc) 1:1 — the
 * same parameter-for-parameter shape ProcessExecutor forwards to the runner.
 * The engine consumes `delegates.executor` and cannot tell backends apart.
 *
 * Native dispatch chain (verified R1 §1 / packaging doc §Native Dispatch):
 *   agents.create(options) → agent.followup(message) → await agent.whenIdle()
 *   → final assistant text → { code: 0|1 synthesized } ; handle lives for the
 *   whole mission run (dispose() removes the session from the store);
 *   watchdog: agent.cancel(cause) first, dispose() as last resort.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Result of one agent/parse step (byte-compatible with the runner product). */
export interface StepAgentResult {
  text: string
  logFile: string | null
  promptFile: string | null
  ok: boolean
  sessionId: string | null
  exitCode: number | null
  errorTail: string | null
  stderrTail: string | null
}

/** Per-step options as the engine passes them (timeout / result tag / progress). */
export interface StepAgentOpts {
  timeoutMs?: number
  resultTag?: string
  onStepUpdate?: (payload: unknown) => void
}

/** Result of one tool (shell) step. */
export interface StepToolResult {
  ok: boolean
  logFile: string | null
}

/**
 * StepExecutor — native backend interface, method set identical to the
 * engine's JSDoc contract (step-executor.js):
 *
 * - executeAgent(stepName, prompt, system, sessionId, modelOverride, opts)
 *     one agent step over a host child agent
 * - executeParseAgent(stepName, prompt, system, sessionId)
 *     no-marker parse fallback + marker-correction retry
 * - executeTool(stepName, command, opts)
 *     one tool step (short-lived host-spawned OS process)
 */
export interface NativeExecutor {
  executeAgent(
    stepName: string,
    prompt: string,
    system: string,
    sessionId: string | null,
    modelOverride: string | undefined,
    opts: StepAgentOpts | undefined,
  ): Promise<StepAgentResult>
  executeParseAgent(
    stepName: string,
    prompt: string,
    system: string,
    sessionId: string | null,
  ): Promise<StepAgentResult>
  executeTool(
    stepName: string,
    command: string,
    opts: { timeout: number },
  ): Promise<StepToolResult>
}

/**
 * Factory placeholder — M2-WI7 implements `createNativeExecutor(ctx)`
 * resolving `ctx.get('agents')`. Kept unimplemented here on purpose: this
 * file pins the seam shape only.
 */
export type NativeExecutorFactory = (ctx: Context) => NativeExecutor
