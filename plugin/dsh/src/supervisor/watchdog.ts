/**
 * watchdog.ts — the supervisor watchdog loop (age-autonomy M3-WI25, plan
 * `docs/plans/age-autonomy/2026-08-26-1411-1` Phase 2; 03-supervisor §3).
 *
 * Loop body: scan ledger → decide (pure core) → execute decisions → sleep.
 * 99% idle; every cycle is deterministic over the scanned snapshot.
 *
 * Three liveness edges (03 §3), mutually redundant:
 *   1. heartbeat — an interval timer (DEFAULT_HEARTBEAT_MS = 30s, config
 *      adjustable; plan Phase 1 Decision 3). Execution note: cordis 4.0.1
 *      core ships no timer face and cordis-plugin-timer would be a NEW npm
 *      dependency (forbidden by this plan's zero-new-deps exit criterion),
 *      so the heartbeat rides a Node interval whose disposer is parked via
 *      ctx.effect in the service mount — lifetime IS the cordis context.
 *   2. event edge — fs watchers on plansDir (recursive) + the roadmap
 *      directory, debounced (DEFAULT_DEBOUNCE_MS = 300); a watcher failure
 *      degrades to heartbeat-only (a warn, never a mount failure).
 *   3. terminal-receipt chain — the onTerminal hook seam (declared here;
 *      consumption = 1411-2 dispatch wiring / 1411-3 terminal rules).
 *
 * Single-flight guard: at most one scan executes at any moment; a trigger
 * arriving mid-scan coalesces into ONE pending follow-up cycle (no event/
 * heartbeat re-entry pileup).
 *
 * Restart seam (03 §6): start() runs one immediate cycle labeled as the
 * recovery scan. Since M3-WI29 the recovery label CARRIES the restart
 * duty's action face: before the normal trigger evaluation, the cycle runs
 * ./recovery.ts runRecoveryScan — un-concluded dispatch occurrences
 * (conclusion missing × agents face liveness) are resumed (original session
 * followup) or redispatched (a NEW dispatch line, old line append-only);
 * expired-claim reclaim keeps flowing through the existing reclaim trigger
 * (evaluated on every cycle, recovery included).
 *
 * Default posture (plan Phase 1 Decision 3 + M3-WI26): decisions of type
 * dispatch WITHOUT a trigger payload (policies without a `triggers:`
 * section) are never dispatched — observation receipts only, existing hosts
 * gain no unattended progression. When the governing policy carries a
 * `triggers:` section, decide() emits execute-posture trigger hits and this
 * loop routes them through the execution arm (./exec-arm.ts — M3-WI26): the
 * arm is fail-soft, one arm exception is an exception receipt and the loop
 * continues.
 *
 * M3-WI27 terminal wiring (03 §8): after the decision execution, every cycle
 * runs the circuit breaker (02 §4.6, ./failures.ts) and then the R1–R4
 * evaluation core (./terminal-rules.ts) over a fresh scan — a terminal word
 * lands the run-terminal receipt + the A8 best-effort delivery + the
 * onTerminal hooks, exposes through statusFace().terminal (the
 * mdcontrol.status passthrough), and suppresses every subsequent
 * execute-posture hit for this mission run (stop-dispatch). Sticky per mount;
 * across restarts the same scan re-derives the same word (no new store).
 * The declared R3 trigger exit reaches the same state through the exec arm's
 * onTerminalWord callback — dual entry, one core.
 *
 * M3-WI28 continuous mode (03 §4): per-root in-memory opt-in flag, default
 * OFF — while off, dispatch decisions downgrade to observation receipts
 * (applyContinuousGate, ./decision-core.ts); meter/receipt decisions stay
 * ungated. With the flag ON, every terminal event through the onTerminal
 * seam chains ONE immediate re-evaluation cycle (03 §3 edge 2: run 终态 →
 * 立即评估 → 派发下一个; single-flight guarded, heartbeat stays the misfire
 * backstop). The flag clears on restart (ActiveRunGuard precedent); the
 * mdcontrol.continuous route (mdcontrol-routes.ts) toggles it and registers
 * the enabling session as the run-terminal receipt target.
 */
import { dirname, join } from 'node:path'
import { watch, type FSWatcher } from 'node:fs'
import {
  applyContinuousGate,
  decide,
  policyFaceOf,
  scanSupervisorSnapshot,
  type SupervisorDecision,
  type SupervisorSnapshot,
} from './decision-core.ts'
import { evaluateTermination, type StagnationFact, type TerminationEvaluation } from './terminal-rules.ts'
import { applyCircuitBreaker } from './failures.ts'
import { initialStagnationState, observeStagnation, type StagnationDetectorState } from './stagnation.ts'
import {
  appendReceipt,
  deliverReceiptLine,
  readReceipts,
  receiptFileFor,
  type ReceiptAgentsFace,
  type ReceiptIo,
  type SupervisorReceiptRecord,
} from './receipt.ts'
import {
  executeTriggerHit,
  renewClaim,
  type DispatchAgentsFace,
  type ExecArmOptions,
} from './exec-arm.ts'
import type { TriggerHit } from './trigger-eval.ts'
import { runRecoveryScan, type RecoveryAgentsFace } from './recovery.ts'
import { createAgentPool, executorSessionsOf, type AgentPoolFace } from '../efficiency/agent-pool.ts'
import { discoverLawContext, fsLawGateIo, type LawGateIo, type MissionLawContext } from '../law/host-adapter.ts'
import { parseFrontmatter } from '../../assets/src/ledger-frontmatter.mjs'
import { fsMeterWriterIo } from './writer.ts'

export const DEFAULT_HEARTBEAT_MS = 30_000
export const DEFAULT_DEBOUNCE_MS = 300

export interface WatchdogLogger {
  info?(message: string, fields?: Record<string, unknown>): void
  warn?(message: string, fields?: Record<string, unknown>): void
}

export interface WatchdogTimers {
  /** fire fn every ms; returns the canceler */
  setInterval(fn: () => void, ms: number): () => void
  /** fire fn once after ms; returns the canceler */
  setTimeout(fn: () => void, ms: number): () => void
}

export const nodeTimers: WatchdogTimers = {
  setInterval(fn, ms) {
    const h = setInterval(fn, ms)
    return () => clearInterval(h)
  },
  setTimeout(fn, ms) {
    const h = setTimeout(fn, ms)
    return () => clearTimeout(h)
  },
}

export interface WatchdogWatchIo extends LawGateIo {
  /** recursive directory watcher; null when watching is unavailable. */
  watchDir(dir: string, onEvent: () => void): (() => void) | null
}

export const fsWatchIo: Pick<WatchdogWatchIo, 'watchDir'> = {
  watchDir(dir, onEvent) {
    try {
      const watcher: FSWatcher = watch(dir, { recursive: true }, () => onEvent())
      return () => watcher.close()
    } catch {
      return null
    }
  },
}

/** The event the onTerminal seam carries (1411-2/1411-3 consume it). */
export interface SupervisorTerminalEvent {
  ts: string
  runId: string | null
  kind: 'run-terminal' | 'plan-terminal'
  status: string
  plan: string | null
  /** structured reasons (M3-WI27 run-terminal face; the R1–R4 evaluation lines). */
  detail?: string
}

export type OnTerminalHook = (event: SupervisorTerminalEvent) => void

/** The reached terminal state (03 §8; sticky per mount, re-derived across restarts). */
export interface WatchdogTerminalState {
  word: 'completed' | 'partial' | 'blocked'
  rule: 'R1' | 'R2' | 'R3' | 'R4' | null
  at: string
  source: 'cycle' | 'declared-face'
  reasons: string[]
}

export type WatchdogStatusFace = {
  mounted: boolean
  mountedAt: string | null
  heartbeatMs: number
  scans: number
  lastScanAt: string | null
  lastDecisions: number
  receipts: SupervisorReceiptRecord[]
  /** M3-WI27: the reached terminal word + rule (null while the run continues). */
  terminal: WatchdogTerminalState | null
  /** M3-WI28: continuous-mode opt-in flag (03 §4; default false, restart clears). */
  continuous: boolean
}

export interface WatchdogOptions {
  projectRoot: string
  heartbeatMs?: number
  debounceMs?: number
  io?: LawGateIo
  watchIo?: Pick<WatchdogWatchIo, 'watchDir'>
  timers?: WatchdogTimers
  clock?: () => number
  now?: () => string
  logger?: WatchdogLogger
  /** agents face for best-effort receipt delivery (absent = record-only). */
  agents?: ReceiptAgentsFace
  /**
   * agents face for the M3-WI26 execution arm (dispatch exits create agent
   * sessions bound to the policy model selection; absent = the arm degrades
   * to ledger registration + receipts, never a crash).
   */
  dispatchAgents?: DispatchAgentsFace
  /** delivery target session for terminal/exception receipts (A8 opt-in face). */
  receiptSessionId?: string
  /**
   * M3-WI28 continuous-mode initial state (03 §4 opt-in): default OFF —
   * dispatch decisions stay observation receipts until the per-root flag is
   * explicitly enabled (mdcontrol.continuous route, or this bundle-config
   * pre-enable `supervisor.continuous: true` for headless deployments — an
   * equally explicit declaration). In-memory: restart clears it (the
   * ActiveRunGuard precedent).
   */
  continuous?: boolean
  /** test/observation seam invoked inside every cycle before decide(). */
  beforeDecide?: (snapshot: SupervisorSnapshot | null) => Promise<void> | void
}

export interface WatchdogFace {
  /** run ONE full cycle now (respecting the single-flight guard). */
  runCycle(trigger: 'heartbeat' | 'event' | 'recovery' | 'manual'): Promise<SupervisorSnapshot | null>
  start(): void
  stop(): void
  statusFace(): WatchdogStatusFace
  /** terminal-receipt chain seam (declared; consumption = 1411-2/1411-3). */
  registerOnTerminal(hook: OnTerminalHook): () => void
  /** fire a terminal event into the receipt chain seam (test + successor face). */
  emitTerminal(event: Omit<SupervisorTerminalEvent, 'ts'>): SupervisorTerminalEvent
  /**
   * P2-1 activity-signal face: record holder activity (events/session tool
   * activity) — near-expiry claims of recently-active holders renew through
   * the writer before decide() runs, so legitimate in-flight executions are
   * never reclaimed mid-run.
   */
  noteActivity(sessionId: string, at?: number): void
  /**
   * M3-WI28 continuous-mode opt-in (03 §4): set the per-root in-memory flag.
   * Immediate effect — the next cycle (heartbeat/event/chained) runs in the
   * new posture. Dispatch decisions are observation receipts while OFF.
   */
  setContinuous(enabled: boolean): void
  /** M3-WI28: current continuous flag (default false; restart clears it). */
  isContinuous(): boolean
  /**
   * M3-WI28: register the run-terminal receipt delivery target (A8
   * best-effort; the continuous-enabling session is the default target).
   */
  setReceiptTarget(sessionId: string | null): void
}

export function createWatchdog(options: WatchdogOptions): WatchdogFace {
  const { projectRoot } = options
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const io = options.io ?? fsLawGateIo
  const timers = options.timers ?? nodeTimers
  const logger = options.logger ?? {}
  const clock = options.clock ?? (() => Date.now())
  const now = options.now ?? (() => new Date().toISOString())

  // law-context cache: the policy face is resolved once per mount (the
  // adapter's staleness posture); the scan reads plan/roadmap text fresh.
  let lawCtx: MissionLawContext | null | undefined
  const resolveLawCtx = (): MissionLawContext | null => {
    if (lawCtx === undefined) lawCtx = discoverLawContext(join(projectRoot, 'missions'), io)
    return lawCtx
  }

  const state = {
    started: false,
    mountedAt: null as string | null,
    scans: 0,
    lastScanAt: null as string | null,
    lastDecisions: 0,
  }
  const terminalHooks = new Set<OnTerminalHook>()
  const activity = new Map<string, number>()
  let scanning = false
  let pendingTrigger: 'heartbeat' | 'event' | 'recovery' | 'manual' | null = null
  let stopHeartbeat: (() => void) | null = null
  let stopWatchers: Array<() => void> = []
  let debounceTimer: (() => void) | null = null
  let debouncePending = false

  // M3-WI27 terminal state (03 §8): sticky per mount — once reached, the
  // mission run's dispatch is suppressed; across restarts the state
  // re-derives from the ledger (same scan → same word, Phase 1 truth-table
  // idempotence; no new store).
  let terminalState: WatchdogTerminalState | null = null

  // M3-WI28 continuous-mode flag (03 §4 opt-in): per-root in-memory state,
  // default off, restart clears (ActiveRunGuard precedent). The gate itself
  // is applyContinuousGate (decision-core) — dispatch decisions downgrade to
  // observation receipts while off; meter/receipt decisions stay ungated.
  let continuousEnabled = options.continuous === true
  // M3-WI28: run-terminal receipt delivery target — mutable so the
  // continuous-enabling session can register itself (mdcontrol.continuous
  // followup); A8 best-effort delivery, dead sessions tolerated.
  let receiptTargetSessionId = options.receiptSessionId

  // M3-WI29: per-mount recovery handled-occurrence set — one recovery
  // action (resume nudge / redispatch / degraded observation) per occurrence
  // per mount, so repeated recovery cycles perform zero duplicate actions
  // (03 §5 idempotency; restart clears the set — the ActiveRunGuard
  // precedent — and the ledger line stays the cross-restart at-most-once
  // face).
  const recoveryHandled = new Set<string>()

  // M3-WI30 (03 §7/§8): the stagnation detector's scratch state + output —
  // the fact is the watchdog-held SINGLE POINT both R4 entries read (dual
  // entry, one detector: cycle-end evaluation here + the declared-face
  // exec-arm entry through the ExecArmOptions.stagnationFact callback).
  // In-memory scratch (03 §6 归零成文接受): restart clears both — the
  // conservative direction, at most N extra rounds before the breaker.
  const stagnationDetector: StagnationDetectorState = initialStagnationState()
  let stagnationFact: StagnationFact | null = null

  // M4-WI32 (04 §2): the mount's agent pool — role pools (drafter per
  // project root, reviewer per group scope) + the session-role mutex
  // registry + the attemptId generation face the recovery scan reads.
  // In-memory performance cache (P2): restart starts empty by design; the
  // timers ride the injected timers face and the whole pool is torn down
  // idempotently on stop() (the heartbeat-timer lifecycle precedent — the
  // service mount parks stop through ctx.effect).
  const pool: AgentPoolFace = createAgentPool({ timers, clock, logger })
  // the run's executor session set, refreshed per cycle from the scanned
  // snapshot (claim holders ∪ pool executor tags) — the auditor ≠ executor
  // red-line input (final-review P2-5).
  let runExecutorSessions: string[] = []

  // terminal-receipt chain: durable record first, then the A8 best-effort
  // delivery, then the declared hooks (1411-2/1411-3 consumption seam), then
  // — with continuous mode ON — ONE immediate re-evaluation cycle (M3-WI28
  // queue chain edge, 03 §3 edge 2: 终态回执链「一个 run 终态 → 立即评估 →
  // 派发下一个」). Single-flight guarded: a chain edge arriving mid-scan
  // coalesces into the pending slot; the mission terminal word keeps its
  // stop-dispatch priority (suppressed hits never dispatch on chained
  // cycles); the heartbeat edge stays the misfire backstop.
  const emitTerminalEvent = (event: Omit<SupervisorTerminalEvent, 'ts'>): SupervisorTerminalEvent => {
    const stamped: SupervisorTerminalEvent = { ts: now(), ...event }
    receipt({
      kind: 'terminal',
      runId: stamped.runId,
      plan: stamped.plan,
      event: `${stamped.kind}:${stamped.status}`,
      ...(stamped.detail !== undefined ? { detail: stamped.detail } : {}),
    })
    if (receiptTargetSessionId !== undefined) {
      const outcome = deliverReceiptLine(
        options.agents,
        receiptTargetSessionId,
        `[mdsupervisor] ${stamped.kind} ${stamped.runId ?? stamped.plan ?? ''}: ${stamped.status}`,
      )
      if (!outcome.delivered) {
        receipt({
          kind: 'delivery-failure',
          runId: stamped.runId,
          plan: stamped.plan,
          event: 'receipt-delivery',
          detail: outcome.error ?? 'delivery failed',
        })
      }
    }
    for (const hook of terminalHooks) {
      try {
        hook(stamped)
      } catch (err) {
        logger.warn?.(`[mdsupervisor] onTerminal hook threw (isolated, loop unaffected)`, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    if (continuousEnabled) void cycle('manual')
    return stamped
  }

  const setTerminal = (evaluation: TerminationEvaluation, source: WatchdogTerminalState['source']): void => {
    if (terminalState !== null || evaluation.decision === 'continue') return
    terminalState = {
      word: evaluation.decision,
      rule: evaluation.rule,
      at: now(),
      source,
      reasons: evaluation.reasons,
    }
    // receipt chain: durable record + A8 best-effort delivery + the declared
    // hooks — one event, all three faces (emitTerminalEvent)
    emitTerminalEvent({
      kind: 'run-terminal',
      runId: null,
      status: evaluation.decision,
      plan: null,
      detail: `rule ${evaluation.rule} (${source}): ${evaluation.reasons.join('; ')} — dispatch suppressed for this mission run (03 §8)`,
    })
    logger.info?.(`[mdsupervisor] terminal ${evaluation.decision} via ${evaluation.rule} (${source}) — dispatch suppressed`, {
      projectRoot,
      reasons: evaluation.reasons,
    })
  }

  const receipt = (record: Omit<SupervisorReceiptRecord, 'ts'>): void => {
    const receiptIo: ReceiptIo = {
      appendLine: (file, line) => io.appendLine(file, line),
      readTextFile: (p) => io.readTextFile(p),
    }
    appendReceipt(receiptIo, projectRoot, record, now)
  }

  const receiptLines = (): string[] => {
    const text = io.readTextFile(receiptFileFor(projectRoot))
    if (text === null) return []
    return text.split('\n').filter((l) => l.trim() !== '')
  }

  const isTriggerHit = (decision: SupervisorDecision): decision is SupervisorDecision & TriggerHit =>
    (decision as unknown as TriggerHit).trigger !== undefined && decision.posture === 'execute'

  // P2-1 renewal pre-step: near-expiry claims with recently-active holders
  // extend through the writer BEFORE decide() (claim-validity's "未过期"
  // face stays enforceable; bounded window per renewal). The holder is
  // resolved by matching the claim token against recorded activity sessions
  // (claim = attempt-<runId>-<holderSessionId>-<nonce8>).
  const renewDueClaims = (snapshot: SupervisorSnapshot): void => {
    if (activity.size === 0) return
    const ctx = resolveLawCtx()
    if (ctx === null) return
    for (const record of snapshot.plans) {
      const parsed = parseFrontmatter(record.text)
      if (!parsed.ok || parsed.range === null) continue
      const fm = parsed.fm as Record<string, unknown>
      if (fm.status !== 'active') continue
      const claim = fm.claim
      if (typeof claim !== 'string') continue
      let lastActiveAt: number | null = null
      for (const [sessionId, at] of activity) {
        if (claim.includes(sessionId) && (lastActiveAt === null || at > lastActiveAt)) lastActiveAt = at
      }
      if (lastActiveAt === null) continue
      const outcome = renewClaim({ planPath: record.path, holderSessionId: claim, lawCtx: ctx, lastActiveAt, clock, now })
      if (outcome.status === 'renewed' || outcome.status === 'denied' || outcome.status === 'failed') {
        receipt({
          kind: outcome.status === 'renewed' ? 'observation' : 'exception',
          runId: null,
          plan: record.path,
          event: `claim-renewal:${outcome.status}`,
          detail: outcome.detail,
        })
      }
    }
  }

  const executeDecision = (decision: SupervisorDecision, trigger: string): void => {
    if (decision.type === 'no-op') {
      logger.info?.(`[mdsupervisor] cycle ${trigger}: ${decision.action} (${decision.reason})`)
      return
    }
    // WI25 legacy posture: decisions without a trigger payload stay
    // observation receipts (policies without a triggers: section).
    receipt({
      kind: 'observation',
      runId: null,
      plan: decision.target,
      event: `${decision.type}:${decision.action}`,
      detail: `${decision.reason}${decision.note ? ` — ${decision.note}` : ''}`,
    })
    logger.info?.(`[mdsupervisor] ${trigger}: observe ${decision.type}/${decision.action}`, {
      target: decision.target,
      note: decision.note ?? null,
    })
  }

  // M3-WI26: execute-posture trigger hits run through the execution arm
  // (fail-soft — an arm exception becomes an exception receipt, the loop
  // itself never breaks). The arm's writer IO rides this watchdog's injected
  // IO seam plus the default atomic-write face (LawGateIo carries no writer).
  const execIo = { ...io, writeTextAtomic: fsMeterWriterIo.writeTextAtomic }
  const executeHit = async (hit: SupervisorDecision & TriggerHit, trigger: string): Promise<void> => {
    const ctx = resolveLawCtx()
    if (ctx === null) return
    const opts: ExecArmOptions = {
      projectRoot,
      lawCtx: ctx,
      io: execIo,
      clock,
      now,
      runId: 'mdsupervisor',
      ...(options.dispatchAgents !== undefined ? { agents: options.dispatchAgents } : {}),
      pool,
      executorSessions: runExecutorSessions,
      receipt,
      receiptLines,
      logger,
      // M3-WI27: an executing terminal word from the declared face (R3
      // trigger exit) feeds the same stop-dispatch state — dual entry, one core
      onTerminalWord: (evaluation) => setTerminal(evaluation, 'declared-face'),
      // M3-WI30: the declared-face entry reads the SAME watchdog-held
      // detector state — dual entry, one detector (zero single-cycle
      // divergence between the two R4 entries).
      stagnationFact: () => stagnationFact,
    }
    try {
      const outcome = await executeTriggerHit(hit, opts)
      logger.info?.(`[mdsupervisor] ${trigger}: exec ${outcome.action} → ${outcome.status}`, { detail: outcome.detail, target: hit.target })
    } catch (err) {
      receipt({
        kind: 'exception',
        runId: null,
        plan: hit.target,
        event: `exec-arm-error:${hit.action}`,
        detail: err instanceof Error ? err.message : String(err),
      })
      logger.warn?.(`[mdsupervisor] ${trigger}: exec arm threw (isolated, loop unaffected)`, {
        action: hit.action,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const cycle = async (trigger: 'heartbeat' | 'event' | 'recovery' | 'manual'): Promise<SupervisorSnapshot | null> => {
    // single-flight guard: at most one scan in flight; later triggers
    // coalesce into ONE pending follow-up cycle
    if (scanning) {
      pendingTrigger = pendingTrigger ?? trigger
      return null
    }
    scanning = true
    try {
      const ctx = resolveLawCtx()
      const snapshot = scanSupervisorSnapshot({ projectRoot, lawCtx: ctx, io, clock, now })
      if (options.beforeDecide !== undefined) await options.beforeDecide(snapshot)
      if (snapshot === null) {
        logger.info?.(`[mdsupervisor] cycle ${trigger}: no governing law context under ${projectRoot} — idle`)
        return null
      }
      // M4-WI32: refresh the run's executor session set from the fresh
      // scan (claim holders derived from frontmatter ∪ pool executor tags)
      runExecutorSessions = executorSessionsOf(snapshot.plans, { runId: 'mdsupervisor', pool })
      // M3-WI29 recovery duty (03 §6): the restart-labeled cycle runs the
      // stale-disposition scan BEFORE the normal trigger evaluation —
      // un-concluded dispatch occurrences are resumed (original session
      // alive) or redispatched (session dead, NEW line, old line stays
      // append-only). NOT gated by continuous mode (crash completion of
      // already-dispatched work, not new unattended progression — plan
      // 1954-2: 「恢复后链式继续沿其门」chains onward stay gated); suppressed
      // once the mission run reached a terminal word (stop-dispatch
      // priority). Expired-claim reclaim needs no recovery-side twin — the
      // reclaim trigger below evaluates on every cycle, recovery included.
      if (trigger === 'recovery' && terminalState === null) {
        try {
          await runRecoveryScan({
            projectRoot,
            lawCtx: ctx!,
            snapshot,
            agents: options.dispatchAgents as RecoveryAgentsFace | undefined,
            handled: recoveryHandled,
            pool,
            executorSessions: runExecutorSessions,
            io: execIo,
            clock,
            now,
            runId: 'mdsupervisor',
            receipt,
            logger,
          })
        } catch (err) {
          // fail-soft (the exec-arm discipline): one recovery exception is a
          // receipt, the cycle itself continues
          receipt({
            kind: 'exception',
            runId: null,
            plan: null,
            event: 'recovery-scan-error',
            detail: err instanceof Error ? err.message : String(err),
          })
          logger.warn?.(`[mdsupervisor] recovery scan threw (isolated, cycle continues)`, {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      renewDueClaims(snapshot)
      // M3-WI28 continuous gate (03 §4 opt-in): dispatch decisions downgrade
      // to observation receipts while the per-root flag is off; meter-write
      // and receipt decisions pass ungated (applyContinuousGate).
      const decisions = applyContinuousGate(decide(snapshot, policyFaceOf(ctx!), clock), continuousEnabled)
      state.scans += 1
      state.lastScanAt = now()
      state.lastDecisions = decisions.length
      if (terminalState !== null) {
        // stop-dispatch (循环停派, 03 §8): the mission run reached a terminal
        // word — execute-posture hits are suppressed (log-only, no receipt
        // flood; the suppression itself was receipted at setTerminal time)
        for (const decision of decisions) {
          if (isTriggerHit(decision)) {
            logger.info?.(`[mdsupervisor] ${trigger}: suppressed ${decision.action} (terminal ${terminalState.word} via ${terminalState.rule})`, {
              target: decision.target,
            })
          } else {
            executeDecision(decision, trigger)
          }
        }
        return snapshot
      }
      for (const decision of decisions) {
        if (isTriggerHit(decision)) await executeHit(decision, trigger)
        else executeDecision(decision, trigger)
      }
      // post-execution faces (M3-WI27): the circuit breaker (02 §4.6) trips
      // held plans FIRST, then the R1–R4 terminal duty (03 §8) evaluates over
      // a FRESH scan of the post-write ledger — the sequential core is the
      // R1/R2/R4 entry (and the direct R3 face); the declared R3 trigger exit
      // may already have set the terminal state through the exec arm above
      // (dual entry, one core). R1's budget face complements the
      // audit-rounds-overflow deny gate: the gate denies new audit dispatch,
      // this core closes the run once quiescent.
      const breaker = applyCircuitBreaker({ lawCtx: ctx!, io: execIo, clock, receipt })
      if (breaker.held.length > 0) {
        logger.info?.(`[mdsupervisor] ${trigger}: circuit breaker — ${breaker.detail}`)
      }
      if (terminalState === null) {
        const post = scanSupervisorSnapshot({ projectRoot, lawCtx: ctx, io, clock, now })
        if (post !== null) {
          // M3-WI30 detector cycle (03 §7): fingerprint (per-plan basisHash
          // set + roadmap text hash) × activity signal (the noteActivity map,
          // window = one heartbeat) × ping-pong (per-plan status history) —
          // the emitted fact is the single point BOTH R4 entries inject.
          const observed = observeStagnation(stagnationDetector, {
            plans: post.plans,
            roadmapText: post.roadmap !== null ? post.roadmap.text : null,
            activityAt: activity.values(),
            now: clock(),
            activityWindowMs: heartbeatMs,
            threshold: ctx!.stagnationRounds,
          })
          const newlyTripped = observed.fact !== null && stagnationFact === null
          stagnationFact = observed.fact
          if (newlyTripped) {
            receipt({
              kind: 'observation',
              runId: null,
              plan: observed.pingPongPlan,
              event: 'stagnation-detected',
              detail: observed.pingPongPlan !== null
                ? `ping-pong: ${observed.pingPongPlan} oscillated between two states with no terminal progress (03 §7) — saturated R4 injection`
                : `stagnation fingerprint ${observed.stagnantRounds}/${ctx!.stagnationRounds} rounds unchanged ∧ zero activity (03 §7) — R4 injection`,
            })
          }
          const evaluation = evaluateTermination(post, {
            maxAuditRounds: ctx!.maxAuditRounds,
            maxFailures: ctx!.maxFailures ?? 3,
            ...(stagnationFact !== null ? { stagnation: stagnationFact } : {}),
          })
          if (evaluation.decision !== 'continue') setTerminal(evaluation, 'cycle')
        }
      }
      return snapshot
    } finally {
      scanning = false
      if (pendingTrigger !== null) {
        const next = pendingTrigger
        pendingTrigger = null
        void cycle(next)
      }
    }
  }

  const start = (): void => {
    if (state.started) return
    state.started = true
    state.mountedAt = now()
    // restart seam (03 §6): the first cycle doubles as the recovery scan
    void cycle('recovery')
    stopHeartbeat = timers.setInterval(() => void cycle('heartbeat'), heartbeatMs)
    // event edge: plansDir + roadmap directory watchers, debounced
    const watchIo = options.watchIo ?? fsWatchIo
    const ctx = resolveLawCtx()
    const dirs = new Set<string>()
    if (ctx !== null && ctx.plansDir !== '') dirs.add(ctx.plansDir)
    if (ctx !== null && ctx.roadmapPath !== '') dirs.add(dirname(ctx.roadmapPath))
    for (const dir of dirs) {
      const stop = watchIo.watchDir(dir, () => {
        debouncePending = true
        debounceTimer?.()
        debounceTimer = timers.setTimeout(() => {
          debounceTimer = null
          if (!debouncePending) return
          debouncePending = false
          void cycle('event')
        }, debounceMs)
      })
      if (stop === null) {
        logger.warn?.(`[mdsupervisor] event-edge watcher unavailable for ${dir} — heartbeat-only (degraded, not a failure)`)
        continue
      }
      stopWatchers.push(stop)
    }
    logger.info?.(`[mdsupervisor] watchdog started`, {
      projectRoot,
      heartbeatMs,
      debounceMs,
      watchers: stopWatchers.length,
    })
  }

  const stop = (): void => {
    if (!state.started) return
    state.started = false
    stopHeartbeat?.()
    stopHeartbeat = null
    for (const stopWatcher of stopWatchers) stopWatcher()
    stopWatchers = []
    debounceTimer?.()
    debounceTimer = null
    // M4-WI32: pool teardown (idempotent) — idle-TTL timers cleared,
    // members revoked; memory cache dies with the mount (P2 posture)
    pool.dispose()
    logger.info?.(`[mdsupervisor] watchdog stopped (idempotent dispose)`, { scans: state.scans })
  }

  return {
    runCycle: cycle,
    start,
    stop,
    noteActivity(sessionId: string, at?: number) {
      activity.set(sessionId, at ?? clock())
    },
    setContinuous(enabled: boolean) {
      continuousEnabled = enabled
      logger.info?.(`[mdsupervisor] continuous mode ${enabled ? 'on' : 'off'} — execute posture ${enabled ? 'granted (1411-2 exec arm live for dispatch decisions)' : 'suppressed to WI25 observation (03 §4 opt-in)'}`, { projectRoot })
    },
    isContinuous() {
      return continuousEnabled
    },
    setReceiptTarget(sessionId) {
      receiptTargetSessionId = sessionId === null ? undefined : sessionId
    },
    statusFace: () => ({
      mounted: state.started,
      mountedAt: state.mountedAt,
      heartbeatMs,
      scans: state.scans,
      lastScanAt: state.lastScanAt,
      lastDecisions: state.lastDecisions,
      terminal: terminalState,
      continuous: continuousEnabled,
      receipts: readReceipts(
        {
          appendLine: () => {},
          readTextFile: (p) => io.readTextFile(p),
        },
        projectRoot,
      ),
    }),
    registerOnTerminal(hook) {
      terminalHooks.add(hook)
      return () => terminalHooks.delete(hook)
    },
    emitTerminal(event) {
      return emitTerminalEvent(event)
    },
  }
}
