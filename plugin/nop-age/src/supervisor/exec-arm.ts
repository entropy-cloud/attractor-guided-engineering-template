/**
 * exec-arm.ts — the supervisor execution arm (age-autonomy M3-WI26, plan
 * `docs/plans/age-autonomy/2026-08-26-1411-2` Phase 3; 03-supervisor §3 the
 * loop's "派发（若有）" step).
 *
 * One executor per trigger exit (six executed + one forwarded):
 *   1. mechanical-verification — awaitingClosure → verify-runner direct run
 *      (resolveVerifyPlan + runVerifyCommands over mission commands.*, the
 *      0925-1/0950-3 Deferred collection) → all green ⇒ the writer appends
 *      `## Verification` pass lines with exit=0 ⇒
 *      closure-audit dispatch follows; any failure ⇒ NO pass line + a
 *      receipt (failure attribution metering = 1411-3). Dual-driver
 *      idempotency: the predicate face reads the LEDGER — if the engine
 *      BUILD_VERIFY step already wrote the pass lines, the trigger does not
 *      fire at all (never a re-run; the intent store is never consulted).
 *   2. plan-review — dispatch line into `## Draft Review Record` + reviewer
 *      agent dispatch (independence is structural again — the drafter cannot
 *      self-dispatch, follow-up P2 closure).
 *   3. closure-audit — dispatch line into `## Closure` with the honest
 *      `models=` lineage + auditor agent dispatch.
 *   4. nothing→deep-audit — consumes the nothing-claim-guard trigger signal
 *      (the terminal-claim action-record face), respects the budget gate
 *      (audit-rounds < maxAuditRounds, resolveMaxAuditRounds same source),
 *      registers the DAR dispatch line + increments audit-rounds in ONE
 *      write (01 §3.3), then marks the claim record consumed.
 *   5. draft-plans — drafter agent dispatch + the receipt occurrence
 *      registry (the one dispatch type with no ledger grammar).
 *   6. reclaim-claim — writer clear/re-issue (claim-validity ④⑤ dispatcher
 *      face) + execute re-dispatch; the dispatch-line crash face
 *      (resume-or-redispatch of un-concluded review/audit occurrences)
 *      lives in ./recovery.ts (M3-WI29) — this arm re-issues the claim only
 *      when an agents face is present.
 *   7. terminal — the R3 DECLARED face (M3-WI27): the decision object is
 *      executed by re-running the SAME R1–R4 evaluation core over a fresh
 *      snapshot (./terminal-rules.ts — dual entry, one implementation); the
 *      declared compound value normalizes to the core's concrete word, a
 *      core `continue` defers the declared terminal, and an executing word
 *      lands the terminal receipt + the watchdog stop-dispatch face.
 *
 * Claim TTL renewal (P2-1 ruling, plan Phase 3): renewal WRITES THE LEDGER
 * (claim-expires extended through the writer, bounded window) — a TTL
 * semantics that claim-validity can actually enforce; observation-only
 * renewal would let legitimate in-flight executions be reclaimed mid-run.
 * Residual risk (accepted, plan): a forged activity signal could renew a
 * claim indefinitely — bounded per-renewal window (never beyond
 * now + MAX_RENEWAL_TTL_MS) + the WI30 activity-only stagnation timeout are the
 * backstops.
 *
 * Every exit is fail-soft: an exception becomes an exception receipt and the
 * watchdog loop continues (a dispatch failure must never stop the supervisor).
 */
import { renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { defaultVerifyKeys, resolveVerifyPlan, runVerifyCommands } from '../../assets/src/verify-runner.mjs'
import { scanPlanLedger, scanRoadmapLedger } from '../../assets/src/ledger-sections.mjs'
import { scanSupervisorSnapshot } from './decision-core.ts'
import { evaluateTermination, normalizeDeclaredTerminal, type StagnationFact, type TerminationEvaluation } from './terminal-rules.ts'
import type { LawGateIo, MissionLawContext } from '../law/host-adapter.ts'
import {
  appendSectionLines,
  clearPlanClaim,
  fsMeterWriterIo,
  writePlanClaim,
  type MeterWriterIo,
} from './writer.ts'
import { recordPlanFailure } from './failures.ts'
import {
  dispatchAlreadyRegistered,
  enforceDistinctModel,
  nextCounterOf,
  nextDispatchId,
  resolveDispatch,
  stemOf,
  type AgentModelBinding,
  type DispatchResolution,
  type DispatchType,
  type PolicyFace,
} from './dispatch-resolve.ts'
import {
  POOL_BANNED_DISPATCH_TYPES,
  POOL_ROLE_OF_DISPATCH_TYPE,
  groupScopeOf,
  poolAgentDefOf,
  type AgentPoolFace,
  type PoolAgentDefFace,
  type PoolPolicyFace,
} from '../efficiency/agent-pool.ts'
import {
  assemble,
  charterHashesOf,
  commitToLedger,
  fsAssemblerIo,
  newLedger,
  resolveAssemblyBlocks,
  type AssemblerIo,
  type AssemblerSpec,
  type AssemblyBlock,
  type AssemblyMode,
} from '../efficiency/prompt-assembler.ts'
import type { TriggerHit } from './trigger-eval.ts'
import type { SupervisorReceiptRecord } from './receipt.ts'

// ── agent dispatch face (the DSH agents service structural slice) ───────────

export interface DispatchAgentsFace {
  create(options: {
    sessionId?: string
    meta?: Record<string, unknown>
    agentOptions?: { provider: string; model: string }
  }): Promise<{ agent: { id: unknown; followup: (message: unknown) => void } }>
}

export type ExecReceiptSink = (record: Omit<SupervisorReceiptRecord, 'ts'> & { occurrenceKey?: string }) => void

/** Prompts reference the ENGINE prompt files — one source, no second prompt. */
const PROMPT_FILE_OF: Record<string, string> = {
  'plan-review': 'tools/mission-driver/prompts/plan-review.md',
  'closure-audit': 'tools/mission-driver/prompts/closure-audit.md',
  'deep-audit': 'tools/mission-driver/prompts/multi-audit.md',
  'draft-plans': 'tools/mission-driver/prompts/draft-from-roadmap.md',
  execute: 'tools/mission-driver/prompts/execute.md',
}

export function dispatchPromptOf(options: {
  dispatchType: DispatchType
  target: string
  registeredId: string | null
  runId: string
}): string {
  const { dispatchType, target, registeredId, runId } = options
  const promptFile = PROMPT_FILE_OF[dispatchType] ?? 'tools/mission-driver/prompts/mission-brief.md'
  const header = `[MISSION_DRIVER:${runId}] supervisor dispatch ${dispatchType}`
  if (dispatchType === 'plan-review') {
    return [
      header,
      '',
      `Review the drafted plan at \`${target}\` — read it completely.`,
      `Follow the checklist of \`${promptFile}\` (same project repo).`,
      '',
      'Dispatch registration (already written by the supervisor — do NOT write your own dispatch line):',
      `  ${registeredId}`,
      "When your review concludes, append ONLY your conclusion line to the plan's `## Draft Review Record`,",
      'reusing that exact id: `- <YYYY-MM-DD>：iteration <n>，共识 <verdict> <same-id>`.',
      'Per the writer-identity edge table you are the legal writer for draft→active (fix minor issues in place,',
      'then set frontmatter `status: active`) or draft→held (`hold: "<reason>"`). The drafter never reviews or promotes their own plan.',
    ].join('\n')
  }
  if (dispatchType === 'closure-audit') {
    return [
      header,
      '',
      `You are the independent closure auditor for the plan at \`${target}\`.`,
      `Follow \`${promptFile}\` (SCRIPT_CHECK_RESULT is PASS: the supervisor already ran the mechanical verification;`,
       'the `## Verification` pass lines are on disk with successful exit codes).',
      '',
      'Dispatch registration (already written by the supervisor — do NOT write your own dispatch line):',
      `  ${registeredId}`,
      'Append ONLY your conclusion line to `## Closure` reusing that exact id:',
      '  `- accepted <same-id>：<conclusion + key evidence>` — or append `- [ ]` rework items under `## Closure Findings` and reject.',
      'Never write `completed`; completion is derived (01 §5.2).',
    ].join('\n')
  }
  if (dispatchType === 'deep-audit') {
    return [
      header,
      '',
      `You are the mission-level deep auditor. Audit the roadmap at \`${target}\` against the live repo.`,
      `Follow \`${promptFile}\`.`,
      '',
      'Dispatch registration (already written by the supervisor into the roadmap `## Deep Audit Record`):',
      `  ${registeredId}`,
      'Append ONLY your accepted line reusing that exact id, carrying the findings lexeme:',
      '  `- accepted <same-id> findings=none|items：<conclusion>` (01 §3.3).',
      'Findings land as unchecked work items / plan Closure Findings — no separate audit files.',
    ].join('\n')
  }
  if (dispatchType === 'draft-plans') {
    return [
      header,
      '',
      `Draft the next 1-3 plans from the remaining roadmap items at \`${target}\`.`,
      `Follow \`${promptFile}\` completely (context reads, plan format, sequencing).`,
      '',
      'Leave every drafted plan at frontmatter `status: draft` — review is dispatched by the supervisor/engine',
      'as an INDEPENDENT reviewer; you never self-dispatch a review and never set `active` yourself.',
    ].join('\n')
  }
  // execute
  return [
    header,
    '',
    `Execute the plan at \`${target}\` — the supervisor-issued claim is already in the plan frontmatter.`,
    `Follow \`${promptFile}\`.`,
    'Tick only what you actually completed; verification and audit dispatch are supervisor-owned.',
  ].join('\n')
}

// ── M4-WI33: the assembled dispatch prompt face (04 §3) ─────────────────────

/** The law-policy assembly section face (validated upstream by law-policy). */
interface AssemblyPolicyFace {
  assembly?: { embedStamp?: unknown; continueDelta?: unknown } | undefined
}

function fixedPrefixBlocksOf(policy: PolicyFace | undefined, agentName: string | null): AssemblyBlock[] {
  if (policy === undefined || agentName === null) return []
  const def = poolAgentDefOf(policy as PoolPolicyFace, agentName)
  const blocks = def !== null ? def.fixedPrefix : undefined
  if (!Array.isArray(blocks) || blocks.length === 0) return []
  return blocks as AssemblyBlock[]
}

/**
 * Assemble (or pass through) one dispatch prompt (M4-WI33, 04 §3):
 *
 * - the resolved agent declares fixedPrefix blocks AND the session carries
 *   prompt-assembly material ⇒ the PromptAssembler composes
 *   `fixedPrefixBlocks ++ [dynamicBlock]` — the thin-pointer prompt IS the
 *   dynamic task block (marker instructions belong to the dynamic suffix,
 *   04 §3.2). The sent hashes commit into the session's ledger (pool
 *   member state — the per-member hash ledger lives and dies with it).
 * - `assembly.continueDelta: false` pins every dispatch to FRESH (the
 *   explicit full-resend posture); absent assembly section defaults to
 *   delta-continue.
 * - otherwise (no fixedPrefix declared) the output is the thin-pointer
 *   prompt BYTE-IDENTICAL — deployments without assembly declarations see
 *   zero change (the backward-compat pin).
 * The prompt-resolution precedence chain (promptsDir → missions/prompts/
 * → built-in) is untouched — the policy overlays the engine prompt, never
 * replaces it (04 §7).
 */
export function dispatchPromptFor(options: {
  base: { dispatchType: DispatchType; target: string; registeredId: string | null; runId: string }
  policy: PolicyFace | undefined
  agentName: string | null
  assembly: DispatchPromptAssembly | null | undefined
  placeholders?: { projectRoot?: string; plansDir?: string; roadmapPath?: string }
  assemblerIo?: AssemblerIo
}): string {
  const { base, policy, agentName, assembly } = options
  const blocks = fixedPrefixBlocksOf(policy, agentName)
  if (assembly === null || assembly === undefined || blocks.length === 0) {
    return dispatchPromptOf(base)
  }
  const continueDelta = (policy as AssemblyPolicyFace | undefined)?.assembly?.continueDelta !== false
  const mode: AssemblyMode = continueDelta ? assembly.mode : 'FRESH'
  const spec: AssemblerSpec = {
    blocks: resolveAssemblyBlocks(blocks, options.placeholders ?? {}),
    ...((policy as AssemblyPolicyFace | undefined)?.assembly?.embedStamp !== undefined
      ? { embedStamp: String((policy as AssemblyPolicyFace)!.assembly!.embedStamp) }
      : {}),
  }
  const out = assemble(mode, spec, { text: dispatchPromptOf(base) }, assembly.sentHashes, options.assemblerIo ?? fsAssemblerIo)
  commitToLedger(assembly.sentHashes, out)
  return out.text
}

// ── the arm ──────────────────────────────────────────────────────────────────

export interface ExecArmOptions {
  projectRoot: string
  lawCtx: MissionLawContext
  io?: MeterWriterIo
  clock?: () => number
  now?: () => string
  /** supervisor run id for dispatch lines / prompts. */
  runId?: string
  /** DSH agents face; absent ⇒ registration-only degradation (never a crash). */
  agents?: DispatchAgentsFace
  /** receipt sink (the watchdog's receipt fn). */
  receipt: ExecReceiptSink
  /** raw receipt JSONL lines feed (the draft-plans occurrence registry). */
  receiptLines?: () => string[]
  /** verify command runner seam (tests inject; default = runVerifyCommands). */
  verifyRunner?: typeof runVerifyCommands
  /**
   * M3-WI27 terminal face: an EXECUTING terminal word calls back into the
   * watchdog's stop-dispatch state (receipt + mdcontrol.status exposure);
   * absent ⇒ this arm writes the terminal receipt itself.
   */
  onTerminalWord?: (evaluation: TerminationEvaluation) => void
  /**
   * M4-WI32: the mount's agent pool (role pools + the session-role mutex
   * registry); absent ⇒ every dispatch takes the fresh path (headless /
   * pool-less hosts, byte-compatible pre-pool behavior).
   */
  pool?: AgentPoolFace
  /**
   * M4-WI32: the run's executor session ids (plan claim holders derived
   * from ledger frontmatter ∪ pool executor tags) — consumed by the
   * same-run auditor ≠ executor red line at audit dispatch time.
   */
  executorSessions?: string[]
  /**
   * M4-WI30 dual-entry same-injection: the declared-face terminal entry
   * (forwardTerminalDecision's re-scan) reads the watchdog-held detector
   * state through this seam — the SAME StagnationFact the cycle-end entry
   * injects (never a second detector; ≤ one cycle skew, converged by
   * idempotent re-evaluation — the 1411-3 cross-case contract).
   */
  stagnationFact?: () => StagnationFact | null
  logger?: { info?: (m: string, f?: Record<string, unknown>) => void; warn?: (m: string, f?: Record<string, unknown>) => void }
}

export interface ExecOutcome {
  action: string
  status: 'dispatched' | 'verified' | 'refused' | 'skipped' | 'degraded' | 'forwarded' | 'failed'
  detail: string
}

type PolicyFaceOf = PolicyFace

function policyOf(lawCtx: MissionLawContext): PolicyFace {
  return lawCtx.policy as unknown as PolicyFace
}

function newClaimToken(runId: string, holderSessionId: string): string {
  return `attempt-${runId}-${holderSessionId}-${randomBytes(4).toString('hex')}`
}

/** M4-WI32: the pool face consumed here doubles as the role-tag registry. */
type PoolFaceOf = AgentPoolFace

/**
 * M4-WI33: the prompt-assembly material one dispatched session carries —
 * the FRESH/CONTINUE mode (pool create ⇒ FRESH, same-member followup ⇒
 * CONTINUE; fresh-path sessions are always FRESH) plus the per-session
 * hash ledger (pool member state for pooled agents, a throwaway Map for
 * one-shot sessions). Absent on the outcome ⇒ the agent declares no
 * fixedPrefix ⇒ the caller keeps the thin-pointer prompt path unchanged.
 */
export interface DispatchPromptAssembly {
  mode: AssemblyMode
  sentHashes: Map<string, string>
}

export type DispatchAgentOutcome =
  | {
      status: 'created'
      sessionId: string
      followup: (text: string) => void
      poolNote: string | null
      /** M4-WI33: present iff the resolved agent declares fixedPrefix blocks. */
      promptAssembly?: DispatchPromptAssembly
    }
  | { status: 'refused'; reason: string }

/**
 * Create one dispatched agent session bound to the resolved model selection.
 *
 * M4-WI32 pool hook — INSIDE this function by design (plan Phase 2): the
 * recovery redispatch path calls createDispatchAgent directly, so every
 * route to a dispatched session rides the same pool/mutex discipline — no
 * bypass hole. Routing:
 *   - plan-review / draft-plans with a pool face + resolvable agent def →
 *     pool.acquire (reuse / rotation / creation); a bypassed outcome falls
 *     through to the fresh path carrying the honest note;
 *   - closure-audit / deep-audit → ALWAYS fresh (the P7 structural ban —
 *     the candidate session is red-line-checked against the run's executor
 *     set before the dispatch proceeds);
 *   - execute → fresh with the dormant-ruling note (the executor session
 *     still gets its executor role tag — the red-line registry leg).
 * Role tags are registered for EVERY fresh dispatch (auditor / executor /
 * reviewer / drafter) — the registry, not the pooling, is what the mutex
 * red lines enforce. Absent pool/dispatchType ⇒ the pre-pool fresh path,
 * byte-compatible (headless / old callers).
 */
export async function createDispatchAgent(
  agents: DispatchAgentsFace,
  binding: AgentModelBinding,
  options: {
    projectRoot: string
    label: string
    /** the mount's agent pool (role pools + mutex registry); absent ⇒ fresh path. */
    pool?: PoolFaceOf
    /** the dispatch type this acquisition serves (pool routing + role tags). */
    dispatchType?: DispatchType
    /** group scope for reviewer pooling ({groupId} placeholder, 04 §2.2). */
    groupId?: string | null
    /** run executor session ids — the same-run auditor ≠ executor red line. */
    executorSessions?: string[]
    /** policy face — the agent def's poolKey/idleTtlMinutes/rotateEvery read (dispatch-resolve stays untouched). */
    policy?: PolicyFace
    /** M4-WI33: placeholder context for fixedPrefix ref resolution (default = projectRoot). */
    assemblyPlaceholders?: { plansDir?: string; roadmapPath?: string }
    /** M4-WI33: injectable assembler file face (tests); default = node fs. */
    assemblerIo?: AssemblerIo
  },
): Promise<DispatchAgentOutcome> {
  const { pool, dispatchType } = options
  const notes: string[] = []

  // M4-WI33: the resolved agent's fixedPrefix blocks — when declared, the
  // CURRENT charter hashes feed the pool (04 §2.2 rotation leg 2: an
  // upstream charter change forces a new member) and the outcome carries
  // the prompt-assembly material (mode + the session's hash ledger).
  const charterBlocks = fixedPrefixBlocksOf(options.policy, binding.agentName)
  let currentFileHashes: Map<string, string> | null = null
  if (charterBlocks.length > 0) {
    currentFileHashes = charterHashesOf(
      { blocks: resolveAssemblyBlocks(charterBlocks, { projectRoot: options.projectRoot, ...options.assemblyPlaceholders }) },
      options.assemblerIo ?? fsAssemblerIo,
    )
  }

  if (pool !== undefined && (dispatchType === 'plan-review' || dispatchType === 'draft-plans')) {
    const def = poolAgentDefOf(options.policy as PoolPolicyFace | undefined, binding.agentName)
    if (def !== null) {
      const acquired = await pool.acquire({
        agents,
        dispatchType,
        binding,
        def: def as PoolAgentDefFace,
        projectRoot: options.projectRoot,
        groupId: options.groupId ?? null,
        label: options.label,
        ...(currentFileHashes !== null ? { currentFileHashes } : {}),
      })
      if (acquired.status === 'refused') return { status: 'refused', reason: acquired.reason }
      if (acquired.status === 'acquired') {
        return {
          status: 'created',
          sessionId: acquired.sessionId!,
          followup: acquired.followup!,
          poolNote: acquired.reason,
          ...(charterBlocks.length > 0
            ? { promptAssembly: { mode: acquired.reused ? ('CONTINUE' as const) : ('FRESH' as const), sentHashes: acquired.sentHashes ?? newLedger() } }
            : {}),
        }
      }
      notes.push(acquired.reason) // bypassed — fresh path below, honest note carried
    }
  }
  if (dispatchType !== undefined && POOL_BANNED_DISPATCH_TYPES.includes(dispatchType)) {
    notes.push(`P7 audit ban: ${dispatchType} structurally never enters a pool (04 §2.4; multi-audit = the deep-audit prompt-file face) — fresh independent dispatch regardless of agent mode config`)
  } else if (dispatchType === 'execute') {
    notes.push('executor pooling declared but dormant (2026-08-27-0433-2 baseline ruling): plan execution stays the engine-run territory — fresh session; the declaration remains consumable by M4-WI33/M5-WI37')
  }

  const sessionId = `mdsup-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
  const handle = await agents.create({
    sessionId,
    meta: { cwd: options.projectRoot, origin: 'subagent', delegationDepth: 1 },
    agentOptions: { provider: binding.provider, model: binding.model },
  })
  const realId = String(handle.agent.id ?? sessionId)
  const role = dispatchType !== undefined ? POOL_ROLE_OF_DISPATCH_TYPE[dispatchType] : undefined
  if (pool !== undefined && role !== undefined) {
    const registered = pool.registerRole(realId, role)
    if (!registered.ok) return { status: 'refused', reason: registered.reason }
  }
  if (dispatchType !== undefined && POOL_BANNED_DISPATCH_TYPES.includes(dispatchType)) {
    // final-review P2-5 red line: a same-run auditor session must differ
    // from every executor session (claim holders ∪ pool executor tags).
    const executors = new Set<string>([...(options.executorSessions ?? []), ...(pool?.executorSessions() ?? [])])
    if (executors.has(realId)) {
      return {
        status: 'refused',
        reason: `role mutex violation: audit candidate session ${realId} is a registered executor of this run — same-run auditor ≠ any executor (final-review P2-5); dispatch refused`,
      }
    }
  }
  return {
    status: 'created',
    sessionId: realId,
    followup: (text: string) => {
      handle.agent.followup({ content: [{ type: 'text', text }], source: { kind: 'user' } })
    },
    poolNote: notes.length > 0 ? notes.join(' — ') : null,
    // M4-WI33: a fresh-path (non-pooled / bypassed) session over a
    // fixedPrefix-declaring agent is one-shot FRESH — the throwaway ledger
    // commits the send (hash-audit face) and dies with the dispatch.
    ...(charterBlocks.length > 0 ? { promptAssembly: { mode: 'FRESH' as const, sentHashes: newLedger() } } : {}),
  }
}

function resolveOrRefuse(
  dispatchType: DispatchType,
  opts: ExecArmOptions,
  planAgent: string | null,
): { ok: true; resolution: DispatchResolution } | { ok: false; reason: string } {
  const out = resolveDispatch({ dispatchType, policy: policyOf(opts.lawCtx), planAgent })
  return out.ok ? { ok: true, resolution: out.resolution } : { ok: false, reason: out.reason }
}

function planAgentOf(planText: string | null): string | null {
  if (planText === null) return null
  const scan = scanPlanLedger(planText) as unknown as { fm: Record<string, unknown> | null }
  const agent = scan.fm?.agent
  return typeof agent === 'string' ? agent : null
}

function dispatchIdsOf(text: string | null, section: 'Draft Review Record' | 'Closure'): string[] {
  if (text === null) return []
  const scan = scanPlanLedger(text) as unknown as {
    draftReviewRecord?: { dispatches: Array<{ id: string }> } | null
    closure?: { dispatches: Array<{ id: string }> } | null
  }
  const dispatches = section === 'Draft Review Record' ? scan.draftReviewRecord?.dispatches : scan.closure?.dispatches
  return (dispatches ?? []).map((d) => d.id)
}

interface RoadmapScanFace {
  fm: Record<string, unknown> | null
  deepAuditRecord: { dispatches: Array<{ id: string }>; unpairedDispatches: string[]; accepted: Array<{ id: string; findings: string | null }> } | null
}

function roadmapScanOf(text: string): RoadmapScanFace {
  return scanRoadmapLedger(text) as unknown as RoadmapScanFace
}

/** Dispatch one AI-facing exit: dedup → resolve → enforce → register → agent. */
async function dispatchAgentExit(
  hit: TriggerHit,
  dispatchType: DispatchType,
  opts: ExecArmOptions,
  registration: {
    path: string
    section: string
    line: (id: string, sessionId: string, lineage: string) => string
    existingIds: string[]
    /** explicit id counter override (deep-audit: the round being consumed, 01 §3.3). */
    counter?: number
    setFrontmatter?: Record<string, string | number>
  },
): Promise<ExecOutcome> {
  const io = opts.io ?? fsMeterWriterIo
  const runId = opts.runId ?? 'mdsupervisor'
  const isRoadmap = registration.path === opts.lawCtx.roadmapPath
  const planText = isRoadmap ? null : io.readTextFile(registration.path)
  const roadmapText = opts.lawCtx.roadmapPath !== '' ? io.readTextFile(opts.lawCtx.roadmapPath) : null
  const dedup = dispatchAlreadyRegistered({
    occurrenceType: hit.occurrence.type,
    planText,
    roadmapText,
    receiptLines: opts.receiptLines?.() ?? [],
    occurrenceKey: hit.occurrence.key,
  })
  if (dedup.already) {
    return { action: dispatchType, status: 'skipped', detail: `occurrence already registered — ${dedup.detail}` }
  }

  const resolved = resolveOrRefuse(dispatchType, opts, planAgentOf(planText))
  if (!resolved.ok) {
    opts.receipt({ kind: 'exception', runId, plan: hit.target, event: `dispatch-refused:${dispatchType}`, detail: resolved.reason })
    return { action: dispatchType, status: 'refused', detail: resolved.reason }
  }
  const executorResolved = resolveDispatch({ dispatchType: 'execute', policy: policyOf(opts.lawCtx) })
  const executorBinding = executorResolved.ok ? executorResolved.resolution.binding : resolved.resolution.binding
  const enforcement = enforceDistinctModel({ dispatchType, policy: policyOf(opts.lawCtx), resolution: resolved.resolution, executorBinding })
  if (enforcement.status === 'refused') {
    opts.receipt({ kind: 'exception', runId, plan: hit.target, event: `dispatch-refused:${dispatchType}`, detail: enforcement.reason })
    return { action: dispatchType, status: 'refused', detail: enforcement.reason }
  }
  if (enforcement.status === 'downgraded') {
    opts.receipt({ kind: 'observation', runId, plan: hit.target, event: `dispatch-downgraded:${dispatchType}`, detail: enforcement.reason })
  }

  // agent session first (the dispatch line carries the target session id);
  // no agents face ⇒ registration-only degradation (1411-1 posture)
  let handle: { sessionId: string; followup: (text: string) => void } | null = null
  let poolNote: string | null = null
  let promptAssembly: DispatchPromptAssembly | undefined
  if (opts.agents !== undefined) {
    try {
      const agentOut = await createDispatchAgent(opts.agents, resolved.resolution.binding, {
        projectRoot: opts.projectRoot,
        label: `Mission: ${dispatchType}`,
        ...(opts.pool !== undefined ? { pool: opts.pool } : {}),
        dispatchType,
        ...(dispatchType === 'plan-review' ? { groupId: groupScopeOf(registration.path, planText) } : {}),
        ...(opts.executorSessions !== undefined ? { executorSessions: opts.executorSessions } : {}),
        policy: policyOf(opts.lawCtx),
        assemblyPlaceholders: { plansDir: opts.lawCtx.plansDir, roadmapPath: opts.lawCtx.roadmapPath },
        assemblerIo: io,
      })
      if (agentOut.status === 'refused') {
        opts.receipt({ kind: 'exception', runId, plan: hit.target, event: `dispatch-refused:${dispatchType}`, detail: agentOut.reason })
        return { action: dispatchType, status: 'refused', detail: agentOut.reason }
      }
      handle = { sessionId: agentOut.sessionId, followup: agentOut.followup }
      poolNote = agentOut.poolNote
      promptAssembly = agentOut.promptAssembly
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      opts.receipt({ kind: 'exception', runId, plan: hit.target, event: `dispatch-failed:${dispatchType}`, detail })
      return { action: dispatchType, status: 'failed', detail }
    }
  }
  const sessionId = handle !== null ? handle.sessionId : 'ses-pending'

  const id = nextDispatchId({
    kind: registration.section === 'Draft Review Record' ? 'review' : 'audit',
    runId,
    stem: stemOf(registration.path),
    counter:
      registration.counter ??
      nextCounterOf(registration.existingIds, `#${registration.section === 'Draft Review Record' ? 'review' : 'audit'}-${runId}-`),
  })
  const write = appendSectionLines({
    path: registration.path,
    section: registration.section,
    lines: [registration.line(id, sessionId, enforcement.lineage)],
    ...(registration.setFrontmatter !== undefined ? { setFrontmatter: registration.setFrontmatter } : {}),
    lawCtx: opts.lawCtx,
    io,
    now: opts.clock,
  })
  if (write.status !== 'written') {
    opts.receipt({ kind: 'exception', runId, plan: registration.path, event: `dispatch-registration-failed:${dispatchType}`, detail: `writer ${write.status}: ${write.reason ?? ''}` })
    return { action: dispatchType, status: 'failed', detail: `registration write ${write.status}: ${write.reason ?? ''}` }
  }
  if (handle !== null) {
    handle.followup(
      dispatchPromptFor({
        base: { dispatchType, target: registration.path, registeredId: id, runId },
        policy: policyOf(opts.lawCtx),
        agentName: resolved.resolution.agentName,
        assembly: promptAssembly,
        placeholders: { projectRoot: opts.projectRoot, plansDir: opts.lawCtx.plansDir, roadmapPath: opts.lawCtx.roadmapPath },
        assemblerIo: io,
      }),
    )
    opts.receipt({
      kind: 'observation',
      runId,
      plan: registration.path,
      event: `dispatch:${dispatchType}`,
      detail: `${id} to ${sessionId}${enforcement.status === 'downgraded' ? ' (single-model downgrade, honest lineage)' : ''}${poolNote !== null ? ` — pool: ${poolNote}` : ''}`,
    })
    return { action: dispatchType, status: 'dispatched', detail: `${id} to ${sessionId}` }
  }
  opts.receipt({
    kind: 'observation',
    runId,
    plan: registration.path,
    event: `dispatch:${dispatchType}`,
    detail: `${id} registered (agents face absent — AI dispatch degraded to registration-only, 1411-1 posture)`,
  })
  return { action: dispatchType, status: 'degraded', detail: `${id} registered; no agents face to dispatch` }
}

// ── exit executors ───────────────────────────────────────────────────────────

/** Exit 1: mechanical-verification (verify-runner direct run + pass-line write). */
export async function runMechanicalVerification(hit: TriggerHit, opts: ExecArmOptions): Promise<ExecOutcome> {
  const io = opts.io ?? fsMeterWriterIo
  const runId = opts.runId ?? 'mdsupervisor'
  const planPath = hit.target as string
  const planText = io.readTextFile(planPath)
  if (planText === null) return { action: 'mechanical-verification', status: 'failed', detail: `plan ${planPath} unreadable` }
  const scan = scanPlanLedger(planText) as unknown as { fm: Record<string, unknown> | null }
  const verify = scan.fm?.verify
  const plan = resolveVerifyPlan({ verify: Array.isArray(verify) ? verify : undefined, commands: opts.lawCtx.commands })
  if (!plan.ok || plan.keys.length === 0) {
    opts.receipt({
      kind: 'exception',
      runId,
      plan: planPath,
      event: 'mechanical-verification-no-keys',
      detail: `verify plan unresolvable (${plan.problems.join('; ') || 'no keys resolved'}) — nothing run, no pass lines (fail-closed, M2-WI44 posture)`,
    })
    return { action: 'mechanical-verification', status: 'skipped', detail: 'no resolvable verify keys' }
  }
  const runner = opts.verifyRunner ?? runVerifyCommands
  const run = await runner({ keys: plan.keys, commands: opts.lawCtx.commands, projectRoot: opts.projectRoot, planText, runId } as Parameters<typeof runVerifyCommands>[0])
  const failed = run.results.filter((r: { exitCode: number | null }) => r.exitCode !== 0)
  if (failed.length > 0) {
    opts.receipt({
      kind: 'exception',
      runId,
      plan: planPath,
      event: 'mechanical-verification-failed',
      detail: failed.map((r: { key: string; exitCode: number | null }) => `${r.key} exit=${r.exitCode ?? 'null'}`).join('; '),
    })
    // M3-WI27 metering (02 §4.6): one verification-red bucket count per red
    // run — through the 1411-1 writer (plan frontmatter failures).
    recordPlanFailure({ planPath, bucket: 'verification-red', lawCtx: opts.lawCtx, io, receipt: opts.receipt, runId })
    return { action: 'mechanical-verification', status: 'failed', detail: `verify red: ${failed.map((r: { key: string }) => r.key).join(', ')} — no pass lines written (failure attributed: verification-red, 02 §4.6)` }
  }
  const write = appendSectionLines({
    path: planPath,
    section: 'Verification',
    lines: run.results.map((r: { passLine: string }) => r.passLine),
    lawCtx: opts.lawCtx,
    io,
    now: opts.clock,
  })
  if (write.status !== 'written') {
    opts.receipt({ kind: 'exception', runId, plan: planPath, event: 'mechanical-verification-write-failed', detail: `writer ${write.status}: ${write.reason ?? ''}` })
    return { action: 'mechanical-verification', status: 'failed', detail: `pass-line write ${write.status}` }
  }
  opts.receipt({
    kind: 'observation',
    runId,
    plan: planPath,
    event: 'mechanical-verification-passed',
    detail: `${plan.keys.join(', ')} exit=0 — pass lines on disk, closure-audit dispatch follows`,
  })
  // chain: dispatch closure-audit for the same plan (the trigger-2 face)
  const closureHit: TriggerHit = { ...hit, action: 'closure-audit', trigger: { ...hit.trigger, exitValue: 'closure-audit' }, occurrence: { ...hit.occurrence, type: 'audit' } }
  const closure = await dispatchClosureAudit(closureHit, opts)
  return { action: 'mechanical-verification', status: 'verified', detail: `pass lines written; closure-audit: ${closure.status} (${closure.detail})` }
}

/** Exit 2: plan-review dispatch (dispatch line into ## Draft Review Record). */
export async function dispatchPlanReview(hit: TriggerHit, opts: ExecArmOptions): Promise<ExecOutcome> {
  const io = opts.io ?? fsMeterWriterIo
  const planPath = hit.target as string
  const planText = io.readTextFile(planPath)
  return dispatchAgentExit(hit, 'plan-review', opts, {
    path: planPath,
    section: 'Draft Review Record',
    line: (id, sessionId) => `- dispatch review ${id} to ${sessionId}`,
    existingIds: dispatchIdsOf(planText, 'Draft Review Record'),
  })
}

/** Exit 3: closure-audit dispatch (## Closure + honest models= lineage). */
export async function dispatchClosureAudit(hit: TriggerHit, opts: ExecArmOptions): Promise<ExecOutcome> {
  const io = opts.io ?? fsMeterWriterIo
  const planPath = hit.target as string
  const planText = io.readTextFile(planPath)
  return dispatchAgentExit(hit, 'closure-audit', opts, {
    path: planPath,
    section: 'Closure',
    line: (id, sessionId, lineage) => `- dispatch audit ${id} to ${sessionId}${lineage}`,
    existingIds: dispatchIdsOf(planText, 'Closure'),
  })
}

/** Exit 4: nothing→deep-audit (budget gate + DAR registration + meter + consume). */
export async function dispatchDeepAudit(hit: TriggerHit, opts: ExecArmOptions): Promise<ExecOutcome> {
  const io = opts.io ?? fsMeterWriterIo
  const runId = opts.runId ?? 'mdsupervisor'
  const roadmapPath = opts.lawCtx.roadmapPath
  if (roadmapPath === '') return { action: 'deep-audit', status: 'failed', detail: 'no governing roadmap — nothing to audit' }
  const roadmapText = io.readTextFile(roadmapPath)
  if (roadmapText === null) return { action: 'deep-audit', status: 'failed', detail: 'roadmap unreadable' }
  const scan = roadmapScanOf(roadmapText)
  const rounds = typeof scan.fm?.['audit-rounds'] === 'number' ? (scan.fm['audit-rounds'] as number) : 0
  const max = opts.lawCtx.maxAuditRounds
  if (!(rounds < max)) {
    opts.receipt({
      kind: 'observation',
      runId,
      plan: null,
      event: 'deep-audit-budget-exhausted',
      detail: `audit-rounds=${rounds} ≥ maxAuditRounds=${max} — new deep-audit dispatch denied (R1 terminal closure = the watchdog terminal duty, M3-WI27; this gate only denies — complementary faces, one budget)`,
    })
    return { action: 'deep-audit', status: 'skipped', detail: `budget exhausted (${rounds} ≥ ${max}) — R1 territory, recorded via receipt` }
  }
  const claimFiles = terminalClaimFilesUnder(opts.projectRoot, io)
  const outcome = await dispatchAgentExit(hit, 'deep-audit', opts, {
    path: roadmapPath,
    section: 'Deep Audit Record',
    line: (id, sessionId, lineage) => `- dispatch audit ${id} to ${sessionId}${lineage}`,
    existingIds: (scan.deepAuditRecord?.dispatches ?? []).map((d) => d.id),
    counter: rounds + 1,
    setFrontmatter: { 'audit-rounds': rounds + 1 },
  })
  if (outcome.status === 'dispatched' || outcome.status === 'degraded') {
    consumeTerminalClaims(claimFiles, io)
  }
  return outcome
}

function terminalClaimFilesUnder(projectRoot: string, io: LawGateIo): string[] {
  const tmp = join(projectRoot, '_tmp')
  const runs = io.listDirEntries(tmp)
  if (runs === null) return []
  const out: string[] = []
  for (const run of runs) {
    if (!io.isDirectory(join(tmp, run))) continue
    const file = join(tmp, run, 'terminal-claim.json')
    if (io.readTextFile(file) !== null) out.push(file)
  }
  return out
}

/** Consume the terminal-claim action records (rename .consumed — the trigger signal must not re-fire). */
function consumeTerminalClaims(files: string[], io: MeterWriterIo): void {
  for (const file of files) {
    try {
      renameSync(file, `${file}.consumed`)
    } catch {
      void io // best-effort consumption; a stale claim file re-triggers the dedup face, never a crash
    }
  }
}

/** Exit 5: draft-plans dispatch (drafter; receipt occurrence registry). */
export async function dispatchDraftPlans(hit: TriggerHit, opts: ExecArmOptions): Promise<ExecOutcome> {
  const runId = opts.runId ?? 'mdsupervisor'
  const dedup = dispatchAlreadyRegistered({
    occurrenceType: 'draft',
    planText: null,
    roadmapText: null,
    receiptLines: opts.receiptLines?.() ?? [],
    occurrenceKey: hit.occurrence.key,
  })
  if (dedup.already) return { action: 'draft-plans', status: 'skipped', detail: dedup.detail }
  const resolved = resolveOrRefuse('draft-plans', opts, null)
  if (!resolved.ok) {
    opts.receipt({ kind: 'exception', runId, plan: null, event: 'dispatch-refused:draft-plans', detail: resolved.reason })
    return { action: 'draft-plans', status: 'refused', detail: resolved.reason }
  }
  const roadmapPath = opts.lawCtx.roadmapPath
  if (opts.agents !== undefined) {
    try {
      const agentOut = await createDispatchAgent(opts.agents, resolved.resolution.binding, {
        projectRoot: opts.projectRoot,
        label: 'Mission: draft-plans',
        ...(opts.pool !== undefined ? { pool: opts.pool } : {}),
        dispatchType: 'draft-plans',
        policy: policyOf(opts.lawCtx),
        assemblyPlaceholders: { plansDir: opts.lawCtx.plansDir, roadmapPath: opts.lawCtx.roadmapPath },
        assemblerIo: opts.io ?? fsMeterWriterIo,
      })
      if (agentOut.status === 'refused') {
        opts.receipt({ kind: 'exception', runId, plan: null, event: 'dispatch-refused:draft-plans', detail: agentOut.reason })
        return { action: 'draft-plans', status: 'refused', detail: agentOut.reason }
      }
      const handle = { sessionId: agentOut.sessionId, followup: agentOut.followup }
      handle.followup(
        dispatchPromptFor({
          base: { dispatchType: 'draft-plans', target: roadmapPath, registeredId: null, runId },
          policy: policyOf(opts.lawCtx),
          agentName: resolved.resolution.agentName,
          assembly: agentOut.promptAssembly,
          placeholders: { projectRoot: opts.projectRoot, plansDir: opts.lawCtx.plansDir, roadmapPath: opts.lawCtx.roadmapPath },
          assemblerIo: opts.io ?? fsMeterWriterIo,
        }),
      )
      opts.receipt({
        kind: 'observation',
        runId,
        plan: null,
        event: 'dispatch:draft-plans',
        detail: `drafter ${resolved.resolution.agentName} → session ${handle.sessionId}${agentOut.poolNote !== null ? ` — pool: ${agentOut.poolNote}` : ''}`,
        occurrenceKey: hit.occurrence.key,
      })
      return { action: 'draft-plans', status: 'dispatched', detail: `drafter session ${handle.sessionId}` }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      opts.receipt({ kind: 'exception', runId, plan: null, event: 'dispatch-failed:draft-plans', detail })
      return { action: 'draft-plans', status: 'failed', detail }
    }
  }
  opts.receipt({
    kind: 'observation',
    runId,
    plan: null,
    event: 'dispatch:draft-plans',
    detail: `drafter ${resolved.resolution.agentName} resolved (agents face absent — registration-only)`,
    occurrenceKey: hit.occurrence.key,
  })
  return { action: 'draft-plans', status: 'degraded', detail: 'no agents face to dispatch' }
}

/** Exit 6: reclaim-claim (writer clear/re-issue + execute re-dispatch). */
export async function reclaimClaim(hit: TriggerHit, opts: ExecArmOptions): Promise<ExecOutcome> {
  const io = opts.io ?? fsMeterWriterIo
  const runId = opts.runId ?? 'mdsupervisor'
  const planPath = hit.target as string
  const cleared = clearPlanClaim({ planPath, lawCtx: opts.lawCtx, io, now: opts.clock })
  if (cleared.status !== 'written' && cleared.status !== 'noop') {
    opts.receipt({ kind: 'exception', runId, plan: planPath, event: 'reclaim-clear-failed', detail: `writer ${cleared.status}: ${cleared.reason ?? ''}` })
    return { action: 'reclaim-claim', status: 'failed', detail: `claim clear ${cleared.status}` }
  }
  // M3-WI27 metering (02 §4.6): a reclaimed expired claim = one
  // claim-expired-no-output count (the plan stayed active past TTL without
  // completing — output-less by definition). 'noop' cleared nothing: no count.
  if (cleared.status === 'written') {
    recordPlanFailure({ planPath, bucket: 'claim-expired-no-output', lawCtx: opts.lawCtx, io, receipt: opts.receipt, runId })
  }
  const resolved = resolveOrRefuse('execute', opts, planAgentOf(io.readTextFile(planPath)))
  if (!resolved.ok) {
    opts.receipt({ kind: 'exception', runId, plan: planPath, event: 'dispatch-refused:execute', detail: resolved.reason })
    return { action: 'reclaim-claim', status: 'refused', detail: resolved.reason }
  }
  if (opts.agents !== undefined) {
    try {
      const agentOut = await createDispatchAgent(opts.agents, resolved.resolution.binding, {
        projectRoot: opts.projectRoot,
        label: 'Mission: execute',
        ...(opts.pool !== undefined ? { pool: opts.pool } : {}),
        dispatchType: 'execute',
        policy: policyOf(opts.lawCtx),
        assemblyPlaceholders: { plansDir: opts.lawCtx.plansDir, roadmapPath: opts.lawCtx.roadmapPath },
        assemblerIo: io,
      })
      if (agentOut.status === 'refused') {
        opts.receipt({ kind: 'exception', runId, plan: planPath, event: 'dispatch-refused:execute', detail: agentOut.reason })
        return { action: 'reclaim-claim', status: 'refused', detail: agentOut.reason }
      }
      const handle = { sessionId: agentOut.sessionId, followup: agentOut.followup }
      const claim = newClaimToken(runId, handle.sessionId)
      const expires = new Date((opts.clock?.() ?? Date.now()) + DEFAULT_CLAIM_TTL_MS).toISOString()
      const issued = writePlanClaim({ planPath, claim, expires, lawCtx: opts.lawCtx, io, now: opts.clock })
      if (issued.status !== 'written') {
        opts.receipt({ kind: 'exception', runId, plan: planPath, event: 'reclaim-reissue-failed', detail: `writer ${issued.status}: ${issued.reason ?? ''}` })
        // M3-WI27 metering: the executor dispatch errored at re-issue — one
        // executor-error count (02 §4.6 bucket).
        recordPlanFailure({ planPath, bucket: 'executor-error', lawCtx: opts.lawCtx, io, receipt: opts.receipt, runId })
        return { action: 'reclaim-claim', status: 'failed', detail: `claim re-issue ${issued.status}` }
      }
      handle.followup(
        dispatchPromptFor({
          base: { dispatchType: 'execute', target: planPath, registeredId: null, runId },
          policy: policyOf(opts.lawCtx),
          agentName: resolved.resolution.agentName,
          assembly: agentOut.promptAssembly,
          placeholders: { projectRoot: opts.projectRoot, plansDir: opts.lawCtx.plansDir, roadmapPath: opts.lawCtx.roadmapPath },
          assemblerIo: io,
        }),
      )
      opts.receipt({ kind: 'observation', runId, plan: planPath, event: 'reclaim-claim', detail: `claim reclaimed + re-issued to executor session ${handle.sessionId} (expires ${expires})` })
      return { action: 'reclaim-claim', status: 'dispatched', detail: `re-issued to ${handle.sessionId}` }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      opts.receipt({ kind: 'exception', runId, plan: planPath, event: 'reclaim-failed', detail })
      // M3-WI27 metering: agent-session creation / dispatch run error — one
      // executor-error count (02 §4.6 bucket).
      recordPlanFailure({ planPath, bucket: 'executor-error', lawCtx: opts.lawCtx, io, receipt: opts.receipt, runId })
      return { action: 'reclaim-claim', status: 'failed', detail }
    }
  }
  opts.receipt({ kind: 'observation', runId, plan: planPath, event: 'reclaim-claim', detail: 'claim cleared; no agents face — AI re-dispatch deferred (stale-dispatch resume-or-redispatch = the recovery scan, M3-WI29 recovery.ts; this posture is the legal headless degradation)' })
  return { action: 'reclaim-claim', status: 'degraded', detail: 'cleared; re-dispatch deferred to the recovery scan (no agents face)' }
}

/**
 * Exit 7: the R3 declared terminal face — executed through the SAME R1–R4
 * core (M3-WI27, plan 1411-3 Phase 3; dual entry, one implementation). The
 * declared lexeme (`partial|blocked|partial/blocked`) never forwards blind:
 * the core normalizes the compound value to a concrete word, and a core
 * `continue` ALWAYS defers the declared terminal.
 */
export async function forwardTerminalDecision(hit: TriggerHit, opts: ExecArmOptions): Promise<ExecOutcome> {
  const runId = opts.runId ?? 'mdsupervisor'
  const snapshot = scanSupervisorSnapshot({ projectRoot: opts.projectRoot, lawCtx: opts.lawCtx, io: opts.io, clock: opts.clock, now: opts.now })
  if (snapshot === null) {
    opts.receipt({ kind: 'observation', runId, plan: null, event: `terminal-decision:${hit.trigger.exitValue}`, detail: `${hit.reason} — no governing law context; decision object recorded only` })
    return { action: `terminal:${hit.trigger.exitValue}`, status: 'forwarded', detail: 'recorded (no law context)' }
  }
  const evaluation = evaluateTermination(snapshot, {
    maxAuditRounds: opts.lawCtx.maxAuditRounds,
    maxFailures: opts.lawCtx.maxFailures ?? 3,
    // M3-WI30: dual entry, one detector — the declared face injects the
    // same watchdog-held stagnation fact the cycle-end entry reads.
    ...(opts.stagnationFact !== undefined ? { stagnation: opts.stagnationFact() ?? undefined } : {}),
  })
  const normalized = normalizeDeclaredTerminal(hit.trigger.exitValue, evaluation)
  if (!normalized.executes) {
    opts.receipt({ kind: 'observation', runId, plan: null, event: `terminal-declaration-deferred:${hit.trigger.exitValue}`, detail: normalized.reason })
    return { action: `terminal:${hit.trigger.exitValue}`, status: 'skipped', detail: 'core says continue — declared terminal deferred (dual-entry same-source)' }
  }
  if (opts.onTerminalWord !== undefined) {
    opts.onTerminalWord(evaluation)
  } else {
    opts.receipt({ kind: 'terminal', runId, plan: null, event: `run-terminal:${normalized.word}`, detail: normalized.reason })
  }
  return { action: `terminal:${normalized.word}`, status: 'forwarded', detail: normalized.reason }
}

// ── claim TTL renewal (P2-1 ruling: renewal WRITES the ledger, bounded) ─────

export const DEFAULT_CLAIM_TTL_MS = 30 * 60 * 1000
export const DEFAULT_RENEWAL_TTL_MS = 30 * 60 * 1000
/** Bounded ceiling: one renewal never extends the claim beyond now + MAX. */
export const MAX_RENEWAL_TTL_MS = 60 * 60 * 1000
/** Renewal window: claims expiring sooner than this are renewed when the holder is active. */
export const RENEWAL_THRESHOLD_MS = 5 * 60 * 1000

export interface RenewalOutcome {
  planPath: string
  status: 'renewed' | 'not-due' | 'inactive-holder' | 'denied' | 'failed' | 'skipped'
  detail: string
}

/**
 * Renew a near-expiry claim whose holder showed activity: the P2-1 ruling —
 * renewal lands in the LEDGER through the writer (claim-validity's
 * "未过期" face stays enforceable), bounded to now + min(ttl, MAX_RENEWAL_TTL)
 * per renewal. Forged infinite activity is backstopped by the bounded window
 * + the WI30 activity-only stagnation timeout (accepted residual, plan Phase 3).
 */
export function renewClaim(options: {
  planPath: string
  holderSessionId: string
  lawCtx: MissionLawContext
  /** epoch ms of the holder's last observed activity (events/session tool face). */
  lastActiveAt: number
  io?: MeterWriterIo
  clock?: () => number
  now?: () => string
  ttlMs?: number
}): RenewalOutcome {
  const now = options.clock?.() ?? Date.now()
  const io = options.io ?? fsMeterWriterIo
  const text = io.readTextFile(options.planPath)
  if (text === null) return { planPath: options.planPath, status: 'failed', detail: 'plan unreadable' }
  const scan = scanPlanLedger(text) as unknown as { fm: Record<string, unknown> | null }
  const claim = scan.fm?.claim
  const expires = scan.fm?.['claim-expires']
  if (typeof claim !== 'string' || typeof expires !== 'string') {
    return { planPath: options.planPath, status: 'skipped', detail: 'no live claim pair' }
  }
  const expiry = Date.parse(expires)
  if (Number.isNaN(expiry)) return { planPath: options.planPath, status: 'skipped', detail: 'malformed expiry (fail-soft)' }
  if (expiry <= now) return { planPath: options.planPath, status: 'not-due', detail: 'already expired — reclaim territory, not renewal' }
  if (expiry - now > RENEWAL_THRESHOLD_MS) {
    return { planPath: options.planPath, status: 'not-due', detail: `claim not near expiry (${Math.round((expiry - now) / 60000)}min left)` }
  }
  if (options.lastActiveAt < now - RENEWAL_THRESHOLD_MS) {
    return { planPath: options.planPath, status: 'inactive-holder', detail: 'no recent holder activity — no renewal (03 §7 stagnation face)' }
  }
  const ttl = Math.min(options.ttlMs ?? DEFAULT_RENEWAL_TTL_MS, MAX_RENEWAL_TTL_MS)
  const newExpires = new Date(now + ttl).toISOString()
  const out = writePlanClaim({
    planPath: options.planPath,
    claim,
    expires: newExpires,
    lawCtx: options.lawCtx,
    io,
    now: options.clock,
  })
  if (out.status !== 'written') {
    return { planPath: options.planPath, status: out.status === 'denied' ? 'denied' : 'failed', detail: `writer ${out.status}: ${out.reason ?? ''}` }
  }
  return { planPath: options.planPath, status: 'renewed', detail: `claim-expires extended to ${newExpires} (bounded window ${Math.round(ttl / 60000)}min, P2-1)` }
}

// ── the dispatcher (one trigger hit → one exit) ──────────────────────────────

export async function executeTriggerHit(hit: TriggerHit, opts: ExecArmOptions): Promise<ExecOutcome> {
  switch (hit.action) {
    case 'mechanical-verification':
      return runMechanicalVerification(hit, opts)
    case 'closure-audit':
      return dispatchClosureAudit(hit, opts)
    case 'plan-review':
      return dispatchPlanReview(hit, opts)
    case 'deep-audit':
      return dispatchDeepAudit(hit, opts)
    case 'draft-plans':
      return dispatchDraftPlans(hit, opts)
    case 'reclaim-claim':
      return reclaimClaim(hit, opts)
    default:
      if (hit.action.startsWith('terminal:')) return forwardTerminalDecision(hit, opts)
      if (hit.action === 'trigger-parse-error') {
        opts.receipt({ kind: 'exception', runId: opts.runId ?? 'mdsupervisor', plan: hit.target, event: 'trigger-parse-error', detail: `${hit.reason} (${hit.errors.join('; ')})` })
        return { action: hit.action, status: 'skipped', detail: 'unparseable trigger recorded, inert' }
      }
      opts.receipt({ kind: 'exception', runId: opts.runId ?? 'mdsupervisor', plan: hit.target, event: 'unknown-trigger-action', detail: hit.action })
      return { action: hit.action, status: 'skipped', detail: 'unknown trigger action' }
  }
}

export { defaultVerifyKeys }
