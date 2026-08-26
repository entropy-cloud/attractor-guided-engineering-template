/**
 * native-executor.ts — StepExecutor over the DSH host agents service
 * (dsh-plugin M2-WI7, plan `2026-08-23-1447-2` Phase 1).
 *
 * Native dispatch chain (verified R1 §1 / packaging doc §Native Dispatch):
 *   agents.create(options) → agent.followup(createUserMessage(...)) →
 *   await agent.whenIdle() → final non-empty assistant text from
 *   agent.session.events → synthesized exit (completed turn with harvested
 *   text → code 0; abort/error → code 1 + errorTail).
 *
 * Descriptor registration (WI11): every create seeds one durable
 * `subagent/descriptor` session event (mode 'continuable', provider
 * 'mdcontrol', label `Mission: <mission>`), so the run child enumerates as a
 * healthy row instead of a 'corrupt' diagnostic; the seed persists with the
 * session log, so agents.resume() needs no re-seeding.
 *
 * Agent-preset composition (M4-WI14, plan `2026-08-23-2202-1`): every create
 * also passes a `setup` that mounts `meta.agentPreset` (the mission config
 * `agent` field) through the host preset roster when one is composed and the
 * id is on it — direct creates join no preset otherwise (host-loader fact,
 * plan Phase 1 D1 Refinement 1). Roster absent / id unknown → no-op; broken
 * preset → creation rolls back with the roster's explicit mount error.
 *
 * Handle lifecycle = the whole run (R1-A2): dispose() removes the session
 * from the store, so this executor is constructed PER RUN (engine-bridge
 * factory owns that boundary) and reuses one live handle across steps; the
 * bridge disposes at run terminal state / abort. A cold handle (followup
 * throws, e.g. host restart) is recovered via agents.resume({ resumeSessionId }).
 *
 * Callback contract mirrors runner.js 1:1 (plan Phase 1 Decision 1):
 *   - onStepUpdate is resolved at CALL time from opts ?? config — runner.js
 *     reads config.onStepUpdate on every runAgent call, and orchestrateRun
 *     assigns config.onStepUpdate only inside orchestrateRun (orchestrator.js
 *     `config.onStepUpdate = (payload) => engine._onAgentStepUpdate(payload)`),
 *     AFTER executor construction; a constructor-time capture would read
 *     undefined and silently kill the monitor live channel + subflow wrapping.
 *   - two-point callbacks: after writing run-dir files {stepName, logFile,
 *     promptFile}, then after create {stepName, sessionId} (runner.js onSpawn
 *     ordering: files first, session second).
 *   - runDir is read through the config reference at call time (single source).
 *
 * Watchdog (packaging doc §Behavioral differences): hard timeout source is the
 * engine-threaded opts.timeoutMs (engine.js packs stepDef.timeoutMs into
 * agentOpts); sequence cancel(cause) → limited grace → dispose(), mapped to a
 * ProcessExecutor-semantics failure (code 1 + errorTail, ok=false,
 * stderrTail=null — no subprocess stderr surface natively).
 *
 * model / parseModel are explicitly ignored (documented gap, packaging doc
 * §Behavioral differences — early phases do not map to DSH ModelSelectionRef),
 * EXCEPT the M3-WI26 three-field channel: config `nativeModelSelection`
 * { provider, model, reasoningEffort? } (the supervisor dispatch resolution
 * face, 02 §4.9) composes the create through agentOptions {provider, model}
 * PLUS the dsh-agent ModelSelection install (reasoningEffort included —
 * agentProvider/agentModel/reasoningEffort, the documented-gap fill; the
 * durable descriptor seed still mirrors provider/model only — the host
 * descriptor face carries no effort field).
 * `system` is accepted and ignored exactly like runner.js's realRun.
 *
 * executeTool is the plugin layer's OWN minimal spawn path (plan Phase 1
 * Decision 3): child_process spawn + timeout + exit code + output tail, ZERO
 * diagnostics — no sysSnapshot, no ~/.mission-driver/active/ touch. Reusing
 * the engine executor.js tool path was rejected: its heartbeat pair
 * (sysSnapshot + touchActiveRun, executor.js:352-363 design note) is
 * intentionally not embed-gated because "a native-mode embed host never
 * selects this backend" — running it inside the DSH host is exactly the
 * host-invasive behavior M1-WI4's embed gating exists to prevent.
 *
 * `createUserMessage` is imported from @deepseek-ai/dsh-llm, a declared peer
 * of both @deepseek-ai/dsh-agent and @deepseek-ai/dsh-session (same 0.1.1-rc.2
 * cohort) — the host always provides it alongside ctx.agents; no new direct
 * dependency is added to package.json.
 */
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import { AgentRegistry, installModelSelection, type AgentCancelCause, type AgentHandle, type AgentSetup } from '@deepseek-ai/dsh-agent'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { seedDescriptorTurn, snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { Context } from '@deepseek-ai/cordis'
import {
  assemble,
  commitToLedger,
  fsAssemblerIo,
  resolveAssemblyBlocks,
  type AssemblyBlock,
} from './efficiency/prompt-assembler.ts'

// ── Pinned seam shapes (from the M2-WI6 interface placeholder) ──────────────

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
  onStepUpdate?: (payload: StepUpdatePayload) => void
}

/** Live-update payload (engine `_onAgentStepUpdate` destructures these keys). */
export interface StepUpdatePayload {
  stepName: string
  logFile?: string
  promptFile?: string
  sessionId?: string
}

/** Result of one tool (shell) step — engine `_executeToolStep` reads ok/logFile. */
export interface StepToolResult {
  ok: boolean
  logFile: string | null
  exitCode?: number | null
  errorTail?: string | null
  stderrTail?: string | null
}

/**
 * StepExecutor — native backend interface, method set identical to the
 * engine's JSDoc contract (step-executor.js):
 *
 * - executeAgent(stepName, prompt, system, sessionId, modelOverride, opts)
 * - executeParseAgent(stepName, prompt, system, sessionId)
 * - executeTool(stepName, command, opts)
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

/** Engine resolved-config fields the native backend reads (call-time reads). */
export interface NativeExecutorConfig {
  projectRoot: string
  runDir?: string
  agent?: string
  /**
   * M3-WI26 three-field model selection (02 §4.9 dispatch resolution output):
   * when present it OVERRIDES the legacy provider/model resolution and rides
   * agents.create agentOptions {provider, model} + the dsh-agent
   * ModelSelection install (reasoningEffort included).
   */
  nativeModelSelection?: { provider: string; model: string; reasoningEffort?: string }
  /**
   * M4-WI33 (04 §3): the run's fixedPrefix face — when the run's agent
   * declares fixedPrefix blocks (policy `agents.<name>.fixedPrefix`, same
   * law-policy schema), every dispatch prompt composes through the
   * PromptAssembler: first step of the run child = FRESH (fixed prefix ++
   * dynamic), subsequent steps on the SAME continuable session = CONTINUE
   * (dynamic delta + changed-file resend; per-run in-memory ledger — a
   * resumed-after-crash session gets a full FRESH resend, the conservative
   * P2 posture). The engine-resolved prompt (already through the
   * promptsDir → missions/prompts/ → built-in chain) IS the dynamic block,
   * verbatim — the policy overlays the engine prompt, never replaces it
   * (04 §7). Absent/empty ⇒ the legacy prompt path, byte-identical.
   */
  assemblyPrefix?: { blocks: AssemblyBlock[]; embedStamp?: string } | undefined
  onStepUpdate?: (payload: StepUpdatePayload) => void
  [key: string]: unknown
}

/** Constructor form (plan Phase 1 Decision 1): per-run `{ agents, config }`. */
export interface NativeExecutorOptions {
  agents: AgentRegistry
  config: NativeExecutorConfig
  /** Grace window between watchdog cancel() and last-resort dispose(). */
  watchdogGraceMs?: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Mirrors executor.js BASE_TIMEOUT_MS: absent/invalid opts.timeoutMs falls
// back to the 60min default so legacy callers behave identically.
const BASE_TIMEOUT_MS = 60 * 60 * 1000
const DEFAULT_WATCHDOG_GRACE_MS = 10_000

function resolveTimeoutMs(opts: StepAgentOpts | undefined): number {
  const v = opts?.timeoutMs
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : BASE_TIMEOUT_MS
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function localDateTimeStr(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Run-dir log file name following the engine convention (`<label>-<ts>-<rand>.log`). */
function genLogFile(runDir: string | undefined, label: string): string | null {
  if (!runDir) return null
  const rand = Math.random().toString(36).slice(2, 8)
  return pathResolve(runDir, `${label}-${Date.now()}-${rand}.log`)
}

function genChildId(): SessionId {
  const rand = Math.random().toString(36).slice(2, 10)
  return `native-${Date.now().toString(36)}-${rand}` as SessionId
}

/** Descriptor label vocabulary: mission/run identification for enumeration. */
function descriptorLabel(config: NativeExecutorConfig): string {
  const missionName = configString(config, 'missionName')
  if (missionName) return `Mission: ${missionName}`
  const runId = config.runDir ? String(config.runDir).split(/[\\/]/).filter(Boolean).pop() : null
  return `Mission: ${runId ?? 'mission-driver'}`
}

/**
 * Durable subagent descriptor seed (WI11, sidebar precedent sidechat-routes
 * :161-174): a cold child without a `subagent/descriptor` event renders as a
 * 'corrupt' diagnostic row in the host's subagents enumeration. One durable
 * descriptor per run child — mode 'continuable' (the handle is reused across
 * steps and cold-resumable), provider 'mdcontrol' (plugin identity), label
 * `Mission: <mission>`, agentProvider/agentModel mirroring the create
 * agentOptions when a model was resolved. Staged through `seedDescriptorTurn`
 * so seq/lossless-JSON rules match the host's own seeding path.
 */
function descriptorSeedOf(
  childId: SessionId,
  config: NativeExecutorConfig,
  provider: string | undefined,
  model: string | undefined,
): readonly SessionEvent[] {
  const descriptor = snapshotSubagentDescriptor({
    mode: 'continuable',
    provider: 'mdcontrol',
    label: descriptorLabel(config),
    ...(provider !== undefined ? { agentProvider: provider } : {}),
    ...(model !== undefined ? { agentModel: model } : {}),
  })
  return seedDescriptorTurn(childId, undefined, descriptor)
}

/**
 * The preset-roster face this executor's create setup consumes (M4-WI14).
 * Structural subset of the host's AgentPresets service — resolved per call
 * via `agentCtx.get('agentPresets')` (the WI10 no-declared-inject finding:
 * service reads on a cordis context go through `ctx.get`).
 */
interface PresetRosterFace {
  list(): Promise<readonly { id: string }[]>
  mount(agentCtx: Context, id?: string): Promise<unknown>
}

/**
 * Agent-preset composition setup for freshly created mission children
 * (M4-WI14, plan 2202-1 Phase 1 D1 Refinement 1 + D2 route-injection leg 2).
 *
 * Host-loader fact (D1): `meta.agentPreset` is passive metadata — no host
 * code mounts it for direct `agents.create` calls; only a caller-supplied
 * `setup` composes the child (the subagent-tool path does it via
 * `composeFrom`). In an agent-plane deployment (roster composed, global
 * layer carrying no model-facing rows) a child that joins no preset reaches
 * the model with an empty tool registry — so this executor mounts the
 * mission's configured agent preset (`missions/base.json` `agent` field →
 * `meta.agentPreset`) itself:
 *
 *   - roster absent on the host composition → no-op (unit/e2e/L3 legs and
 *     host-plane tool deployments keep today's behavior exactly; the roster
 *     service itself logs its own "published without joining" advisory when
 *     composed, so the no-op path needs no duplicate warn here);
 *   - preset id not on the roster → no-op (an `agent` value left over from a
 *     non-DSH driver must not brick native runs — the roster's own unjoined
 *     advisory covers observability);
 *   - preset present → `mount(agentCtx, id)`; a broken composition rejects
 *     here and rolls the child creation back (fail-loud for real AGE
 *     deployments — the explicit wire error the caller needs).
 *
 * `agents.resume` needs no setup: the resumed session keeps the composition
 * it was created under (durable scope parentage).
 */
function presetSetupOf(config: NativeExecutorConfig): AgentSetup {
  return async (agentCtx: Context) => {
    const presetId = configString(config, 'agent')
    if (presetId === undefined) return
    let roster: PresetRosterFace | undefined
    try {
      roster = (typeof agentCtx.get === 'function' ? agentCtx.get('agentPresets') : undefined) as PresetRosterFace | undefined
    } catch {
      roster = undefined
    }
    if (roster === undefined || typeof roster.list !== 'function' || typeof roster.mount !== 'function') return
    let onRoster = false
    try {
      onRoster = (await roster.list()).some((preset) => preset && preset.id === presetId)
    } catch {
      return
    }
    if (!onRoster) return
    await roster.mount(agentCtx, presetId)
  }
}

function sleep(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(true), ms)
    t.unref?.()
  })
}

/**
 * Creation-only cancellation signal for `agents.create(options.signal)`
 * (plan Phase 1: signal = hard timeout derived from opts.timeoutMs). The
 * timer is unref'd and disposable so it never holds the host event loop.
 */
function makeTimeoutSignal(ms: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  timer.unref?.()
  return { signal: controller.signal, dispose: () => clearTimeout(timer) }
}

interface HarvestableEvent {
  type: string
  data?: {
    message?: {
      role?: string
      content?: Array<{ type: string; text?: string }>
    }
    interrupted?: boolean
  }
}

/**
 * Harvest the final non-empty assistant text from `agent.session.events`
 * (dsh-headless precedent: last non-empty assistant message). Walks from the
 * end, skips `interrupted` prefixes (a canceled turn's partial stream), and
 * joins the text blocks of the first complete non-empty assistant message.
 */
function harvestFinalAssistantText(agentEvents: readonly unknown[]): string | null {
  const events = agentEvents as readonly HarvestableEvent[]
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (!ev || ev.type !== 'assistant/message') continue
    if (ev.data?.interrupted) continue
    const message = ev.data?.message
    if (!message || message.role !== 'assistant') continue
    const text = (message.content ?? [])
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim()
    if (text) return text
  }
  return null
}

function appendSafe(file: string | null, text: string): void {
  if (!file) return
  try { appendFileSync(file, text) } catch { /* best-effort artifact write */ }
}

/** Read a non-empty string field off the engine config (call-time read). */
function configString(config: NativeExecutorConfig, key: string): string | undefined {
  const value = (config as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

// ── NativeExecutor implementation ───────────────────────────────────────────

/**
 * DshNativeExecutor — the native StepExecutor backend. Constructed PER RUN
 * (never a cross-run singleton: the handle's lifetime is one run, R1-A2);
 * the engine-bridge factory `createNativeExecutor` / `resolveExecutor` owns
 * that boundary and the terminal dispose().
 */
export class DshNativeExecutor implements NativeExecutor {
  private readonly agents: AgentRegistry
  private readonly config: NativeExecutorConfig
  private readonly watchdogGraceMs: number
  private handle: AgentHandle | null = null
  private disposed = false
  /** M4-WI33: the run child's prompt-assembly ledger (04 §3.3) — per-run memory. */
  private readonly assemblyLedger = new Map<string, string>()
  private assemblyStarted = false

  constructor({ agents, config, watchdogGraceMs = DEFAULT_WATCHDOG_GRACE_MS }: NativeExecutorOptions) {
    if (!agents || typeof agents.create !== 'function' || typeof agents.resume !== 'function') {
      throw new Error(
        '[mdcontrol/native] DSH agents service unavailable on ctx — NativeExecutor requires ctx.agents { create, resume } (wire error; no silent ProcessExecutor fallback)',
      )
    }
    this.agents = agents
    this.config = config
    this.watchdogGraceMs = watchdogGraceMs
  }

  executeAgent(
    stepName: string,
    prompt: string,
    _system: string,
    sessionId: string | null,
    _modelOverride: string | undefined,
    opts: StepAgentOpts | undefined,
  ): Promise<StepAgentResult> {
    return this._runAgentTurn(stepName, prompt, sessionId, opts)
  }

  executeParseAgent(
    stepName: string,
    prompt: string,
    _system: string,
    sessionId: string | null,
  ): Promise<StepAgentResult> {
    // Same chain as executeAgent (runner.js runParseAgent = realRun with the
    // parse model). Native mode ignores BOTH model and parseModel (documented
    // gap, packaging doc §Behavioral differences) — the distinction collapses
    // to the same dispatch. No opts from the engine → watchdog default 60min,
    // config-level onStepUpdate fallback (exactly runner.js behavior).
    return this._runAgentTurn(stepName, prompt, sessionId, undefined)
  }

  executeTool(
    stepName: string,
    command: string,
    opts: { timeout: number } | undefined,
  ): Promise<StepToolResult> {
    return runNativeTool(this.config, stepName, command, opts)
  }

  /**
   * Run-terminal release. Idempotent (double-release guarded) — the bridge
   * calls this in a finally block after orchestrateRun settles, and a stray
   * second call (abort + normal teardown) must not re-enter dispose().
   */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    const handle = this.handle
    this.handle = null
    if (handle) {
      try { await handle.dispose() } catch { /* last-resort cleanup is best-effort */ }
    }
  }

  /** Whether the run-terminal dispose() has already run. */
  get isDisposed(): boolean {
    return this.disposed
  }

  /**
   * Ensure a live handle: reuse the run-scoped handle; when cold, prefer
   * agents.resume({ resumeSessionId }) (persisted-session continuity), falling
   * back to a fresh create when resume is impossible (e.g. the session was
   * removed from the store by a watchdog dispose).
   *
   * agentOptions { provider, model } follow the sdk-jsonrpc-server /
   * dsh-headless precedents (both pass them on create for no-preset-roster
   * compositions whose model-facing rows sit in the host plane — the L4 e2e
   * discovered a create without them fails every turn with "has no
   * provider/model"). Provider defaults to 'deepseek-official' (the official
   * auto-route); model prefers the engine config value (mission `model`
   * passthrough), then DSH_MODEL. The parseModel distinction stays ignored
   * (documented gap — one model for every dispatch).
   */
  private async _ensureHandle(sessionIdParam: string | null): Promise<AgentHandle> {
    if (this.handle) return this.handle
    if (this.disposed) throw new Error('[mdcontrol/native] executor already disposed (run terminal)')
    const resumeId = typeof sessionIdParam === 'string' && sessionIdParam.length > 0 ? sessionIdParam : null
    if (resumeId) {
      try {
        this.handle = await this.agents.resume({ resumeSessionId: resumeId as SessionId })
        return this.handle
      } catch {
        // Session no longer resumable (disposed watchdog session, host store
        // rotation) — fall through to a fresh create.
      }
    }
    // M3-WI26 three-field channel: a policy-resolved selection (02 §4.9)
    // overrides the legacy provider/model resolution and installs the full
    // ModelSelection face (reasoningEffort rides the agent-scoped install,
    // not agentOptions — the create options carry provider/model only).
    const selection = this.config.nativeModelSelection
    const provider = selection?.provider ?? configString(this.config, 'nativeProvider') ?? process.env.DSH_PROVIDER ?? 'deepseek-official'
    const model = selection?.model
      ?? configString(this.config, 'nativeModel')
      ?? configString(this.config, 'model')
      ?? (process.env.DSH_MODEL && process.env.DSH_MODEL !== '' ? process.env.DSH_MODEL : undefined)
    const childId = genChildId()
    const seed = descriptorSeedOf(childId, this.config, model === undefined ? undefined : provider, model)
    const setups: AgentSetup[] = [presetSetupOf(this.config)]
    if (selection !== undefined && selection.provider !== '' && selection.model !== '') {
      // reasoningEffort arrives pre-validated (law-policy REASONING_EFFORTS
      // vocabulary, 02 §4.9); the constructor only brands it.
      const selected = {
        provider: selection.provider,
        model: selection.model,
        ...(selection.reasoningEffort !== undefined ? { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) } : {}),
      }
      setups.push((agentCtx: Context) => {
        installModelSelection(agentCtx, { current: selected, assembled: undefined })
      })
    }
    const setup: AgentSetup = setups.length === 1 ? setups[0]! : async (agentCtx: Context) => {
      for (const s of setups) await s(agentCtx)
    }
    if (model === undefined) {
      // No model resolution anywhere: create WITHOUT agentOptions and let the
      // host's agent/request waterfall speak (unit fakes never read it). The
      // durable descriptor seed is still injected (enumeration health does
      // not depend on model resolution).
      this.handle = await this.agents.create({
        sessionId: childId,
        meta: {
          cwd: this.config.projectRoot,
          origin: 'subagent',
          delegationDepth: 1,
          agentPreset: this.config.agent,
          seedLength: seed.length,
        },
        seed,
        setup,
      })
      return this.handle
    }
    this.handle = await this.agents.create({
      sessionId: childId,
      meta: {
        cwd: this.config.projectRoot,
        origin: 'subagent',
        delegationDepth: 1,
        agentPreset: this.config.agent,
        seedLength: seed.length,
      },
      agentOptions: { provider, model },
      seed,
      setup,
    })
    return this.handle
  }

  /**
   * M4-WI33 (04 §3): compose the dispatch prompt through the
   * PromptAssembler when `config.assemblyPrefix` declares fixedPrefix
   * blocks — fixed prefix first, the engine prompt (marker included) as
   * the dynamic suffix (04 §3.2 prefix discipline). First dispatch on the
   * run child = FRESH; every later step on the same continuable session =
   * CONTINUE (delta + changed files; per-run ledger). Without the
   * declaration the engine prompt passes through byte-identical (the
   * promptsDir resolution chain untouched — policy overlays, never
   * replaces, 04 §7).
   */
  private _assemblePrompt(markedPrompt: string): string {
    const prefix = this.config.assemblyPrefix
    if (prefix === undefined || !Array.isArray(prefix.blocks) || prefix.blocks.length === 0) {
      return markedPrompt
    }
    const mode = this.assemblyStarted ? 'CONTINUE' : 'FRESH'
    const out = assemble(
      mode,
      {
        blocks: resolveAssemblyBlocks(prefix.blocks, { projectRoot: this.config.projectRoot }),
        ...(prefix.embedStamp !== undefined && prefix.embedStamp !== '' ? { embedStamp: prefix.embedStamp } : {}),
      },
      { text: markedPrompt },
      this.assemblyLedger,
      fsAssemblerIo,
    )
    commitToLedger(this.assemblyLedger, out)
    this.assemblyStarted = true
    return out.text
  }

  private async _runAgentTurn(
    stepName: string,
    prompt: string,
    sessionIdParam: string | null,
    opts: StepAgentOpts | undefined,
  ): Promise<StepAgentResult> {
    const config = this.config
    // Call-time resolution, verbatim runner.js form (opts over config; both
    // may be absent → no callbacks). A constructor-time capture of
    // config.onStepUpdate would read undefined (orchestrateRun assigns it
    // after executor construction) and silently kill the live channel.
    const onStepUpdate = typeof opts?.onStepUpdate === 'function'
      ? opts.onStepUpdate
      : (typeof config.onStepUpdate === 'function' ? config.onStepUpdate : null)

    // Boundary prefix: run-dir identifiability only in native mode (the
    // orphan reaper matches OS cmdlines; native child agents have none).
    const runId = config.runDir ? String(config.runDir).split(/[\\/]/).filter(Boolean).pop() : null
    const markedPrompt = this._assemblePrompt(`${runId ? `[MISSION_DRIVER:${runId}]` : '[MISSION_DRIVER]'} ${prompt}`)

    const logFile = genLogFile(config.runDir, `native-${stepName}`)
    const promptFile = logFile ? `${logFile}.prompt` : null
    if (logFile) {
      try { mkdirSync(config.runDir as string, { recursive: true }) } catch { /* runDir is engine-created */ }
    }
    if (promptFile) {
      try { writeFileSync(promptFile, markedPrompt, 'utf8') } catch { /* best-effort artifact */ }
    }
    if (logFile) {
      try {
        writeFileSync(logFile, [
          `# backend: native (dsh agents service)`,
          `# step: ${stepName}`,
          `# started: ${localDateTimeStr()}`,
          ``,
        ].join('\n') + '\n', 'utf8')
      } catch { /* best-effort artifact */ }
    }

    const effectiveTimeoutMs = resolveTimeoutMs(opts)
    let handle: AgentHandle
    try {
      handle = await this._ensureHandle(sessionIdParam)
    } catch (err) {
      const errorTail = `[NATIVE] agents create/resume failed for step ${stepName}: ${(err as Error).message}`
      appendSafe(logFile, `${errorTail}\n`)
      return this._failure(stepName, logFile, promptFile, errorTail)
    }
    const agent = handle.agent
    const childId = String(agent.id)

    // Two-point callbacks, runner.js onSpawn ordering: files first, then session.
    if (onStepUpdate && logFile) onStepUpdate({ stepName, logFile, promptFile: promptFile ?? undefined })
    if (onStepUpdate) onStepUpdate({ stepName, sessionId: childId })

    const timeoutSignal = makeTimeoutSignal(effectiveTimeoutMs)
    try {
      // Dispatch, with cold-handle recovery via resume (R1 §1: only resume()
      // can recover a persisted session after the handle went cold).
      try {
        agent.followup(createUserMessage({
          content: [{ type: 'text', text: markedPrompt }],
          source: { kind: 'user' },
        }))
      } catch (followupErr) {
        this.handle = null
        try {
          const resumed = await this.agents.resume({ resumeSessionId: agent.id })
          this.handle = handle = resumed
          resumed.agent.followup(createUserMessage({
            content: [{ type: 'text', text: markedPrompt }],
            source: { kind: 'user' },
          }))
          appendSafe(logFile, `# note: handle went cold, resumed session ${String(resumed.agent.id)}\n`)
        } catch (resumeErr) {
          const errorTail = `[NATIVE] dispatch failed for step ${stepName}: followup: ${(followupErr as Error).message}; resume: ${(resumeErr as Error).message}`
          appendSafe(logFile, `${errorTail}\n`)
          return this._failure(stepName, logFile, promptFile, errorTail, childId)
        }
      }

      // Watchdog race: whenIdle() vs the engine-threaded hard timeout. A
      // rejected whenIdle() (agent-side error) resolves as a step failure,
      // never a thrown error — ProcessExecutor parity: the executor always
      // settles with a result object so engine transient-fault classification
      // can read errorTail.
      let winner: 'idle' | 'timeout'
      try {
        winner = await Promise.race([
          Promise.resolve(handle.agent.whenIdle()).then(() => 'idle' as const),
          sleep(effectiveTimeoutMs).then(() => 'timeout' as const),
        ])
      } catch (err) {
        const errorTail = `[NATIVE] step ${stepName}: whenIdle() rejected: ${(err as Error).message}`
        appendSafe(logFile, `${errorTail}\n`)
        return this._failure(stepName, logFile, promptFile, errorTail, childId)
      }
      if (winner === 'timeout') {
        const cause: AgentCancelCause = { kind: 'hook', reason: `mission-driver: hard step timeout after ${Math.round(effectiveTimeoutMs / 1000)}s (watchdog)` }
        try { handle.agent.cancel(cause) } catch { /* graceful cancel is best-effort */ }
        // Limited grace for the cancel to converge; dispose only as last resort.
        const converged = await Promise.race([
          Promise.resolve(handle.agent.whenIdle()).then(() => true),
          sleep(this.watchdogGraceMs).then(() => false),
        ])
        if (!converged) {
          this.handle = null
          try { await handle.dispose() } catch { /* best-effort */ }
        }
        const errorTail = `[TIMEOUT] native step ${stepName} aborted after ${Math.round(effectiveTimeoutMs / 1000)}s (cancel → ${converged ? 'converged' : 'dispose'}; no partial-output grace)`
        appendSafe(logFile, `${errorTail}\n`)
        return this._failure(stepName, logFile, promptFile, errorTail, childId)
      }

      const text = harvestFinalAssistantText(handle.agent.session?.events ?? [])
      if (text === null) {
        const errorTail = `[NATIVE] step ${stepName}: turn reached quiescence with no non-empty assistant message (session ${childId})`
        appendSafe(logFile, `${errorTail}\n`)
        return this._failure(stepName, logFile, promptFile, errorTail, childId)
      }

      const events = (handle.agent.session?.events ?? []) as readonly { type?: string }[]
      const summary = [
        `# finished: ${localDateTimeStr()}`,
        `# session: ${childId}`,
        `# round summary: ${events.length} session events`,
        ``,
      ].join('\n')
      appendSafe(logFile, `${summary}\n${text}\n`)
      return {
        text,
        logFile,
        promptFile,
        ok: true,
        sessionId: childId,
        exitCode: 0,
        errorTail: null,
        stderrTail: null,
      }
    } finally {
      timeoutSignal.dispose()
    }
  }

  private _failure(
    stepName: string,
    logFile: string | null,
    promptFile: string | null,
    errorTail: string,
    sessionId?: string,
  ): StepAgentResult {
    return {
      text: '',
      logFile,
      promptFile,
      ok: false,
      sessionId: sessionId ?? null,
      exitCode: 1,
      errorTail,
      stderrTail: null,
    }
  }
}

// ── Plugin-layer minimal tool spawn (plan Phase 1 Decision 3) ───────────────

const TOOL_STDERR_TAIL_LINES = 10
const TOOL_STDERR_TAIL_CHARS = 800

function tailText(text: string, maxLines: number, maxChars: number): string {
  const lines = text.split(/\r?\n/).filter(Boolean)
  return lines.slice(-maxLines).join('\n').slice(-maxChars)
}

/**
 * Minimal spawn path for tool steps in native mode: child_process spawn with
 * cwd from config, exit-code/ok mapping, output written to a run-dir log
 * file, stderr tail captured for errorTail. ZERO diagnostics — no
 * sysSnapshot, no touchActiveRun, no events.jsonl heartbeat (those live on
 * the ProcessExecutor path which native mode never selects; sharing them
 * would re-open the M1 plan 1 deferred item 2 embed-gating question).
 *
 * `opts.timeout` is consumed as milliseconds when positive-finite (the plan
 * pins the residual drift risk — process-path runTool currently drops it —
 * onto the 1447-3 L2 matrix).
 */
export function runNativeTool(
  config: NativeExecutorConfig,
  stepName: string,
  command: string,
  opts: { timeout?: number } | undefined,
): Promise<StepToolResult> {
  const runDir = config.runDir
  const logFile = genLogFile(runDir, stepName)
  const cwd = config.projectRoot || undefined
  const parts = String(command).split(' ').filter(Boolean)
  const cmd = parts[0]
  const timeoutMs = Number.isFinite(opts?.timeout) && (opts?.timeout as number) > 0
    ? (opts?.timeout as number)
    : 0

  const failResolve = (exitCode: number, errorTail: string, stderrTail: string | null): StepToolResult => ({
    ok: false, logFile, exitCode, errorTail, stderrTail,
  })

  if (!cmd) {
    return Promise.resolve(failResolve(-1, '[NATIVE] empty tool command', null))
  }
  if (logFile) {
    try {
      writeFileSync(logFile, [
        `# backend: native minimal spawn`,
        `# cmd: ${command}`,
        `# cwd: ${cwd ?? '(inherited)'}`,
        `# started: ${localDateTimeStr()}`,
        ``,
      ].join('\n') + '\n', 'utf8')
    } catch { /* best-effort artifact */ }
  }

  return new Promise((resolveFn) => {
    let child
    try {
      child = spawn(cmd, parts.slice(1), {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CLICOLOR: '0' },
      })
    } catch (err) {
      resolveFn(failResolve(-1, `[SPAWN_ERROR] ${(err as Error).message}`, null))
      return
    }

    let stdoutBuf = ''
    let stderrBuf = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8')
      if (stdoutBuf.length > 64 * 1024) stdoutBuf = stdoutBuf.slice(-64 * 1024)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8')
      if (stderrBuf.length > 64 * 1024) stderrBuf = stderrBuf.slice(-64 * 1024)
    })
    child.stdout?.on('error', () => {})
    child.stderr?.on('error', () => {})

    let timedOut = false
    let killTimer: ReturnType<typeof setTimeout> | null = null
    if (timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true
        try { child.kill() } catch { /* already gone */ }
      }, timeoutMs)
      killTimer.unref?.()
    }

    child.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer)
      appendSafe(logFile, stdoutBuf + (stderrBuf ? `\n[stderr]\n${stderrBuf}` : '') + '\n')
      const ok = code === 0 && !timedOut
      const stderrTail = tailText(stderrBuf, TOOL_STDERR_TAIL_LINES, TOOL_STDERR_TAIL_CHARS)
      const errorTail = timedOut
        ? `[TIMEOUT] native tool ${stepName} killed after ${Math.round(timeoutMs / 1000)}s`
        : (code !== 0 ? `[exit=${code ?? -1}] ${stderrTail || '(no stderr captured)'}` : null)
      resolveFn({
        ok,
        logFile,
        exitCode: timedOut ? 1 : (code ?? -1),
        errorTail,
        stderrTail: stderrTail || null,
      })
    })
    child.on('error', (err) => {
      if (killTimer) clearTimeout(killTimer)
      resolveFn(failResolve(-1, `[SPAWN_ERROR] ${err.message}`, tailText(stderrBuf, TOOL_STDERR_TAIL_LINES, TOOL_STDERR_TAIL_CHARS) || null))
    })
  })
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Resolve the DSH agents service from a host context. On a REAL cordis
 * context, reading a service property the plugin never declared in `inject`
 * throws ("cannot get property … without inject"), while `ctx.get(name)`
 * returns undefined — the documented safe accessor. Plain-object host
 * contexts (unit fakes) have no `get` and read the property directly.
 */
export function resolveAgentsService(ctx: { get?(name: string): unknown } | { agents?: unknown }): unknown {
  const maybeGet = (ctx as { get?(name: string): unknown }).get
  if (typeof maybeGet === 'function') {
    return maybeGet.call(ctx, 'agents') ?? (ctx as { agents?: unknown }).agents
  }
  return (ctx as { agents?: unknown }).agents
}

/**
 * Build a per-run NativeExecutor from a cordis context. `ctx.agents` missing
 * (service not yet up / wrong realm) is an explicit wire error — never a
 * silent ProcessExecutor fallback (the degradation ladder is a separate,
 * explicit decision; plan Phase 2 Decision).
 */
export type NativeExecutorFactory = (
  ctx: { agents?: AgentRegistry },
  config: NativeExecutorConfig,
) => NativeExecutor

export const createNativeExecutor: NativeExecutorFactory = (ctx, config) => {
  const agents = resolveAgentsService(ctx) as AgentRegistry | undefined
  if (!agents) {
    throw new Error(
      '[mdcontrol/native] DSH agents service unavailable on ctx — native driver requires the in-process agents service (wire error; no silent ProcessExecutor fallback)',
    )
  }
  return new DshNativeExecutor({ agents, config })
}
