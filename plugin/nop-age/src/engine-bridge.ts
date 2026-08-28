/**
 * engine-bridge.ts — programmatic entry wrapping engine orchestration with
 * the execution-backend selection factory (dsh-plugin M2-WI7, plan
 * `2026-08-23-1447-2` Phase 2; `mdcontrol.*` routes + the detached start
 * primitive `beginNativeMission` land with M2-WI10, plan `2026-08-23-1621-2`;
 * the draft/analyze variants land with M3-WI12, plan `2026-08-23-1852-2`).
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
 *   cmdDraftMission(desc, { executor })         → two-stage brief→draft
 *                                                 pipeline (executor seam =
 *                                                 M3-WI12 pre-authorized
 *                                                 narrow engine diff)
 *   runPostmortem({ …, runner })                → Reflexion postmortem
 *                                                 (analyze dispatch seam:
 *                                                 plugin-owned thin runner
 *                                                 adapter, zero engine diff)
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AgentRegistry } from '@deepseek-ai/dsh-agent'
import {
  bootstrap as engineBootstrap,
  cmdDraftMission,
  orchestrateRun as engineOrchestrateRun,
  validateDraftDesc,
} from '../assets/src/orchestrator.js'
import { runPostmortem } from '../assets/src/postmortem.mjs'
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
 *
 * `agent` defaulting (M4-WI14): the engine's RUN path resolves
 * `args.agent || env.OPENCODE_AGENT || "build"` and never consults
 * `missions/base.json`'s agent (only the draft/analyze return points do —
 * engine behavior, zero diff there). For the native posture the project
 * level is the right knob (the same base.agent already feeds the plugin's
 * draft/analyze executor configs via `baseAgentConfigOf`), so when no
 * explicit arg/env names an agent, base.json's agent flows into the run
 * config — where NativeExecutor's create setup mounts it as the mission
 * child's preset. Explicit args/env keep precedence.
 */
export function bootstrapNativeConfig(
  projectRoot: string,
  args: Record<string, unknown> = {},
): EngineConfigHandle {
  const effectiveArgs: Record<string, unknown> = { ...args }
  if (effectiveArgs.agent === undefined && (process.env.OPENCODE_AGENT === undefined || process.env.OPENCODE_AGENT === '')) {
    const base = baseAgentConfigOf(projectRoot)
    if (base.agent !== undefined) effectiveArgs.agent = base.agent
  }
  const config = engineBootstrap({
    projectRoot,
    args: {
      ...effectiveArgs,
      dir: effectiveArgs.dir ?? projectRoot,
      driver: effectiveArgs.driver ?? 'native',
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

// ── Native draft start (async job contract) — M3-WI12 ───────────────────────

/** Terminal record of one detached native draft job (promise never rejects). */
export interface NativeDraftTerminal {
  /** Final draft-state.json status; 'unknown' when no state file landed. */
  status: string
  error: Error | null
  /** Final draft-state.json contents (best-effort read at settle time). */
  state: Record<string, unknown> | null
}

/** Product of beginNativeDraft: job identity + the hanging draft promise. */
export interface NativeDraftStart {
  jobId: string
  jobDir: string
  promise: Promise<NativeDraftTerminal>
}

export interface BeginNativeDraftArgs {
  ctx: HostContext
  projectRoot: string
  desc: string
  flowHint?: string
  targetFile?: string
  skipBrief?: boolean
  /** Stamp override for deterministic tests (jobId derives from it). */
  now?: () => Date
}

/** `draft-<YYYYMMDD-HHmmss-sss>-mission-draft` (engine startDraftJob vocabulary). */
function draftJobIdOf(now: () => Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const d = now()
  return `draft-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}-mission-draft`
}

function readJsonSafe(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Light base.json read for the draft/analyze executor configs (WI12 e2e
 * finding: a create without agentOptions fails every turn with "has no
 * provider/model" — M2-WI10 finding, same fix). Mirrors the engine's own
 * draft/analyze base read (loadBaseAndInjectEnv → model/agent fields)
 * WITHOUT the env side effects — the draft pipeline's resolveConfig still
 * performs the authoritative resolution inside the task.
 */
function baseAgentConfigOf(projectRoot: string): { model?: string; agent?: string } {
  const base = readJsonSafe(resolve(projectRoot, 'missions', 'base.json'))
  const model = typeof base?.model === 'string' && base.model !== '' ? base.model : undefined
  const agent = typeof base?.agent === 'string' && base.agent !== '' ? base.agent : undefined
  const out: { model?: string; agent?: string } = {}
  if (model !== undefined) out.model = model
  if (agent !== undefined) out.agent = agent
  return out
}

/**
 * Start one native two-stage draft WITHOUT waiting for its terminal state
 * (M3-WI12 Phase 1 Decision 2: in-host detached task × native executor × the
 * pre-authorized `cmdDraftMission` executor seam).
 *
 * jobDir + the initial `draft-state.json` mirror the engine's startDraftJob
 * vocabulary EXACTLY (jobId shape, `status: "running"`, `phase: "brief" |
 * "draft"`, flowHint/targetFile surfaced) — the monitor/CLI consumption face
 * is reused, not re-invented. The executor is created BEFORE the task exists
 * (missing agents service = plain exception, guard never occupied); the
 * task's runner adapter owns the single executor dispose (cmdDraftMission
 * calls runner.close() on every exit path — no second dispose site here).
 */
export async function beginNativeDraft(
  { ctx, projectRoot, desc, flowHint, targetFile, skipBrief, now = () => new Date() }: BeginNativeDraftArgs,
): Promise<NativeDraftStart> {
  const root = resolve(projectRoot)
  const jobId0 = draftJobIdOf(now)
  let jobId = jobId0
  let jobDir = resolve(root, '_tmp', jobId)
  // Same-instant double-submit guard (engine startDraftJob precedent).
  for (let guardCount = 0; existsSync(jobDir) && guardCount < 8; guardCount += 1) {
    jobId = `${jobId0.slice(0, -'-mission-draft'.length)}-${Math.random().toString(36).slice(2, 6)}-mission-draft`
    jobDir = resolve(root, '_tmp', jobId)
  }
  mkdirSync(jobDir, { recursive: true })
  writeFileSync(resolve(jobDir, 'draft-state.json'), JSON.stringify({
    jobId,
    status: 'running',
    startedAt: now().toISOString(),
    desc,
    phase: skipBrief === true ? 'draft' : 'brief',
    flowHint: flowHint || null,
    targetFile: targetFile || null,
  }, null, 2), 'utf8')

  const executor = await resolveExecutor({
    driver: 'native',
    ctx,
    config: { projectRoot: root, runDir: jobDir, ...baseAgentConfigOf(root) },
  })

  const promise = (async () => {
    try {
      await cmdDraftMission(desc, {
        dir: root,
        draftJobDir: jobDir,
        flowHint,
        targetFile,
        skipBrief,
        driver: 'native',
        allowNativeDriver: true,
        executor,
      })
      const state = readJsonSafe(resolve(jobDir, 'draft-state.json'))
      return { status: typeof state?.status === 'string' ? state.status : 'unknown', error: null, state }
    } catch (error) {
      const state = readJsonSafe(resolve(jobDir, 'draft-state.json'))
      return {
        status: typeof state?.status === 'string' ? state.status : 'unknown',
        error: error instanceof Error ? error : new Error(String(error)),
        state,
      }
    }
  })()
  return { jobId, jobDir, promise }
}

/**
 * Route-side fail-fast description validation — the ENGINE's own
 * validateDraftDesc (thin wrapper; single-sourced vocabulary). Running it
 * before the job starts keeps the engine's `process.exitCode = 1` validation
 * branch unreachable in-host and rejects junk descriptions as wire errors
 * before any jobDir exists.
 */
export function validateDraftDescription(desc: string, minDescLength?: number): { ok: boolean; reason?: string } {
  return validateDraftDesc(desc, minDescLength)
}

// ── Native analyze (synchronous single-turn job) — M3-WI12 ──────────────────

export interface RunNativeAnalyzeArgs {
  ctx: HostContext
  projectRoot: string
  targetRunDir: string
  targetRunId: string
  /** Stamp override for deterministic tests (jobDir derives from it). */
  now?: () => number
}

/** Route result of mdcontrol.analyze (runPostmortem product + job identity). */
export interface NativeAnalyzeResult {
  targetRunId: string
  targetRunDir: string
  /** Scratch dir for this analyze dispatch (engine CLI `_tmp/analyze-run-<ts>` vocabulary). */
  jobDir: string
  postmortemFile: string | null
  memoryUpdated: string | null
  text: string
}

/**
 * Run ONE Reflexion postmortem natively (M3-WI12 Phase 1 Decision 3 option
 * (a)): the engine's runPostmortem is called directly — the whole pipeline
 * (skeleton build, module detect, prompt resolve, return-tag parse) stays
 * engine-owned — over a plugin-owned thin runner adapter on a per-call
 * NativeExecutor. Lifecycle ownership (route-review N3): runPostmortem never
 * closes the runner, so this adapter's finally arm is the SINGLE dispose
 * site (no double-close surface; mirrors runNativeMission's finally form).
 */
export async function runNativeAnalyze(
  { ctx, projectRoot, targetRunDir, targetRunId, now = Date.now }: RunNativeAnalyzeArgs,
): Promise<NativeAnalyzeResult> {
  const root = resolve(projectRoot)
  let jobDir = resolve(root, '_tmp', `analyze-run-${now()}`)
  for (let guardCount = 0; existsSync(jobDir) && guardCount < 8; guardCount += 1) {
    jobDir = resolve(root, '_tmp', `analyze-run-${now()}-${Math.random().toString(36).slice(2, 6)}`)
  }
  mkdirSync(jobDir, { recursive: true })

  const executor = await resolveExecutor({
    driver: 'native',
    ctx,
    config: { projectRoot: root, runDir: jobDir, ...baseAgentConfigOf(root) },
  })
  try {
    const runner = {
      runAgent: (
        stepName: string,
        prompt: string,
        system: string,
        sessionId: string | null,
      ) => executor.executeAgent(stepName, prompt, system, sessionId, undefined, undefined),
    }
    const res = await runPostmortem({
      projectRoot: root,
      missionsDir: resolve(root, 'missions'),
      targetRunDir,
      targetRunId,
      runner,
      opts: {},
    })
    return {
      targetRunId,
      targetRunDir,
      jobDir,
      postmortemFile: res.postmortemFile,
      memoryUpdated: res.memoryUpdated,
      text: res.text,
    }
  } finally {
    await executor.dispose?.()
  }
}
