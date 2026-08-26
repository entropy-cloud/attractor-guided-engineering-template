/**
 * recovery.ts — supervisor crash-recovery scan executor (age-autonomy M3-WI29,
 * plan `docs/plans/age-autonomy/2026-08-26-1954-2`; 03-supervisor §6).
 *
 * The restart duty's ACTION face: start() labels its first cycle 'recovery'
 * (./watchdog.ts); this module owns what that label ADDS over a normal cycle.
 * The recovery disposition table (03 §6 changelog, plan Phase 1 Decision 3):
 *
 *   ① plan carries a claim            — TTL unexpired: no action (natural
 *      expiry reclaims; a dead session never renews — no activity signal);
 *      TTL expired: the EXISTING reclaim trigger face (1411-2, evaluated on
 *      every cycle, recovery included — alignment note, not re-implemented).
 *   ② dispatch line without conclusion — THIS module: stale judgment
 *      (conclusion missing × agents face reports the target session
 *      unrecoverable) → resume (original session followup injection, no new
 *      line) ∨ redispatch (a NEW dispatch line for the same occurrence; the
 *      old line stays append-only per 01 §4.2 — never deleted or edited).
 *   ③ awaitingClosure stagnation      — the existing mechanical-verification
 *      / closure-audit trigger faces (1411-2).
 *
 * Engine-side run-state orphans belong to `reap-orphans.mjs` (engine face,
 * zero engine diff by this plan); DSH-form LiveRunRecord memory state dies
 * with the host process (ActiveRunGuard restart-clears precedent).
 *
 * ── Latest-line semantics (ONE face with the law lease + dedup answers) ─────
 * For every occurrence the LAST valid dispatch line by line order is the live
 * one: it answers the occurrence idempotency face
 * (dispatch-resolve.ts dispatchAlreadyRegistered), holds the review lease
 * (law-rules.mjs writer-identity), and is the session whose liveness decides
 * resume-or-redispatch here. Superseded earlier lines (a crash-orphaned
 * dispatch whose session died and got redispatched) hold nothing.
 *
 * ── Idempotency (03 §5) ─────────────────────────────────────────────────────
 * Per-mount `handled` set keyed by `<target>#<occurrenceType>`: one recovery
 * action (resume nudge / redispatch / degraded observation) per occurrence
 * per mount — a second recovery cycle in the same mount performs ZERO
 * duplicate actions. Across restarts the set clears; a still-unconcluded
 * live session may be nudged again (a benign nudge, never a dispatch
 * duplication — the ledger line is the at-most-once face).
 *
 * ── failures non-counting (02 §4.6, 03 §6 "不把单次崩溃计为计划失败") ────────
 * No path in this module touches recordPlanFailure: a crash redispatch is
 * not a plan failure — the crash was already metered (or was infrastructure
 * noise) at its attribution point, if at all.
 *
 * ── deep-audit zero-increment redispatch (01 §3.1) ───────────────────────────
 * A same-occurrence deep-audit redispatch reuses the paid round number (the
 * id's iter segment), writes NO audit-rounds increment, and is exempt from
 * the budget pre-check re-entry: the crashed attempt already paid the
 * increment, so a re-entry would double-count AND deadlock (budget exhausted
 * → pre-check deny → the dead in-flight occurrence never re-dispatches).
 * The audit-rounds-overflow law gate carries the matching structural
 * exemption (same-round redispatch of an unpaired in-flight line consumes no
 * budget).
 *
 * ── Headless degradation ────────────────────────────────────────────────────
 * Without an agents face the stale judgment is UNDECIDABLE (liveness cannot
 * be queried): the recovery scan records one observation receipt per
 * occurrence and performs no action (the explicit degraded posture — the
 * ledger keeps the in-flight fact; a later mounted host with an agents face
 * recovers it).
 */
import { parseLedgerId, scanPlanLedger, scanRoadmapLedger } from '../../assets/src/ledger-sections.mjs'
import type { MissionLawContext } from '../law/host-adapter.ts'
import { appendSectionLines, fsMeterWriterIo, type MeterWriterIo } from './writer.ts'
import {
  enforceDistinctModel,
  nextCounterOf,
  nextDispatchId,
  resolveDispatch,
  stemOf,
  type DispatchResolution,
  type DispatchType,
  type PolicyFace,
} from './dispatch-resolve.ts'
import { createDispatchAgent, dispatchPromptOf, type DispatchAgentsFace } from './exec-arm.ts'
import { groupScopeOf, type AgentPoolFace } from '../efficiency/agent-pool.ts'
import type { SupervisorSnapshot } from './decision-core.ts'
import type { SupervisorReceiptRecord } from './receipt.ts'

// ── agents face (liveness + resume + redispatch creation) ───────────────────

/** The agents face slice recovery needs: `get` (liveness/resume) + `create` (redispatch). */
export interface RecoveryAgentsFace extends DispatchAgentsFace {
  get(id: string): { followup(message: unknown): void } | undefined
}

export type SessionLiveness = 'live' | 'dead' | 'undecidable'

/**
 * Liveness of one dispatched session. `undecidable` = no agents face (or a
 * face without `get`) — the headless posture: the stale judgment itself is
 * not decidable, so the recovery scan observes without acting.
 */
export function sessionLivenessOf(agents: RecoveryAgentsFace | undefined, sessionId: string): SessionLiveness {
  if (agents === undefined || typeof agents.get !== 'function') return 'undecidable'
  const handle = agents.get(sessionId)
  return handle !== undefined && typeof handle.followup === 'function' ? 'live' : 'dead'
}

// ── stale dispatch detection (pure, over the scanned snapshot) ──────────────

export type RecoveryOccurrenceType = 'review' | 'audit' | 'deep-audit'

export interface StaleDispatchFace {
  /** ledger file carrying the dispatch line (plan path or roadmap path). */
  target: string
  section: 'Draft Review Record' | 'Closure' | 'Deep Audit Record'
  occurrenceType: RecoveryOccurrenceType
  dispatchType: DispatchType
  /** the LAST valid dispatch line (line order) — unpaired = in flight. */
  id: string
  sessionId: string
  /** deep-audit: the paid round (id iter segment) reused by the redispatch id. */
  paidRound: number | null
}

interface DispatchLineFace {
  id: string
  sessionId: string
  valid: boolean
}

function lastInFlightDispatch(
  dispatches: DispatchLineFace[],
  pairs: string[],
): (DispatchLineFace & { paidRound: number | null }) | null {
  const valid = dispatches.filter((d) => d.valid && typeof d.id === 'string')
  if (valid.length === 0) return null
  const last = valid[valid.length - 1]!
  // latest-line semantics: a paired last line = occurrence concluded —
  // superseded earlier unpaired lines hold nothing (lease + dedup agree).
  if (pairs.includes(last.id)) return null
  const parsed = parseLedgerId(last.id)
  return { ...last, paidRound: parsed !== null ? parsed.iter : null }
}

/**
 * Scan the snapshot for in-flight (conclusion-missing) dispatch occurrences.
 * Pure; the caller decides liveness/resume/redispatch. Only the LATEST valid
 * dispatch line per section is considered — the resume-or-redispatch target.
 */
export function scanStaleDispatches(snapshot: SupervisorSnapshot): StaleDispatchFace[] {
  const out: StaleDispatchFace[] = []
  for (const record of snapshot.plans) {
    const scan = scanPlanLedger(record.text) as {
      draftReviewRecord: { dispatches: DispatchLineFace[]; pairs: string[] } | null
      closure: { dispatches: DispatchLineFace[]; pairs: string[] } | null
    }
    const review = scan.draftReviewRecord !== null ? lastInFlightDispatch(scan.draftReviewRecord.dispatches, scan.draftReviewRecord.pairs) : null
    if (review !== null) {
      out.push({
        target: record.path,
        section: 'Draft Review Record',
        occurrenceType: 'review',
        dispatchType: 'plan-review',
        id: review.id,
        sessionId: review.sessionId,
        paidRound: review.paidRound,
      })
    }
    const audit = scan.closure !== null ? lastInFlightDispatch(scan.closure.dispatches, scan.closure.pairs) : null
    if (audit !== null) {
      out.push({
        target: record.path,
        section: 'Closure',
        occurrenceType: 'audit',
        dispatchType: 'closure-audit',
        id: audit.id,
        sessionId: audit.sessionId,
        paidRound: audit.paidRound,
      })
    }
  }
  if (snapshot.roadmap !== null) {
    const scan = scanRoadmapLedger(snapshot.roadmap.text) as {
      deepAuditRecord: { dispatches: DispatchLineFace[]; pairs: string[] } | null
    }
    const dar = scan.deepAuditRecord !== null ? lastInFlightDispatch(scan.deepAuditRecord.dispatches, scan.deepAuditRecord.pairs) : null
    if (dar !== null) {
      out.push({
        target: snapshot.roadmap.path,
        section: 'Deep Audit Record',
        occurrenceType: 'deep-audit',
        dispatchType: 'deep-audit',
        id: dar.id,
        sessionId: dar.sessionId,
        paidRound: dar.paidRound,
      })
    }
  }
  return out
}

// ── resume prompt (original-session followup injection) ─────────────────────

export function recoveryResumePrompt(options: {
  dispatchType: DispatchType
  target: string
  id: string
  runId: string
}): string {
  const { dispatchType, target, id, runId } = options
  const sectionOf =
    dispatchType === 'plan-review'
      ? "`## Draft Review Record` (the date-iteration conclusion line, same id)"
      : dispatchType === 'closure-audit'
        ? '`## Closure` (the `- accepted <same-id>：…` line, or Closure Findings rework items if rejecting)'
        : '`## Deep Audit Record` (`- accepted <same-id> findings=none|items：…`, 01 §3.3)'
  return [
    `[MISSION_DRIVER:${runId}] supervisor recovery resume ${dispatchType}`,
    '',
    `The supervisor recovered this mission run after a crash. Your dispatched ${dispatchType} has NOT concluded:`,
    `  dispatch line: ${id} (target \`${target}\`)`,
    'The dispatch line is still registered to your session — continue the task per the original instructions and',
    `append ONLY your conclusion to the target's ${sectionOf}.`,
    'No new dispatch was issued; you remain the registered reviewer/auditor for this occurrence.',
  ].join('\n')
}

// ── the recovery scan executor ───────────────────────────────────────────────

export type RecoveryOutcome = {
  target: string
  occurrenceType: RecoveryOccurrenceType
  action: 'resume' | 'redispatch' | 'observe'
  status: 'resumed' | 'redispatched' | 'degraded' | 'skipped' | 'refused' | 'failed'
  detail: string
}

export interface RecoveryScanOptions {
  projectRoot: string
  lawCtx: MissionLawContext
  snapshot: SupervisorSnapshot
  /** agents face (liveness + resume + redispatch creation); absent ⇒ degraded observation. */
  agents: RecoveryAgentsFace | undefined
  /** per-mount handled-occurrence set (one action per occurrence per mount). */
  handled: Set<string>
  /**
   * M4-WI32: the mount's agent pool — the attemptId generation face
   * (04 §2.3): a LIVE session whose pooled attempt is stale (rotated /
   * TTL-disposed / revoked) is NOT resumed — cross-generation means
   * redispatch. Absent ⇒ the WI29 liveness-only judgment (unchanged).
   */
  pool?: AgentPoolFace
  /** run executor session ids — the auditor ≠ executor red line on redispatch. */
  executorSessions?: string[]
  io?: MeterWriterIo
  clock?: () => number
  now?: () => string
  runId?: string
  receipt: (record: Omit<SupervisorReceiptRecord, 'ts'>) => void
  logger?: { info?: (m: string, f?: Record<string, unknown>) => void; warn?: (m: string, f?: Record<string, unknown>) => void }
}

function policyOf(lawCtx: MissionLawContext): PolicyFace {
  return lawCtx.policy as unknown as PolicyFace
}

function existingDispatchIdsOf(text: string | null, section: 'Draft Review Record' | 'Closure' | 'Deep Audit Record'): string[] {
  if (text === null) return []
  if (section === 'Deep Audit Record') {
    const scan = scanRoadmapLedger(text) as { deepAuditRecord: { dispatches: DispatchLineFace[] } | null }
    return (scan.deepAuditRecord?.dispatches ?? []).map((d) => d.id)
  }
  const scan = scanPlanLedger(text) as {
    draftReviewRecord: { dispatches: DispatchLineFace[] } | null
    closure: { dispatches: DispatchLineFace[] } | null
  }
  const dispatches = section === 'Draft Review Record' ? scan.draftReviewRecord?.dispatches : scan.closure?.dispatches
  return (dispatches ?? []).map((d) => d.id)
}

/**
 * Run ONE recovery scan over the snapshot: for every in-flight dispatch
 * occurrence (latest line unpaired) decide liveness → resume ∨ redispatch ∨
 * degraded observation. Fail-soft per occurrence — one failure is an
 * exception receipt, the scan continues.
 */
export async function runRecoveryScan(options: RecoveryScanOptions): Promise<RecoveryOutcome[]> {
  const io = options.io ?? fsMeterWriterIo
  const runId = options.runId ?? 'mdsupervisor'
  const { receipt, logger } = options
  const faces = scanStaleDispatches(options.snapshot)
  const outcomes: RecoveryOutcome[] = []

  for (const face of faces) {
    const occurrenceKey = `${face.target}#${face.occurrenceType}`
    if (options.handled.has(occurrenceKey)) {
      outcomes.push({ target: face.target, occurrenceType: face.occurrenceType, action: 'observe', status: 'skipped', detail: `occurrence ${face.id} already handled this mount — zero duplicate actions (03 §5)` })
      continue
    }
    const liveness = sessionLivenessOf(options.agents, face.sessionId)

    // M4-WI32 generation face (04 §2.3): same generation (current pool
    // member) → resume is legal; cross-generation (rotated / TTL-disposed /
    // revoked attempt) → redispatch EVEN when the host session is live —
    // the old attempt is explicitly revoked, never resumed. A session the
    // pool never knew (fresh audits / pre-pool reviewers) has no generation
    // face: the WI29 liveness judgment alone decides (unchanged).
    const staleGeneration = options.pool !== undefined && options.pool.attemptStale(face.sessionId)

    if (liveness === 'undecidable') {
      options.handled.add(occurrenceKey)
      receipt({
        kind: 'observation',
        runId,
        plan: face.section === 'Deep Audit Record' ? null : face.target,
        event: 'recovery-observe',
        detail: `dispatch ${face.id} (${face.occurrenceType}) un-concluded but no agents face — session liveness undecidable, no action (headless degradation, 03 §6)`,
      })
      outcomes.push({ target: face.target, occurrenceType: face.occurrenceType, action: 'observe', status: 'degraded', detail: 'liveness undecidable — observation only' })
      continue
    }

    if (liveness === 'live' && !staleGeneration) {
      const handle = options.agents!.get(face.sessionId)!
      try {
        handle.followup({
          content: [{ type: 'text', text: recoveryResumePrompt({ dispatchType: face.dispatchType, target: face.target, id: face.id, runId }) }],
          source: { kind: 'user' },
        })
        options.handled.add(occurrenceKey)
        receipt({
          kind: 'observation',
          runId,
          plan: face.section === 'Deep Audit Record' ? null : face.target,
          event: 'recovery-resume',
          detail: `dispatch ${face.id} session ${face.sessionId} live — original session resumed via followup (no new dispatch line, 03 §6)`,
        })
        outcomes.push({ target: face.target, occurrenceType: face.occurrenceType, action: 'resume', status: 'resumed', detail: `resumed ${face.sessionId}` })
      } catch (err) {
        // a throwing followup never breaks the scan (A8 discipline)
        options.handled.add(occurrenceKey)
        receipt({
          kind: 'exception',
          runId,
          plan: face.section === 'Deep Audit Record' ? null : face.target,
          event: 'recovery-resume-failed',
          detail: err instanceof Error ? err.message : String(err),
        })
        outcomes.push({ target: face.target, occurrenceType: face.occurrenceType, action: 'resume', status: 'failed', detail: 'followup threw (isolated)' })
      }
      continue
    }

    // dead → redispatch (new dispatch line, same occurrence; old line stays)
    // stale-generation live → the SAME redispatch face: the explicitly
    // revoked attempt must never be resumed (04 §2.3 cross-generation leg)
    if (staleGeneration) {
      options.pool!.revoke(face.sessionId, `recovery: cross-generation attempt of session ${face.sessionId} — explicitly revoked, redispatched (04 §2.3)`)
    }
    try {
      const outcome = await redispatchOccurrence(face, options, io, runId)
      options.handled.add(occurrenceKey)
      outcomes.push(outcome)
    } catch (err) {
      options.handled.add(occurrenceKey)
      const detail = err instanceof Error ? err.message : String(err)
      receipt({ kind: 'exception', runId, plan: face.section === 'Deep Audit Record' ? null : face.target, event: 'recovery-redispatch-failed', detail })
      outcomes.push({ target: face.target, occurrenceType: face.occurrenceType, action: 'redispatch', status: 'failed', detail })
    }
  }
  if (faces.length > 0) {
    logger?.info?.(`[mdsupervisor] recovery scan: ${faces.length} in-flight occurrence(s) — ${outcomes.filter((o) => o.status === 'redispatched').length} redispatched, ${outcomes.filter((o) => o.status === 'resumed').length} resumed`, { projectRoot: options.projectRoot })
  }
  return outcomes
}

async function redispatchOccurrence(
  face: StaleDispatchFace,
  options: RecoveryScanOptions,
  io: MeterWriterIo,
  runId: string,
): Promise<RecoveryOutcome> {
  const { receipt } = options
  const text = io.readTextFile(face.target)
  if (text === null) {
    receipt({ kind: 'exception', runId, plan: face.section === 'Deep Audit Record' ? null : face.target, event: 'recovery-redispatch-failed', detail: `target ${face.target} unreadable` })
    return { target: face.target, occurrenceType: face.occurrenceType, action: 'redispatch', status: 'failed', detail: 'target unreadable' }
  }

  // resolve + enforce the SAME dispatch floor the exec arm applies
  const planAgent =
    face.section === 'Deep Audit Record'
      ? null
      : (() => {
          const scan = scanPlanLedger(text) as { fm: Record<string, unknown> | null }
          const agent = scan.fm?.agent
          return typeof agent === 'string' ? agent : null
        })()
  const resolved = resolveDispatch({ dispatchType: face.dispatchType, policy: policyOf(options.lawCtx), planAgent })
  if (!resolved.ok) {
    receipt({ kind: 'exception', runId, plan: face.section === 'Deep Audit Record' ? null : face.target, event: 'recovery-redispatch-refused', detail: resolved.reason })
    return { target: face.target, occurrenceType: face.occurrenceType, action: 'redispatch', status: 'refused', detail: resolved.reason }
  }
  const executorResolved = resolveDispatch({ dispatchType: 'execute', policy: policyOf(options.lawCtx) })
  const executorBinding = executorResolved.ok ? executorResolved.resolution.binding : resolved.resolution.binding
  const enforcement = enforceDistinctModel({ dispatchType: face.dispatchType, policy: policyOf(options.lawCtx), resolution: resolved.resolution, executorBinding })
  if (enforcement.status === 'refused') {
    receipt({ kind: 'exception', runId, plan: face.section === 'Deep Audit Record' ? null : face.target, event: 'recovery-redispatch-refused', detail: enforcement.reason })
    return { target: face.target, occurrenceType: face.occurrenceType, action: 'redispatch', status: 'refused', detail: enforcement.reason }
  }

  // new session first (the line carries its id); agents face is present —
  // liveness was decidable — so this is the full (non-degraded) path.
  // M4-WI32: this direct createDispatchAgent call rides the pool hook
  // inside it (plan Phase 2 — no bypass hole): a plan-review redispatch
  // re-enters the reviewer:{groupId} pool; audits stay structurally fresh.
  let handle: { sessionId: string; followup: (text: string) => void }
  try {
    const agentOut = await createDispatchAgent(options.agents!, resolved.resolution.binding, {
      projectRoot: options.projectRoot,
      label: `Mission recovery: ${face.dispatchType}`,
      ...(options.pool !== undefined ? { pool: options.pool } : {}),
      dispatchType: face.dispatchType,
      ...(face.dispatchType === 'plan-review' ? { groupId: groupScopeOf(face.target, text) } : {}),
      ...(options.executorSessions !== undefined ? { executorSessions: options.executorSessions } : {}),
      policy: policyOf(options.lawCtx),
    })
    if (agentOut.status === 'refused') {
      receipt({ kind: 'exception', runId, plan: face.section === 'Deep Audit Record' ? null : face.target, event: 'recovery-redispatch-refused', detail: agentOut.reason })
      return { target: face.target, occurrenceType: face.occurrenceType, action: 'redispatch', status: 'refused', detail: agentOut.reason }
    }
    handle = { sessionId: agentOut.sessionId, followup: agentOut.followup }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    receipt({ kind: 'exception', runId, plan: face.section === 'Deep Audit Record' ? null : face.target, event: 'recovery-redispatch-failed', detail })
    return { target: face.target, occurrenceType: face.occurrenceType, action: 'redispatch', status: 'failed', detail }
  }

  // id: deep-audit REUSES the paid round (01 §3.1 no double increment);
  // plan-level dispatches take the next iteration counter (fresh unique id)
  const existingIds = existingDispatchIdsOf(text, face.section)
  const kind = face.section === 'Draft Review Record' ? 'review' : 'audit'
  const counter =
    face.occurrenceType === 'deep-audit' && face.paidRound !== null
      ? face.paidRound
      : nextCounterOf(existingIds, `#${kind}-${runId}-`)
  const id = nextDispatchId({ kind, runId, stem: stemOf(face.target), counter })

  // ONE atomic write: the new dispatch line only — NO audit-rounds increment
  // (the crashed attempt already paid), NO budget re-entry (the law gate's
  // same-round redispatch exemption covers the exhausted-budget deadlock)
  const write = appendSectionLines({
    path: face.target,
    section: face.section,
    lines: [face.occurrenceType === 'review' ? `- dispatch review ${id} to ${handle.sessionId}` : `- dispatch audit ${id} to ${handle.sessionId}${enforcement.lineage}`],
    lawCtx: options.lawCtx,
    io,
    now: options.clock,
  })
  if (write.status !== 'written') {
    receipt({
      kind: 'exception',
      runId,
      plan: face.section === 'Deep Audit Record' ? null : face.target,
      event: 'recovery-redispatch-failed',
      detail: `writer ${write.status}: ${write.reason ?? ''} (old line ${face.id} preserved append-only)`,
    })
    return { target: face.target, occurrenceType: face.occurrenceType, action: 'redispatch', status: 'failed', detail: `registration write ${write.status}` }
  }

  handle.followup(dispatchPromptOf({ dispatchType: face.dispatchType, target: face.target, registeredId: id, runId }))
  receipt({
    kind: 'observation',
    runId,
    plan: face.section === 'Deep Audit Record' ? null : face.target,
    event: 'recovery-redispatch',
    detail: `${face.id} → session ${face.sessionId} unrecoverable — occurrence redispatched as ${id} to ${handle.sessionId} (old line preserved append-only;${face.occurrenceType === 'deep-audit' ? ' audit-rounds NOT re-incremented — the crashed attempt paid the round, 01 §3.1;' : ''} not counted as a plan failure, 02 §4.6)`,
  })
  return {
    target: face.target,
    occurrenceType: face.occurrenceType,
    action: 'redispatch',
    status: 'redispatched',
    detail: `${face.id} → ${id} to ${handle.sessionId}`,
  }
}
