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
 * recovery scan (expired claims / residual awaitingClosure land as
 * observation receipts). Reclaim/redispatch execution = 1411-2 reclaim
 * trigger + WI29 full semantics — this plan only observes.
 *
 * Default posture (plan Phase 1 Decision 3): decisions of type dispatch are
 * NEVER dispatched here — every decision this plan produces is executed as
 * an observation receipt + log line. Existing hosts gain no unattended
 * progression from this loop.
 */
import { dirname, join } from 'node:path'
import { watch, type FSWatcher } from 'node:fs'
import {
  decide,
  policyFaceOf,
  scanSupervisorSnapshot,
  type SupervisorDecision,
  type SupervisorSnapshot,
} from './decision-core.ts'
import {
  appendReceipt,
  deliverReceiptLine,
  readReceipts,
  type ReceiptAgentsFace,
  type ReceiptIo,
  type SupervisorReceiptRecord,
} from './receipt.ts'
import { discoverLawContext, fsLawGateIo, type LawGateIo, type MissionLawContext } from '../law/host-adapter.ts'

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
}

export type OnTerminalHook = (event: SupervisorTerminalEvent) => void

export type WatchdogStatusFace = {
  mounted: boolean
  mountedAt: string | null
  heartbeatMs: number
  scans: number
  lastScanAt: string | null
  lastDecisions: number
  receipts: SupervisorReceiptRecord[]
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
  /** delivery target session for terminal/exception receipts (A8 opt-in face). */
  receiptSessionId?: string
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
  let scanning = false
  let pendingTrigger: 'heartbeat' | 'event' | 'recovery' | 'manual' | null = null
  let stopHeartbeat: (() => void) | null = null
  let stopWatchers: Array<() => void> = []
  let debounceTimer: (() => void) | null = null
  let debouncePending = false

  const receipt = (record: Omit<SupervisorReceiptRecord, 'ts'>): void => {
    const receiptIo: ReceiptIo = {
      appendLine: (file, line) => io.appendLine(file, line),
      readTextFile: (p) => io.readTextFile(p),
    }
    appendReceipt(receiptIo, projectRoot, record, now)
  }

  const executeDecision = (decision: SupervisorDecision, trigger: string): void => {
    if (decision.type === 'no-op') {
      logger.info?.(`[mdsupervisor] cycle ${trigger}: ${decision.action} (${decision.reason})`)
      return
    }
    // Every decision this plan produces is observation-posture (Phase 1
    // Decision 3): meter-writes and dispatches are recorded, never executed.
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
      const decisions = decide(snapshot, policyFaceOf(ctx!), clock)
      state.scans += 1
      state.lastScanAt = now()
      state.lastDecisions = decisions.length
      for (const decision of decisions) executeDecision(decision, trigger)
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
    logger.info?.(`[mdsupervisor] watchdog stopped (idempotent dispose)`, { scans: state.scans })
  }

  return {
    runCycle: cycle,
    start,
    stop,
    statusFace: () => ({
      mounted: state.started,
      mountedAt: state.mountedAt,
      heartbeatMs,
      scans: state.scans,
      lastScanAt: state.lastScanAt,
      lastDecisions: state.lastDecisions,
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
      const stamped: SupervisorTerminalEvent = { ts: now(), ...event }
      // receipt record first (durable), then the best-effort delivery (A8),
      // then the declared hooks (1411-2/1411-3 consumption seam)
      receipt({
        kind: 'terminal',
        runId: stamped.runId,
        plan: stamped.plan,
        event: `${stamped.kind}:${stamped.status}`,
      })
      if (options.receiptSessionId !== undefined) {
        const outcome = deliverReceiptLine(
          options.agents,
          options.receiptSessionId,
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
      return stamped
    },
  }
}
