/**
 * failures.ts — failure attribution buckets + the circuit breaker (age-autonomy
 * M3-WI27, plan `docs/plans/age-autonomy/2026-08-26-1411-3` Phase 2;
 * 02-rule-law §4.6 increment + 03-supervisor §7).
 *
 * ── Attribution buckets (02 §4.6, the WI27 written increment) ───────────────
 *   COUNTED (each event +1 on the target plan's frontmatter `failures`):
 *     executor-error          — an executor dispatch errored while being
 *                               created/re-issued/run (agent session creation
 *                               failure, claim re-issue write failure, exec
 *                               arm exception on an execute-family dispatch);
 *                               policy-resolution refusals are the config
 *                               face, never a plan failure.
 *     verification-red        — a mechanical-verification run had exit ≠ 0
 *                               (per red run; no pass lines are written on
 *                               red — the 1411-2 failure point).
 *     claim-expired-no-output — an expired claim was reclaimed (the plan
 *                               stayed active past claim TTL without
 *                               completing — output-less by definition).
 *   NOT counted (noise prevention, each pinned by tests):
 *     - the supervisor's own write-pipeline CAS retries/conflicts (a moved
 *       basis re-decides next cycle; infrastructure noise, not plan failure);
 *     - recovery-scan observation records (restart seam faces observe, the
 *       failure already happened and was counted at its attribution point);
 *     - dual-driver idempotent skips (the dedup face refusing a re-dispatch
 *       means the work is already done/in flight — counting it would double-
 *       attribute one occurrence).
 *
 * ── Circuit breaker (02 §4.6 + 03 §7) ───────────────────────────────────────
 *   failures ≥ maxFailures → the plan writes held + hold reason (+ failures
 *   re-pin, claim cleared — ONE atomic write, ./writer.ts holdPlan; the
 *   supervisor's legal T5 edge, 01 §5.1) + a receipt. A SINGLE held plan
 *   never blocks other plans' execution/review (03 §4 Queue ≠ approval);
 *   only when ALL open plans are held (no executable/reviewable open plan
 *   remains) does the mission terminalize partial/blocked — THROUGH the
 *   Phase 1 evaluation core (dual-entry same-source discipline; R3 with
 *   held>0 → blocked). held→active unlock resets failures=0 in the same
 *   write — that enforcement is writer-identity's existing face, ZERO rule
 *   changes (01 §5.1 T6).
 */
import { scanPlanLedger } from '../../assets/src/ledger-sections.mjs'
import { readPlanRecordsUnder, type MissionLawContext } from '../law/host-adapter.ts'
import { fsMeterWriterIo, holdPlan, writePlanFailures, type MachineFieldWriteStatus, type MeterWriterIo } from './writer.ts'

export const FAILURE_BUCKETS = ['executor-error', 'verification-red', 'claim-expired-no-output'] as const
export type FailureBucket = (typeof FAILURE_BUCKETS)[number]

export interface RecordFailureOptions {
  planPath: string
  bucket: FailureBucket
  lawCtx: MissionLawContext
  io?: MeterWriterIo
  /** receipt sink (best-effort; the count is the write, the receipt is the trace). */
  receipt?: (record: { kind: 'observation' | 'exception'; runId: string | null; plan: string | null; event: string; detail?: string }) => void
  runId?: string | null
}

export interface RecordFailureResult {
  status: MachineFieldWriteStatus | 'bad-bucket'
  /** the failures value now on disk (null unless written). */
  failures: number | null
  reason: string | null
}

/**
 * Attribute ONE failure event: read the current counter, +1 through the
 * writer pipeline (law self-check + CAS + atomic rename). A non-'written'
 * outcome (denied / conflict / missing) counts NOTHING — infrastructure
 * noise never attributes plan failure (02 §4.6 not-counted list).
 */
export function recordPlanFailure(opts: RecordFailureOptions): RecordFailureResult {
  if (!FAILURE_BUCKETS.includes(opts.bucket)) {
    return { status: 'bad-bucket', failures: null, reason: `unknown failure bucket ${JSON.stringify(opts.bucket)} — buckets: ${FAILURE_BUCKETS.join(' / ')}` }
  }
  const io = opts.io
  const text = io !== undefined ? io.readTextFile(opts.planPath) : null
  if (io === undefined || text === null) {
    return { status: 'missing', failures: null, reason: 'plan unreadable — nothing attributed' }
  }
  const scan = scanPlanLedger(text) as unknown as { fm: Record<string, unknown> | null }
  const current = scan.fm !== null && typeof scan.fm.failures === 'number' && Number.isInteger(scan.fm.failures) && scan.fm.failures >= 0 ? scan.fm.failures : 0
  const next = current + 1
  const write = writePlanFailures({ planPath: opts.planPath, failures: next, lawCtx: opts.lawCtx, io })
  if (write.status !== 'written') {
    opts.receipt?.({
      kind: 'exception',
      runId: opts.runId ?? null,
      plan: opts.planPath,
      event: `failure-attribution-skipped:${opts.bucket}`,
      detail: `writer ${write.status}: ${write.reason ?? ''} — the failure event is NOT attributed (noise prevention, 02 §4.6); the next cycle re-observes`,
    })
    return { status: write.status, failures: null, reason: `writer ${write.status}: ${write.reason ?? ''} — failure NOT attributed (noise prevention, 02 §4.6)` }
  }
  opts.receipt?.({
    kind: 'observation',
    runId: opts.runId ?? null,
    plan: opts.planPath,
    event: `failure-attributed:${opts.bucket}`,
    detail: `failures ${current} → ${next} (${opts.bucket}, 02 §4.6 bucket)`,
  })
  return { status: 'written', failures: next, reason: null }
}

// ── the circuit breaker (02 §4.6 / 03 §7) ───────────────────────────────────

export interface CircuitBreakerOutcome {
  /** plans newly written to held by this pass. */
  held: string[]
  /** count of held plans in the corpus after this pass (idempotent census). */
  alreadyHeld: number
  detail: string
}

export interface CircuitBreakerOptions {
  lawCtx: MissionLawContext
  io?: MeterWriterIo
  clock?: () => number
  receipt?: (record: { kind: 'observation' | 'exception'; runId: string | null; plan: string | null; event: string; detail?: string }) => void
  /** plan records to judge (fresh reads); defaults to re-reading lawCtx.plansDir. */
  plans?: Array<{ path: string; text: string }>
  /** plan corpus cap when re-reading (readPlanRecordsUnder default 200). */
  scanCap?: number
}

function plansUnder(opts: CircuitBreakerOptions, io: MeterWriterIo): Array<{ path: string; text: string }> {
  if (opts.plans !== undefined) return opts.plans
  return readPlanRecordsUnder(opts.lawCtx.plansDir, io, opts.scanCap)
}

/**
 * One circuit-breaker pass over the plan corpus: every draft/active plan whose
 * frontmatter failures ≥ maxFailures is written held (+hold reason, failures
 * re-pinned, claim cleared — one atomic write) with a receipt. Already-held
 * plans are left alone (idempotent); a single held plan never blocks the
 * others (03 §4 — only the offending plan is touched). The ALL-held
 * terminalization is NOT decided here — it belongs to the Phase 1 evaluation
 * core over the post-pass state (R3 blocked; the watchdog wires that order).
 */
export function applyCircuitBreaker(opts: CircuitBreakerOptions): CircuitBreakerOutcome {
  const io = opts.io ?? fsMeterWriterIo
  const maxFailures = opts.lawCtx.maxFailures
  const held: string[] = []
  let alreadyHeld = 0
  for (const record of plansUnder(opts, io)) {
    const scan = scanPlanLedger(record.text) as unknown as { fm: Record<string, unknown> | null; fmError: string | null; hasFrontmatter: boolean }
    if (!scan.hasFrontmatter || scan.fmError !== null || scan.fm === null) continue
    const status = scan.fm.status
    if (status !== 'active' && status !== 'draft') continue
    const failures = typeof scan.fm.failures === 'number' && Number.isInteger(scan.fm.failures) && scan.fm.failures >= 0 ? scan.fm.failures : 0
    if (failures < maxFailures) continue
    const hold = `failures ${failures} ≥ maxFailures ${maxFailures} — circuit breaker (02 §4.6); unlock resets failures to 0 (held→active same-write, 01 §5.1 T6)`
    const write = holdPlan({ planPath: record.path, hold, failures, lawCtx: opts.lawCtx, io, now: opts.clock })
    if (write.status === 'written') {
      held.push(record.path)
      opts.receipt?.({
        kind: 'observation',
        runId: null,
        plan: record.path,
        event: 'circuit-breaker:held',
        detail: hold,
      })
    } else {
      opts.receipt?.({
        kind: 'exception',
        runId: null,
        plan: record.path,
        event: 'circuit-breaker:hold-failed',
        detail: `writer ${write.status}: ${write.reason ?? ''} — retried next cycle`,
      })
    }
  }
  // post-pass held census over the same corpus (fresh read for the plans this
  // pass just wrote; opts.plans callers pass their own fresh list)
  const census = plansUnder(opts, io).map((record) => {
    const text = held.includes(record.path) ? io.readTextFile(record.path) ?? record.text : record.text
    return scanPlanLedger(text) as unknown as { fm: Record<string, unknown> | null }
  })
  for (const scan of census) {
    if (scan.fm !== null && scan.fm.status === 'held') alreadyHeld += 1
  }
  return {
    held,
    alreadyHeld,
    detail:
      held.length === 0
        ? `circuit breaker inert: no draft/active plan at failures ≥ maxFailures ${maxFailures} (${alreadyHeld} already held)`
        : `circuit breaker held ${held.length} plan(s) at failures ≥ maxFailures ${maxFailures}: ${held.join(', ')}`,
  }
}
