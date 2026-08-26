/**
 * agent-pool.ts — the efficiency-layer agent pool (age-autonomy M4-WI32,
 * plan `docs/plans/age-autonomy/2026-08-27-0433-2`; 04-efficiency §2).
 *
 * ROLE POOLS (04 §2.1): `drafter:{projectRoot}` long-lived reuse,
 * `reviewer:{groupId}` same-batch reuse (04 §2.2: the group is the MAXIMAL
 * reuse granularity — cross-group always starts fresh, killing cross-batch
 * judgment pollution). Pool members are host continuable subagent handles
 * (acquired through the agents face): create-on-first-use, followup reuse,
 * idle-TTL dispose (a Node timer through the injectable timers face; the
 * watchdog mount parks the pool disposer on its own ctx.effect-parked
 * stop — the heartbeat-timer precedent), rotateEvery count rotation, crash
 * recovery by persistent session (the liveness three-state below).
 *
 * GENERATION TOKENS (04 §2.3): every dispatch carries an attemptId
 * generation token; takeover/resume verifies the generation FIRST — a stale
 * attempt is explicitly revoked. Same generation → reuse (followup);
 * cross-generation → redispatch (+ member removal). `attemptStale()` is the
 * single judgment face the WI29 recovery scan consumes.
 *
 * INDEPENDENCE RED LINES (04 §2.4 P7 + final-review P2-5):
 *   - closure-audit / deep-audit (multi-audit = the deep-audit prompt-file
 *     face, covered with it) are STRUCTURALLY banned from every pool
 *     regardless of the agent `mode` config — the pool layer hard-refuses
 *     (bypass + honest note); independent audits always dispatch fresh.
 *   - role mutex: one continuable subagent is never simultaneously drafter
 *     and reviewer/auditor (session-role registry; a conflicting dispatch
 *     is refused, never silently reassigned).
 *   - same-run auditor session ≠ any executor session (executor set = the
 *     run's plan claim holders derived from ledger frontmatter ∪ the
 *     pool-registered executor tags; validated at audit dispatch time).
 *
 * EXECUTOR POOLING IS DECLARED BUT DORMANT (plan baseline ruling, the WI28
 * continuation): plan execution remains the engine-run territory — the
 * `execute` dispatch type bypasses the pool with an explicit note. The
 * `executor: mode pooled` policy declaration stays consumable by the
 * M4-WI33/M5-WI37 successors — declared in the policy, consciously not
 * consumed here, never silently ignored.
 *
 * MEMORY STATE = PERFORMANCE CACHE, NOT STATE AUTHORITY (P2): losing this
 * module's state only loses cache hits — correctness rebuilds entirely
 * from the git ledger (04 §2.1). A restart starts empty by design.
 */
import { basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parseFrontmatter } from '../../assets/src/ledger-frontmatter.mjs'
import { charterHashesDiffer } from './prompt-assembler.ts'
import type { DispatchType } from '../supervisor/dispatch-resolve.ts'

// ── faces ────────────────────────────────────────────────────────────────────

/**
 * M4-WI33: the per-member prompt-assembly hash ledger face — the caller
 * (exec-arm through the PromptAssembler) reads/writes this Map between
 * dispatches. Shape contract lives in prompt-assembler.ts (file path →
 * hash8, plus the `__sends` compaction counter sentinel).
 */
export type MemberHashLedger = Map<string, string>

/** The timer slice the pool needs (idle-TTL dispose); injectable for tests. */
export interface PoolTimers {
  setTimeout(fn: () => void, ms: number): () => void
}

export const nodePoolTimers: PoolTimers = {
  setTimeout(fn, ms) {
    const h = setTimeout(fn, ms)
    return () => clearTimeout(h)
  },
}

/**
 * The agents-face slice the pool consumes: `create` (member creation, the
 * exec-arm create shape) plus the OPTIONAL `get` (liveness). Liveness
 * semantics mirror recovery.ts `sessionLivenessOf` (same three states,
 * re-declared locally to keep the efficiency layer free of a supervisor
 * import cycle): no `get` face ⇒ undecidable ⇒ reuse (benign — the member
 * cannot be proven dead), a returned followup handle ⇒ live, else dead.
 */
export interface PoolAgentsFace {
  create(options: {
    sessionId?: string
    meta?: Record<string, unknown>
    agentOptions?: { provider: string; model: string }
  }): Promise<{ agent: { id: unknown; followup: (message: unknown) => void } }>
  get?(id: string): { followup(message: unknown): void } | undefined
}

function livenessOf(agents: PoolAgentsFace, sessionId: string): 'live' | 'dead' | 'undecidable' {
  if (typeof agents.get !== 'function') return 'undecidable'
  const handle = agents.get(sessionId)
  return handle !== undefined && typeof handle.followup === 'function' ? 'live' : 'dead'
}

export type PoolRole = 'drafter' | 'reviewer' | 'executor' | 'auditor'

/** The P7 ban set: dispatch types structurally banned from every pool (04 §2.4). */
export const POOL_BANNED_DISPATCH_TYPES: readonly DispatchType[] = ['closure-audit', 'deep-audit']

/** The dormant set: declared pooled but runtime-bypassed by the plan ruling. */
export const POOL_DORMANT_DISPATCH_TYPES: readonly DispatchType[] = ['execute']

/** The dispatch types the pool actually serves. */
export const POOL_SERVED_DISPATCH_TYPES: readonly DispatchType[] = ['plan-review', 'draft-plans']

export const POOL_ROLE_OF_DISPATCH_TYPE: Record<string, PoolRole> = {
  'plan-review': 'reviewer',
  'draft-plans': 'drafter',
  execute: 'executor',
  'closure-audit': 'auditor',
  'deep-audit': 'auditor',
}

export const DEFAULT_IDLE_TTL_MINUTES = 30

/** One continuable subagent never both drafter and reviewer/auditor (P2-5). */
function rolesConflict(a: PoolRole, b: PoolRole): boolean {
  const drafterSide = (x: PoolRole, y: PoolRole) => x === 'drafter' && (y === 'reviewer' || y === 'auditor')
  return drafterSide(a, b) || drafterSide(b, a)
}

// ── policy def face + pool config resolution ─────────────────────────────────

export interface PoolAgentDefFace {
  mode?: unknown
  poolKey?: unknown
  idleTtlMinutes?: unknown
  rotateEvery?: unknown
  /** M4-WI33: the fixedPrefix blocks (law-policy FIXED_PREFIX shape). */
  fixedPrefix?: unknown
}

export interface PoolPolicyFace {
  agents?: Record<string, PoolAgentDefFace> | undefined
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** The pool-relevant slice of one policy agent def (null when absent). */
export function poolAgentDefOf(policy: PoolPolicyFace | undefined, agentName: string): PoolAgentDefFace | null {
  if (policy === undefined || !isPlainObject(policy.agents)) return null
  const def = (policy.agents as Record<string, unknown>)[agentName]
  return isPlainObject(def) ? (def as PoolAgentDefFace) : null
}

export interface ResolvedPoolConfig {
  poolKey: string
  idleTtlMinutes: number
  rotateEvery: number | null
}

/**
 * Resolve one agent def's pool config with placeholder substitution:
 * `{projectRoot}` → the mount root; `{groupId}` → the dispatch's group
 * scope (04 §2.2 / 01 §2 frontmatter `group:`, filename timestamp prefix
 * fallback). Pure; never throws.
 */
export function resolvePoolConfig(options: {
  def: PoolAgentDefFace
  projectRoot: string
  groupId?: string | null
}): { ok: true; config: ResolvedPoolConfig } | { ok: false; reason: string } {
  const template = typeof options.def.poolKey === 'string' ? options.def.poolKey : ''
  if (template === '') return { ok: false, reason: 'agent def carries no poolKey' }
  let poolKey = template.replaceAll('{projectRoot}', options.projectRoot)
  if (poolKey.includes('{groupId}')) {
    if (options.groupId === null || options.groupId === undefined || options.groupId === '') {
      return { ok: false, reason: `poolKey template "${template}" needs {groupId} but no group scope resolved` }
    }
    poolKey = poolKey.replaceAll('{groupId}', options.groupId)
  }
  const idleTtlMinutes = typeof options.def.idleTtlMinutes === 'number' && options.def.idleTtlMinutes > 0 ? options.def.idleTtlMinutes : DEFAULT_IDLE_TTL_MINUTES
  const rotateEvery = typeof options.def.rotateEvery === 'number' && options.def.rotateEvery > 0 ? options.def.rotateEvery : null
  return { ok: true, config: { poolKey, idleTtlMinutes, rotateEvery } }
}

// ── group scope (04 §2.2 / 01 §2) ────────────────────────────────────────────

const GROUP_TS_PREFIX_RE = /^(\d{4}-\d{2}-\d{2}-\d{4})/

/**
 * Group scope of one plan: frontmatter `group:` when present; the filename
 * timestamp prefix (same-batch plans share it) is the fallback; the bare
 * stem is the last resort — a plan outside both conventions still pools,
 * just alone.
 */
export function groupScopeOf(planPath: string, planText: string | null): string {
  if (planText !== null) {
    const parsed = parseFrontmatter(planText)
    if (parsed.ok && typeof (parsed.fm as Record<string, unknown>).group === 'string') {
      const group = (parsed.fm as Record<string, unknown>).group as string
      if (group.trim() !== '') return group
    }
  }
  const name = basename(planPath)
  const ts = name.match(GROUP_TS_PREFIX_RE)
  if (ts !== null) return ts[1]!
  return name.replace(/\.(md|json)$/u, '')
}

// ── executor set derivation (auditor ≠ executor red line) ────────────────────

/**
 * The run's executor session set: plan claim holders derived from ledger
 * frontmatter (claim token `attempt-<runId>-<sessionId>-<nonce8>`; the
 * runId-anchored strip, foreign formats skipped — the registry leg covers
 * them) ∪ the pool-registered executor tags.
 */
export function executorSessionsOf(
  plans: Array<{ path: string; text: string }>,
  options: { runId: string; pool?: AgentPoolFace | null },
): string[] {
  const out = new Set<string>()
  for (const plan of plans) {
    const parsed = parseFrontmatter(plan.text)
    if (!parsed.ok) continue
    const claim = (parsed.fm as Record<string, unknown>).claim
    if (typeof claim !== 'string' || !claim.startsWith('attempt-')) continue
    const core = claim.slice('attempt-'.length)
    const middle = core.slice(0, core.length - 9) // strip -<nonce8>
    if (middle.startsWith(`${options.runId}-`)) {
      const sessionId = middle.slice(options.runId.length + 1)
      if (sessionId !== '') out.add(sessionId)
    }
  }
  for (const id of options.pool?.executorSessions() ?? []) out.add(id)
  return [...out]
}

// ── the pool ─────────────────────────────────────────────────────────────────

interface PoolMember {
  sessionId: string
  /** generation of this member within the pool (increments per replacement). */
  generation: number
  /** acquisitions this member already served (rotateEvery counter). */
  served: number
  followup: (text: string) => void
  stopIdleTimer: () => void
  disposed: boolean
  /**
   * M4-WI33: the per-member prompt-assembly hash ledger (04 §3.3) — what
   * this member's session has ALREADY received (charter file → hash8 + the
   * compaction counter). Lives and dies with the member: crash/rotation →
   * the replacement starts empty → its first dispatch is FRESH (the
   * conservative P2 posture — never guess in-session state).
   */
  sentHashes: MemberHashLedger
}

export interface PoolAcquireOutcome {
  status: 'acquired' | 'bypassed' | 'refused'
  sessionId?: string
  /** the attemptId generation token of THIS dispatch (04 §2.3). */
  attemptId?: string
  followup?: (text: string) => void
  reused?: boolean
  /**
   * M4-WI33: the serving member's prompt-assembly hash ledger — the
   * FRESH/CONTINUE judgment input AND the commit target (the caller
   * assembles then commits through prompt-assembler's commitToLedger).
   * Empty map on a fresh member ⇒ FRESH; populated ⇒ CONTINUE candidate.
   */
  sentHashes?: MemberHashLedger
  /** honest note (acquired reuse/rotation lineage; bypassed/refused reason). */
  reason: string
}

export interface AgentPoolFace {
  /**
   * Acquire one continuable subagent for a dispatch: pool routing (P7 ban /
   * dormant / served), config resolution, reuse-or-create, rotation, idle
   * timer re-arm. Never throws — refusals/bypasses ride the outcome.
   *
   * M4-WI33 charter-hash rotation leg (04 §2.2 leg 2): when the caller
   * supplies `currentFileHashes` (the PromptAssembler's charter hash face
   * over the agent's fixedPrefix), a reuse whose member ledger no longer
   * matches forces member rotation — the judgment function is the ONE
   * shared charterHashesDiffer (prompt-assembler.ts; zero second
   * implementation). Absent/null ⇒ no hash judgment (pre-WI33 callers).
   */
  acquire(options: {
    agents: PoolAgentsFace
    dispatchType: DispatchType
    binding: { agentName: string; mode: 'pooled' | 'fresh' | 'unknown'; provider: string; model: string }
    def: PoolAgentDefFace
    projectRoot: string
    groupId?: string | null
    label: string
    /** current charter file hashes (prompt-assembler face; rotation judgment). */
    currentFileHashes?: Map<string, string> | null
  }): Promise<PoolAcquireOutcome>
  /**
   * Register a session's role (the mutex registry — also tags fresh-path
   * dispatch sessions: executor/auditor/reviewer/drafter). A conflicting
   * registration is refused, never merged.
   */
  registerRole(sessionId: string, role: PoolRole): { ok: true } | { ok: false; reason: string }
  rolesOf(sessionId: string): PoolRole[]
  /** sessions carrying the executor role tag (the red-line registry leg). */
  executorSessions(): string[]
  /**
   * Generation judgment (04 §2.3): false = same generation (current member —
   * resume/reuse legal); true = cross-generation (revoked / rotated /
   * TTL-disposed — the old attempt is stale, redispatch). A session never
   * pooled is NOT stale (non-pooled dispatches have no generation face —
   * liveness alone judges them).
   */
  attemptStale(sessionId: string): boolean
  /** Explicitly revoke one session's attempt (stale-attempt face; idempotent). */
  revoke(sessionId: string, reason?: string): void
  stats(): { pools: number; members: number; revoked: number; taggedSessions: number }
  /** Idempotent teardown: timers cleared, members revoked (mount stop face). */
  dispose(): void
}

export function createAgentPool(options: {
  timers?: PoolTimers
  clock?: () => number
  logger?: { info?: (m: string, f?: Record<string, unknown>) => void; warn?: (m: string, f?: Record<string, unknown>) => void }
} = {}): AgentPoolFace {
  const timers = options.timers ?? nodePoolTimers
  const clock = options.clock ?? (() => Date.now())
  const logger = options.logger ?? {}
  const pools = new Map<string, { generation: number; member: PoolMember | null }>()
  const revoked = new Map<string, { poolKey: string; generation: number; at: number; reason: string }>()
  const sessionRoles = new Map<string, Set<PoolRole>>()
  let tornDown = false

  const rolesOf = (sessionId: string): PoolRole[] => [...(sessionRoles.get(sessionId) ?? [])]

  const revokeMember = (poolKey: string, member: PoolMember, reason: string): void => {
    if (member.disposed) return
    member.disposed = true
    member.stopIdleTimer()
    const entry = pools.get(poolKey)
    if (entry !== undefined && entry.member === member) entry.member = null
    revoked.set(member.sessionId, { poolKey, generation: member.generation, at: clock(), reason })
    logger.info?.(`[mdsupervisor] pool member disposed`, { poolKey, sessionId: member.sessionId, generation: member.generation, reason })
  }

  const armIdleTimer = (poolKey: string, member: PoolMember, idleTtlMinutes: number): (() => void) => {
    const ttlMs = Math.max(1, Math.round(idleTtlMinutes)) * 60_000
    return timers.setTimeout(() => {
      revokeMember(poolKey, member, `idle TTL ${idleTtlMinutes}min elapsed — member disposed (04 §2.1)`)
    }, ttlMs)
  }

  const acquire: AgentPoolFace['acquire'] = async (o) => {
    if (POOL_BANNED_DISPATCH_TYPES.includes(o.dispatchType)) {
      return {
        status: 'bypassed',
        reason: `P7 audit ban: ${o.dispatchType} structurally never enters a pool (04 §2.4; multi-audit = the deep-audit prompt-file face, covered) — independent audit dispatches fresh regardless of agent mode config`,
      }
    }
    if (POOL_DORMANT_DISPATCH_TYPES.includes(o.dispatchType)) {
      return {
        status: 'bypassed',
        reason: 'executor pooling declared but dormant (2026-08-27-0433-2 baseline ruling): plan execution stays the engine-run territory — fresh session; the pooled executor declaration remains consumable by the M4-WI33/M5-WI37 successors',
      }
    }
    if (!POOL_SERVED_DISPATCH_TYPES.includes(o.dispatchType)) {
      return { status: 'bypassed', reason: `dispatch type ${o.dispatchType} is not pool-served (plan-review / draft-plans only) — fresh session` }
    }
    if (o.binding.mode !== 'pooled') {
      return { status: 'bypassed', reason: `agent ${o.binding.agentName} mode=${o.binding.mode} — pooling engages only on declared mode: pooled (fresh session)` }
    }
    const role = POOL_ROLE_OF_DISPATCH_TYPE[o.dispatchType]!
    const resolved = resolvePoolConfig({ def: o.def, projectRoot: o.projectRoot, groupId: o.groupId ?? null })
    if (!resolved.ok) {
      return { status: 'bypassed', reason: `pool config unresolvable for agent ${o.binding.agentName}: ${resolved.reason} — fresh session` }
    }
    const { poolKey, idleTtlMinutes, rotateEvery } = resolved.config

    let entry = pools.get(poolKey)
    if (entry === undefined) {
      entry = { generation: 0, member: null }
      pools.set(poolKey, entry)
    }

    const member = entry.member
    if (member !== null && !member.disposed) {
      if (rolesOf(member.sessionId).some((r) => rolesConflict(role, r))) {
        return {
          status: 'refused',
          reason: `role mutex violation: pooled session ${member.sessionId} already carries [${rolesOf(member.sessionId).join(', ')}] — cannot serve ${role} (final-review P2-5: one continuable subagent is never both drafter and reviewer/auditor)`,
        }
      }
      const liveness = livenessOf(o.agents, member.sessionId)
      if (liveness === 'dead') {
        revokeMember(poolKey, member, 'member crash-detected (agents face reports the persistent session unrecoverable — 04 §2.1 crash-recovery face)')
      } else if (rotateEvery !== null && member.served >= rotateEvery) {
        revokeMember(poolKey, member, `rotateEvery ${rotateEvery} dispatches reached — forced rotation (anti-anchoring, 04 §2.2)`)
      } else if (o.currentFileHashes !== undefined && o.currentFileHashes !== null && charterHashesDiffer(o.currentFileHashes, member.sentHashes)) {
        revokeMember(poolKey, member, 'charter hash change — upstream fixedPrefix file added/changed/removed forces a new member (04 §2.2 rotation leg 2, judgment via the PromptAssembler hash face, M4-WI33)')
      } else {
        member.served += 1
        member.stopIdleTimer()
        member.stopIdleTimer = armIdleTimer(poolKey, member, idleTtlMinutes)
        const attemptId = `poolatt-${member.sessionId}-${member.generation}.${member.served}-${randomBytes(4).toString('hex')}`
        return {
          status: 'acquired',
          sessionId: member.sessionId,
          attemptId,
          followup: member.followup,
          reused: true,
          sentHashes: member.sentHashes,
          reason: `pool hit ${poolKey} — session ${member.sessionId} reused (generation ${member.generation}, served ${member.served}; same-generation followup, 04 §2.3)`,
        }
      }
    }

    // create-on-first-use / after rotation-TTL-crash disposal
    const sessionId = `mdsup-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
    const handle = await o.agents.create({
      sessionId,
      meta: { cwd: o.projectRoot, origin: 'subagent', delegationDepth: 1 },
      agentOptions: { provider: o.binding.provider, model: o.binding.model },
    })
    const realId = String(handle.agent.id ?? sessionId)
    if (rolesOf(realId).some((r) => rolesConflict(role, r))) {
      return {
        status: 'refused',
        reason: `role mutex violation: the host handed out session ${realId} for ${o.dispatchType}, already carrying [${rolesOf(realId).join(', ')}] — refusing this dispatch (final-review P2-5; the conflicting session is never adopted)`,
      }
    }
    let tags = sessionRoles.get(realId)
    if (tags === undefined) {
      tags = new Set()
      sessionRoles.set(realId, tags)
    }
    tags.add(role)
    const generation = entry.generation + 1
    entry.generation = generation
    const created: PoolMember = {
      sessionId: realId,
      generation,
      served: 1,
      followup: (text: string) => {
        handle.agent.followup({ content: [{ type: 'text', text }], source: { kind: 'user' } })
      },
      stopIdleTimer: () => {},
      disposed: false,
      sentHashes: new Map<string, string>(),
    }
    created.stopIdleTimer = armIdleTimer(poolKey, created, idleTtlMinutes)
    entry.member = created
    const attemptId = `poolatt-${realId}-${generation}.1-${randomBytes(4).toString('hex')}`
    return {
      status: 'acquired',
      sessionId: realId,
      attemptId,
      followup: created.followup,
      reused: false,
      sentHashes: created.sentHashes,
      reason: `pool miss ${poolKey} — member session ${realId} created (generation ${generation}${member !== null ? ', prior member rotated out' : ''})`,
    }
  }

  const registerRole: AgentPoolFace['registerRole'] = (sessionId, role) => {
    const existing = rolesOf(sessionId)
    if (existing.some((r) => rolesConflict(role, r))) {
      return {
        ok: false,
        reason: `role mutex violation: session ${sessionId} already carries [${existing.join(', ')}] — cannot register ${role} (final-review P2-5: one continuable subagent is never both drafter and reviewer/auditor)`,
      }
    }
    let tags = sessionRoles.get(sessionId)
    if (tags === undefined) {
      tags = new Set()
      sessionRoles.set(sessionId, tags)
    }
    tags.add(role)
    return { ok: true }
  }

  const attemptStale = (sessionId: string): boolean => {
    for (const entry of pools.values()) {
      if (entry.member !== null && !entry.member.disposed && entry.member.sessionId === sessionId) return false
    }
    return revoked.has(sessionId)
  }

  const revoke = (sessionId: string, reason?: string): void => {
    const why = reason ?? 'attempt explicitly revoked (stale generation, 04 §2.3)'
    for (const [poolKey, entry] of pools) {
      if (entry.member !== null && entry.member.sessionId === sessionId) {
        revokeMember(poolKey, entry.member, why)
        return
      }
    }
    if (!revoked.has(sessionId)) {
      revoked.set(sessionId, { poolKey: '', generation: 0, at: clock(), reason: why })
    }
  }

  return {
    acquire,
    registerRole,
    rolesOf,
    executorSessions() {
      const out: string[] = []
      for (const [sessionId, roles] of sessionRoles) {
        if (roles.has('executor')) out.push(sessionId)
      }
      return out
    },
    attemptStale,
    revoke,
    stats() {
      let members = 0
      for (const entry of pools.values()) {
        if (entry.member !== null && !entry.member.disposed) members += 1
      }
      return { pools: pools.size, members, revoked: revoked.size, taggedSessions: sessionRoles.size }
    },
    dispose() {
      if (tornDown) return
      tornDown = true
      for (const [poolKey, entry] of pools) {
        if (entry.member !== null) revokeMember(poolKey, entry.member, 'pool disposed (mount teardown — timers cleared, members revoked)')
      }
    },
  }
}
