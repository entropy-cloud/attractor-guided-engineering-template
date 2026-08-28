/**
 * stagnation.ts — the WI30 stagnation-fingerprint + ping-pong detector
 * (age-autonomy M3-WI30, plan `docs/plans/age-autonomy/2026-08-26-1954-3`
 * Phase 1; 03-supervisor §7 卡死检测 / §8 R4).
 *
 * ── Phase 1 adjudications carried by this module ────────────────────────────
 *
 * Decision 1 — dual entry, one detector state: the detector's output is a
 * watchdog-held single point (`StagnationFact | null`). BOTH R4 entries read
 * THAT state — the watchdog cycle-end evaluation (existing entry) and the
 * policy terminal declared face (exec-arm `forwardTerminalDecision` re-scan
 * entry) inject the same fact, never a second detector. Rejected: injecting
 * at the cycle entry only (declared face defers to R3-first ordering + next
 * cycle convergence) — it would create a single-cycle divergence face
 * (declared face continue while the cycle face says blocked), violating the
 * 1411-3 written contract "two entries, one implementation + cross cases pin
 * drift". Residual: the declared face reads the fact computed at the PREVIOUS
 * cycle end (≤ one cycle skew) — converged by idempotent re-evaluation; the
 * truth-table cross case pins it.
 *
 * Decision 2 — fingerprint domain + activity signal: the per-cycle
 * fingerprint = the sorted (planPath → basisHash) rows + a hash of the
 * roadmap text, where the per-plan face reuses `computeBasisHash` (the
 * completion-formula same source): frontmatter + `## Phase` blocks +
 * `## Closure Findings`. Appends to Draft Review Record / Verification /
 * Closure do NOT move the fingerprint (dispatch and pass lines are
 * in-flight bookkeeping, not progress); what moves it: status flips, checkbox
 * ticks, Closure Findings appends, roadmap changes (the roadmap has no
 * per-file basis face — full-text hash). One stagnant round = fingerprint
 * unchanged ∧ ZERO noteActivity hits inside the activity window (default =
 * one heartbeat period). The activity signal MUST participate (03 §7
 * literal): an unchanged fingerprint WITH activity is NOT a stagnant round
 * (a long task that has not landed yet is never misjudged); the counter
 * CLEARS on activity rounds and re-accumulates. Carrier = in-memory scratch
 * state (03 §6 归零成文接受: restart clears — the conservative direction, at
 * most N extra rounds before the breaker, never a false kill). Rejected A:
 * persisting the fingerprint across restarts (scratch discipline violation;
 * re-accumulation after restart is harmless). Rejected B: roadmap-only
 * fingerprint (plans are the primary progression face). Residual: an AI
 * spinning while periodically touching files (fingerprint moves with no net
 * progress) — the ping-pong leg below + the failures circuit breaker are the
 * documented backstops.
 *
 * Decision 3 — ping-pong detection, exit merged into stagnation: per-plan
 * status history sampled each cycle; oscillation = one plan flipping between
 * TWO states ≥ K complete round trips (2K flips) with no terminal progress
 * (terminal = the writable dispositions cancelled/superseded/deferred;
 * completed is derived, 01 §5.2). A hit injects the SATURATED fact
 * ({rounds: threshold, threshold} — equivalently satisfying R4) → the SAME
 * R4 exit (blocked + receipt). Rejected: a separate oscillation exit/terminal
 * word — 03 §7 literal「停滞检测收口」+ the 03 §8 closed terminal-word table
 * (single-exit discipline R1–R4). K = max(2, floor(stagnationRounds/5)) round
 * trips, derived from the SAME policy key (Decision 4 — no second key to
 * drift). Flip counting is consecutive-alternation: a flip to a THIRD state
 * breaks the A↔B pair and restarts the count at 1 (「在两态间反复横跳」is the
 * decidable shape); reaching a terminal disposition resets the plan's count.
 * Residual: legitimate repeated held→active human unlocks tripping the leg —
 * unlock carries a human receipt chain and the count resets the moment the
 * status settles; narrow misjudge face + the blocked receipt is itself
 * human-re-disposable (written acceptance).
 *
 * Decision 4 — N/K policy home: single key `limits.stagnationRounds`
 * (resolveStagnationRounds in law-policy.mjs: policy authoritative /
 * mission-flow fallback / both absent default 10 — ≈5 wall-clock minutes at
 * the 30s heartbeat). K carries NO independent config key (derived, avoids
 * dual-key drift). threshold < 1 = detector OFF (no fact ever — R4 stays
 * unevaluated; the no-false-kill face of the explicit zero).
 *
 * Purity: `observeStagnation` is a pure (state, input) → (state', output)
 * transition — clock and activity map are injected; deterministic under test.
 */
import { createHash } from 'node:crypto'
import { computeBasisHash } from '../../assets/src/ledger-sections.mjs'
import { parseFrontmatter } from '../../assets/src/ledger-frontmatter.mjs'
import type { StagnationFact } from './terminal-rules.ts'

// ── types ────────────────────────────────────────────────────────────────────

export interface PlanStatusSample {
  path: string
  text: string
}

/** The watchdog-held scratch state (03 §6: in-memory, restart clears). */
export interface StagnationDetectorState {
  /** last cycle's aggregated fingerprint (null before the first observation). */
  lastFingerprint: string | null
  /** consecutive stagnant rounds (fingerprint unchanged ∧ window-inactive). */
  stagnantRounds: number
  /**
   * per-plan status-history ring: the alternating-pair bookkeeping
   * (pairA/pairB = the two states, flips = consecutive alternations kept
   * between them, capped at the bound). lastStatus = the previous cycle's
   * sampled status.
   */
  plans: Map<string, { lastStatus: string | null; pairA: string | null; pairB: string | null; flips: number }>
}

export interface ObserveStagnationInput {
  plans: PlanStatusSample[]
  roadmapText: string | null
  /** epoch-ms timestamps of the last observed holder activity (the noteActivity map values). */
  activityAt: Iterable<number>
  /** injectable now (epoch ms) — determinism under test. */
  now: number
  /** activity window in ms (default = one heartbeat period; Decision 2). */
  activityWindowMs: number
  /** the N threshold (policy stagnationRounds); < 1 ⇒ detector inert. */
  threshold: number
  /** K round-trip bound override (default = derived from threshold, Decision 3/4). */
  pingPongRoundTrips?: number
}

export interface ObserveStagnationOutput {
  fact: StagnationFact | null
  fingerprint: string
  stagnantRounds: number
  /** the plan whose oscillation saturated the fact, if any. */
  pingPongPlan: string | null
}

/** The writable terminal dispositions (01 §5.1; completed is derived, never written). */
const TERMINAL_STATUSES = new Set(['cancelled', 'superseded', 'deferred'])

export function initialStagnationState(): StagnationDetectorState {
  return { lastFingerprint: null, stagnantRounds: 0, plans: new Map() }
}

/**
 * The K round-trip bound derived from the SAME policy key (Decision 4):
 * max(2, floor(stagnationRounds/5)) complete round trips — at the default
 * N=10, K=2 round trips = 4 flips.
 */
export function pingPongRoundTripsOf(threshold: number): number {
  return Math.max(2, Math.floor(threshold / 5))
}

/**
 * The per-cycle ledger fingerprint (Decision 2): sorted (planPath →
 * basisHash) rows + the roadmap full-text hash, aggregated through one
 * sha256. Deterministic: same corpus → same fingerprint, twice.
 */
export function computeLedgerFingerprint(plans: PlanStatusSample[], roadmapText: string | null): string {
  const rows = plans.map((p) => `${p.path}\t${computeBasisHash(p.text)}`).sort()
  const roadmapHash = roadmapText !== null ? createHash('sha256').update(roadmapText, 'utf8').digest('hex') : ''
  return createHash('sha256').update(`${rows.join('\n')}\n${roadmapHash}`, 'utf8').digest('hex')
}

function statusOf(text: string): string | null {
  const parsed = parseFrontmatter(text)
  if (!parsed.ok || parsed.range === null) return null
  const status = (parsed.fm as Record<string, unknown>).status
  return typeof status === 'string' ? status : null
}

/**
 * One detector cycle (pure transition). Fingerprint leg: unchanged
 * fingerprint ∧ no activity-in-window ⇒ stagnantRounds+1, else reset to 0
 * (activity rounds CLEAR the count — Decision 2). Ping-pong leg: any plan
 * reaching 2K consecutive alternating flips ⇒ the saturated fact. Either leg
 * at/over threshold ⇒ StagnationFact {rounds, threshold} (rounds capped at
 * threshold — once tripped it stays tripped until a progress/activity round
 * resets). threshold < 1 ⇒ inert (null fact, state still tracks).
 */
export function observeStagnation(
  state: StagnationDetectorState,
  input: ObserveStagnationInput,
): ObserveStagnationOutput {
  const fingerprint = computeLedgerFingerprint(input.plans, input.roadmapText)
  const threshold = input.threshold

  // fingerprint leg (Decision 2): activity MUST participate — an unchanged
  // fingerprint with in-window activity is NOT stagnant; the count clears.
  let hasActivity = false
  for (const at of input.activityAt) {
    if (at >= input.now - input.activityWindowMs && at <= input.now + input.activityWindowMs) {
      hasActivity = true
      break
    }
  }
  if (state.lastFingerprint === null || fingerprint !== state.lastFingerprint || hasActivity) {
    state.stagnantRounds = 0
  } else {
    state.stagnantRounds = Math.min(state.stagnantRounds + 1, Math.max(threshold, 1))
  }
  state.lastFingerprint = fingerprint

  // ping-pong leg (Decision 3): consecutive-alternation flips between TWO
  // states, terminal progress resets, a third state restarts the pair.
  const roundTrips = input.pingPongRoundTrips ?? pingPongRoundTripsOf(threshold)
  const flipsNeeded = 2 * roundTrips
  let pingPongPlan: string | null = null
  const seen = new Set<string>()
  for (const plan of input.plans) {
    seen.add(plan.path)
    const entry = state.plans.get(plan.path) ?? { lastStatus: null, pairA: null, pairB: null, flips: 0 }
    const status = statusOf(plan.text)
    if (status !== null && entry.lastStatus !== null && status !== entry.lastStatus) {
      if (TERMINAL_STATUSES.has(status)) {
        // terminal progress — the oscillation ledger for this plan resets
        entry.pairA = null
        entry.pairB = null
        entry.flips = 0
      } else {
        const continuesPair =
          (entry.pairA !== null && entry.pairB !== null && entry.flips > 0 &&
            ((entry.lastStatus === entry.pairB && status === entry.pairA) || (entry.lastStatus === entry.pairA && status === entry.pairB)))
        if (continuesPair) {
          entry.flips = Math.min(entry.flips + 1, flipsNeeded)
        } else {
          entry.pairA = entry.lastStatus
          entry.pairB = status
          entry.flips = 1
        }
      }
    }
    entry.lastStatus = status
    state.plans.set(plan.path, entry)
    if (entry.flips >= flipsNeeded && entry.pairA !== entry.pairB) {
      pingPongPlan = plan.path
    }
  }
  // departed plans (completed-and-archived / deleted) drop their scratch rows
  for (const path of [...state.plans.keys()]) {
    if (!seen.has(path)) state.plans.delete(path)
  }

  let fact: StagnationFact | null = null
  if (threshold >= 1) {
    if (pingPongPlan !== null) {
      fact = { rounds: threshold, threshold }
    } else if (state.stagnantRounds >= threshold) {
      fact = { rounds: state.stagnantRounds, threshold }
    }
  }
  return { fact, fingerprint, stagnantRounds: state.stagnantRounds, pingPongPlan }
}
