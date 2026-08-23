/**
 * engine-bridge.ts — programmatic entry wrapping engine orchestration with
 * the execution-backend selection factory (dsh-plugin M2-WI7, plan
 * `2026-08-23-1447-2` Phase 2; `mdcontrol.*` routes + the detached start
 * primitive `beginNativeMission` land with M2-WI10, plan `2026-08-23-1621-2`).
 *
 * The engine already exposes the programmatic surface this bridge wraps —
 * `assets/src/orchestrator.js` (the committed bundle copy of
 * tools/mission-driver/src/orchestrator.js, the same entry the CLI shell
 * uses):
 *
 *   bootstrap({ projectRoot, args })            → config (dotenv + resolveConfig)
 *   orchestrateRun({ config, executor })        → drive FlowEngine with an
 *                                                 injected StepExecutor and
 *                                                 map the terminal status
 *                                                 through EXIT_MAP
 *
 * Backend selection factory (M1 plan 1 deferred item, collected here):
 *   driver === "native" → PER-RUN `new NativeExecutor({ agents, config })`
 *                         (handle lifetime = one run — never a cross-run
 *                         singleton; a missing agents service is an explicit
 *                         wire error, never a silent ProcessExecutor fallback)
 *   every other driver  → `new ProcessExecutor(createRunner(config))`
 *                         (bundle-internal runner; behavior identical to the
 *                         CLI). The engine core is backend-blind — zero
 *                         engine diff, zero `@deepseek-ai/*` import in
 *                         tools/mission-driver/src/ (red line preserved).
 *
 * Native config wiring: `allowNativeDriver: true` through resolveConfig (the
 * `native` driver value is host-only; the standalone CLI rejects it — M1-WI3)
 * + `embed: true` (FlowEngine.run() startup-diagnostics gate, M1-WI4) +
 * `driver: "native"` as the bridge default.
 *
 * The no-silent-fallback principle (plan Phase 2 Decision): when ctx.agents
 * is missing or native create fails, the error is surfaced explicitly to the
 * caller as a wire error. The degradation ladder (detached engine + `dsh`
 * headless CLI driver behind the same surface) is a separate explicit
 * decision, never triggered implicitly by an exception path.
 */
import type { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { bootstrap as engineBootstrap, orchestrateRun as engineOrchestrateRun } from '../assets/src/orchestrator.js'
import { createRunner } from '../assets/src/runner.js'
import { ProcessExecutor } from '../assets/src/step-executor.js'
import { createNativeExecutor, type NativeExecutor, type StepAgentResult, type StepToolResult } from './native-executor.ts'

/** Opaque resolved-config handle (engine resolveConfig product). */
export interface EngineConfigHandle {
  projectRoot: string
  missionName: string | null
  driver: string
  runDir?: string
  /** M1-WI4 embed gate — true inside the DSH host (skips startup diagnostics). */
  embed?: boolean
  [key: string]: unknown
}

/** Terminal mapping mirror of the engine's EXIT_MAP (src/exit-map.js). */
export interface EngineRunResult {
  exitCode: number
  status?: string
}

/** A selected StepExecutor backend plus its optional run-terminal release. */
export interface BackendExecutor {
  executeAgent(
    stepName: string,
    prompt: string,
    system: string,
    sessionId: string | null,
    modelOverride: string | undefined,
    opts: Parameters<NativeExecutor['executeAgent']>[5],
  ): Promise<StepAgentResult>
  executeParseAgent(
    stepName: string,
    prompt: string,
    system: string,
    sessionId: string | null,
  ): Promise<StepAgentResult>
  executeTool(stepName: string, command: string, opts: { timeout: number }): Promise<StepToolResult>
  /** Run-terminal release (NativeExecutor: disposes the agents handle). */
  dispose?(): Promise<void>
}

/** Host context surface the factory consumes (cordis `ctx.agents`). */
export interface HostContext {
  agents?: AgentRegistry
}

export interface ResolveExecutorArgs {
  driver: string | undefined
  ctx: HostContext
  config: Parameters<typeof createNativeExecutor>[1]
}

/**
 * Backend selection factory — the M1 plan 1 deferred mapping, landed here in
 * the plugin layer (engine core stays unaware). `driver === "native"` builds
 * a PER-RUN NativeExecutor (the handle's lifetime is one run — R1-A2);
 * anything else wraps the bundle-internal runner in ProcessExecutor.
 */
export async function resolveExecutor({ driver, ctx, config }: ResolveExecutorArgs): Promise<BackendExecutor> {
  if (driver === 'native') {
    // Throws an explicit wire error when ctx.agents is missing — no silent
    // ProcessExecutor fallback (plan Phase 2 Decision).
    return createNativeExecutor(ctx, config)
  }
  const runner = await createRunner(config)
  return new ProcessExecutor(runner)
}

/**
 * Native config bootstrap: engine bootstrap (loadDotenv → resolveConfig)
 * with `allowNativeDriver: true` (host-only `native` driver, M1-WI3),
 * `driver: "native"` as the default, and `embed: true` (M1-WI4 startup-
 * diagnostics gate consumed by FlowEngine.run()). CLI paths are untouched —
 * `main.js` never passes allowNativeDriver.
 */
export function bootstrapNativeConfig(
  projectRoot: string,
  args: Record<string, unknown> = {},
): EngineConfigHandle {
  const config = engineBootstrap({
    projectRoot,
    args: {
      ...args,
      dir: args.dir ?? projectRoot,
      driver: args.driver ?? 'native',
      allowNativeDriver: true,
    },
  }) as EngineConfigHandle
  config.embed = true
  return config
}

/**
 * Run one mission natively end-to-end: native config bootstrap → per-run
 * NativeExecutor → bundle orchestrateRun (which assigns
 * `config.onStepUpdate = engine._onAgentStepUpdate` internally before the
 * first step, so the executor's call-time callback resolution lands on the
 * live channel) → run-terminal dispose in finally (abort or normal exit
 * both release the agents handle exactly once).
 */
export async function runNativeMission(
  { ctx, projectRoot, args }: { ctx: HostContext; projectRoot: string; args?: Record<string, unknown> },
): Promise<EngineRunResult> {
  const config = bootstrapNativeConfig(projectRoot, args)
  const executor = await resolveExecutor({ driver: config.driver, ctx, config })
  try {
    const result = await engineOrchestrateRun({ config, executor })
    return { exitCode: result.exitCode ?? 1, status: result.status }
  } finally {
    await executor.dispose?.()
  }
}

// ── Detached (async job contract) start — M2-WI10 ───────────────────────────

/** Terminal record of one detached native run (promise never rejects). */
export interface NativeRunTerminal {
  exitCode: number
  status?: string
  error: Error | null
}

/** Product of beginNativeMission: identity + the hanging run promise. */
export interface NativeRunStart {
  runId: string
  runDir: string
  config: EngineConfigHandle
  /**
   * The engine loop as a detached in-host task (mdcontrol.run async
   * contract, packaging doc §Service Surface). NEVER awaited by the route —
   * resolves at terminal state, captures every rejection (the route's
   * terminal handler must always run: guard release + terminal record), and
   * owns the single run-terminal executor dispose in its finally arm
   * (identical to runNativeMission's — no second dispose site).
   */
  promise: Promise<NativeRunTerminal>
}

/**
 * Start one native mission WITHOUT waiting for its terminal state — the
 * engine orchestration entry is started as an un-awaited in-host promise
 * (detached HOST TASK, not an OS process; precedent: the engine's own
 * draft-job.mjs detached job + state file + monitor polling). Zero engine
 * diff: `orchestrateRun` itself is simply not awaited by this caller.
 *
 * Fail-fast posture (plan Phase 1): config bootstrap and executor selection
 * both happen BEFORE the task promise exists, so validation errors (unknown
 * mission, unsupported driver) and a missing agents service propagate to the
 * caller as plain exceptions — the route maps them to wire errors with the
 * guard never occupied.
 */
export async function beginNativeMission(
  { ctx, projectRoot, args }: { ctx: HostContext; projectRoot: string; args?: Record<string, unknown> },
): Promise<NativeRunStart> {
  const config = bootstrapNativeConfig(projectRoot, args)
  const executor = await resolveExecutor({ driver: config.driver, ctx, config })
  const runId = config.runDir ? String(config.runDir).split(/[\\/]/).filter(Boolean).pop() ?? '' : ''
  const promise = (async () => {
    try {
      const result = await engineOrchestrateRun({ config, executor })
      return { exitCode: result.exitCode ?? 1, status: result.status, error: null }
    } catch (error) {
      return { exitCode: 1, status: undefined, error: error instanceof Error ? error : new Error(String(error)) }
    } finally {
      await executor.dispose?.()
    }
  })()
  return { runId, runDir: String(config.runDir ?? ''), config, promise }
}
