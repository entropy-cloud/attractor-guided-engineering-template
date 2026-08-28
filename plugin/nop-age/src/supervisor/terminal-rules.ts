/**
 * terminal-rules.ts — R1–R4 sequential termination evaluation core
 * (age-autonomy M3-WI27, plan `docs/plans/age-autonomy/2026-08-26-1411-3`
 * Phase 1; 03-supervisor §8).
 *
 * ── Phase 1 adjudications carried by this module ────────────────────────────
 *
 * Decision 1 — R1–R4 carrier form: the sequential evaluation core lives HERE
 * in the supervisor (03 §8 literal order R1→R4 — the ORDER itself is the
 * written contract, not an implicit sequencing; 03 §3 "the supervisor only
 * executes declared rules" includes the §8 sequential contract). The policy
 * terminal trigger exit (`terminal: partial/blocked`, TRIGGER_TERMINAL_VALUES
 * compound value) is R3's DECLARED entry face — BOTH entries route into this
 * one implementation (the 1411-2 evaluator's terminal decision object is
 * executed by re-running this core over the current snapshot, never a second
 * implementation). Rejected alternative: rewriting R1–R4 as policy triggers —
 * R1's compound condition and order-priority semantics exceed the restricted
 * predicate grammar and would disguise a written sequential contract as a
 * configurable item. Residual risk (dual-entry drift) is pinned by the truth
 * table's cross cases.
 *
 * Decision 2 — terminal landing: a terminal decision is NOT a ledger write
 * (roadmaps have no terminal row to write — roadmap-write-guard's domain is
 * WI-row checkbox flips + evidence appends; plan status terminal values are a
 * DIFFERENT semantics, 01 §5.1 disposition edges). Terminal = a receipt
 * record (1411-1 receipt face) + `mdcontrol.status` exposure + watchdog
 * dispatch suppression for that mission run. Rejected: writing mission
 * run-state — run-state is the engine's face (zero engine diff floor).
 * Residual: cross-restart terminal memory — the ledger-derived state
 * (audit-rounds / openPlans) re-scans and re-evaluates to the SAME word
 * (idempotent re-derivation, pinned by the truth table), no new store.
 *
 * Decision 3 — partial/blocked explicit distinction (WI27 "显式区分"
 * operationalized):
 *   blocked = a persistent obstruction signal — R3 with heldPlans()>0 (the
 *             executable face is fully occupied by held plans) OR R4
 *             stagnation hit; when both factors stack (held>0 ∧ stagnation)
 *             the stronger signal `blocked` wins.
 *   partial = work incomplete with NO obstruction signal — R1 budget
 *             exhausted with the roadmap not all done (a resource boundary,
 *             not a deadlock — deliberately partial even when held>0, the
 *             budget exhaustion is the dominant cause) OR R3 with
 *             heldPlans()==0 (a pure completion gap: nothing draftable,
 *             nothing active).
 *   The policy declared face's compound value `partial/blocked` (a legal
 *   TRIGGER_TERMINAL_VALUES lexeme) is normalized to a concrete word by THIS
 *   core at the execution point — the policy declaration surface stays
 *   untouched, single-point normalization lives here.
 *
 * ── R1 alignment note (plan Phase 3) ────────────────────────────────────────
 * R1's budget-exhaustion path complements — never duplicates — the
 * audit-rounds-overflow DENY face (law-rules.mjs): the gate denies NEW
 * deep-audit dispatch lines when audit-rounds ≥ maxAuditRounds; this core
 * CLOSES the mission run (receipt + stop-dispatch) once the quiescence
 * condition also holds. Two faces, one budget, complementary behavior.
 *
 * ── R4 input seam (Deferred → WI30) ─────────────────────────────────────────
 * R4 consumes an INJECTED stagnation fact { rounds, threshold } — the
 * fingerprint detection machinery (ledger hash + activity signal over N
 * rounds) is WI30. This core only pins the input interface; the N threshold's
 * policy configuration key lands with WI30. No stagnation injected ⇒ R4 is
 * not evaluated.
 */
import { parseFrontmatter } from '../../assets/src/ledger-frontmatter.mjs'
import type { SupervisorDecision, SupervisorSnapshot } from './decision-core.ts'

// ── types ────────────────────────────────────────────────────────────────────

export type TerminationWord = 'completed' | 'partial' | 'blocked' | 'continue'
export type TerminationRule = 'R1' | 'R2' | 'R3' | 'R4'

/** WI30 stagnation fingerprint fact — injected, never computed here. */
export interface StagnationFact {
  /** consecutive stagnant rounds observed (ledger hash + activity signal unchanged). */
  rounds: number
  /** the N threshold the fact carries; the policy config key lands with WI30. */
  threshold: number
}

export interface TerminationLimits {
  maxAuditRounds: number
  maxFailures: number
  /** absent ⇒ R4 is not evaluated (no stagnation supplier until WI30). */
  stagnation?: StagnationFact
}

/**
 * The structural snapshot face the core consumes — SupervisorSnapshot
 * satisfies it structurally; tests may hand-build minimal literals.
 */
export interface TerminationSnapshotFace {
  derived: {
    draft: string[]
    active: string[]
    held: string[]
    open: string[]
    awaitingClosure: string[]
    expiredClaims: Array<{ path: string; claim: string; claimExpires: string }>
    roadmapCounts: { total: number; checked: number; unchecked: number }
    auditRounds: number
  }
  /** plan records (frontmatter face) — live-claim detection for R1's continue branch. */
  plans: Array<{ path: string; text: string }>
}

export interface TerminationEvaluation {
  decision: TerminationWord
  /** the rule that produced the word (null when continuing with no rule hit). */
  rule: TerminationRule | null
  reasons: string[]
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Paths of ACTIVE plans holding a NOT-yet-expired claim (R1's in-flight face). */
function liveClaimPathsOf(snapshot: TerminationSnapshotFace): Set<string> {
  const expired = new Set(snapshot.derived.expiredClaims.map((c) => c.path))
  const out = new Set<string>()
  for (const record of snapshot.plans) {
    const parsed = parseFrontmatter(record.text)
    if (!parsed.ok || parsed.range === null) continue
    const fm = parsed.fm as Record<string, unknown>
    if (fm.status !== 'active') continue
    if (typeof fm.claim !== 'string' || fm.claim === '') continue
    if (expired.has(record.path)) continue
    out.add(record.path)
  }
  return out
}

// ── the evaluation core (03 §8; pure, deterministic, idempotent) ────────────

/**
 * Evaluate R1→R4 IN ORDER over one snapshot; the first rule whose condition
 * holds decides (later rules are not evaluated — order priority is the
 * contract). Same (snapshot, limits) ⇒ same evaluation — restart re-scan
 * re-derives the same word (Decision 2 residual closure).
 */
export function evaluateTermination(snapshot: TerminationSnapshotFace, limits: TerminationLimits): TerminationEvaluation {
  const d = snapshot.derived
  const roadmapAllDone = d.roadmapCounts.total > 0 && d.roadmapCounts.unchecked === 0
  const roadmapUnchecked = d.roadmapCounts.unchecked > 0
  const liveClaims = liveClaimPathsOf(snapshot)

  // R1 — budget hard gate: audit-rounds ≥ maxAuditRounds ∧ (no active plans
  // or all active plans already quiesced into awaitingClosure).
  if (d.auditRounds >= limits.maxAuditRounds) {
    const inFlight = d.active.filter((p) => !d.awaitingClosure.includes(p))
    if (inFlight.length === 0) {
      if (roadmapAllDone && d.open.length === 0) {
        return {
          decision: 'completed',
          rule: 'R1',
          reasons: [
            `R1: audit-rounds ${d.auditRounds} ≥ maxAuditRounds ${limits.maxAuditRounds} with every active plan quiesced (awaitingClosure or none)`,
            `R1: roadmap all done (${d.roadmapCounts.checked}/${d.roadmapCounts.total}) ∧ openPlans()==0 — budget-exhausted clean close`,
          ],
        }
      }
      return {
        decision: 'partial',
        rule: 'R1',
        reasons: [
          `R1: audit-rounds ${d.auditRounds} ≥ maxAuditRounds ${limits.maxAuditRounds} — audit budget exhausted`,
          `R1: roadmap not all done (unchecked=${d.roadmapCounts.unchecked}) / open plans remain (${d.open.length}) — partial, never a silent completed (resource boundary is the dominant cause, 03 §8)`,
        ],
      }
    }
    const withLiveClaims = inFlight.filter((p) => liveClaims.has(p)).length
    return {
      decision: 'continue',
      rule: 'R1',
      reasons: [
        `R1 pending: ${inFlight.length} active plan(s) not yet quiesced (${withLiveClaims} with unexpired claims) — in-flight execution runs to completion / awaitingClosure, never killed early (03 §8; reclaim of dead claims = the 1411-2 reclaim face)`,
      ],
    }
  }

  // R2 — clean early exit: ≥1 audit round, roadmap all done, nothing open.
  if (d.auditRounds >= 1 && roadmapAllDone && d.open.length === 0) {
    return {
      decision: 'completed',
      rule: 'R2',
      reasons: [
        `R2: audit-rounds ${d.auditRounds} ≥ 1 ∧ roadmap all done (${d.roadmapCounts.checked}/${d.roadmapCounts.total}) ∧ openPlans()==0 — clean early exit`,
      ],
    }
  }

  // R3 — explicitly stuck: ≥1 audit round, nothing draftable, nothing active,
  // and (unchecked roadmap work or held plans). Drafts keep the loop in
  // review — never an early terminal while a draft exists.
  if (d.auditRounds >= 1 && d.draft.length === 0 && d.active.length === 0 && (roadmapUnchecked || d.held.length > 0)) {
    if (d.held.length > 0) {
      return {
        decision: 'blocked',
        rule: 'R3',
        reasons: [
          `R3: audit-rounds ${d.auditRounds} ≥ 1 ∧ draftPlans()==0 ∧ activePlans()==0 ∧ heldPlans()==${d.held.length} — the executable face is fully occupied by held plans (persistent obstruction; human unlock / disposition required)`,
        ],
      }
    }
    return {
      decision: 'partial',
      rule: 'R3',
      reasons: [
        `R3: audit-rounds ${d.auditRounds} ≥ 1 ∧ draftPlans()==0 ∧ activePlans()==0 ∧ roadmap unchecked=${d.roadmapCounts.unchecked} ∧ heldPlans()==0 — pure completion gap, no obstruction signal`,
      ],
    }
  }

  // R4 — stagnation circuit breaker: injected fact only (WI30 supplies the
  // fingerprint; this core pins the input seam).
  if (limits.stagnation !== undefined && limits.stagnation.rounds >= limits.stagnation.threshold) {
    return {
      decision: 'blocked',
      rule: 'R4',
      reasons: [
        `R4: stagnation fingerprint ${limits.stagnation.rounds} consecutive rounds ≥ threshold ${limits.stagnation.threshold} (ledger + activity signal unchanged) — stagnation circuit breaker (fact supplied by the WI30 detector)`,
      ],
    }
  }

  return {
    decision: 'continue',
    rule: null,
    reasons: [
      `no terminal rule hit: audit-rounds ${d.auditRounds} < ${limits.maxAuditRounds}, draft=${d.draft.length} active=${d.active.length} held=${d.held.length} open=${d.open.length}, roadmap unchecked=${d.roadmapCounts.unchecked}${
        limits.stagnation !== undefined ? `, stagnation ${limits.stagnation.rounds}/${limits.stagnation.threshold}` : ', no stagnation fact injected'
      } — loop continues`,
    ],
  }
}

// ── the declared TerminalDuty seam (decision-core.ts; implementation = this) ─

/**
 * The TerminalDuty implementation: run the core and surface a terminal
 * decision object (03 §2 receipt-type carrier) when a rule hits; [] while
 * continuing. The policy trigger terminal exit (R3's declared face) and the
 * watchdog's cycle evaluation BOTH land here — dual entry, one core.
 */
export function terminalDuty(
  snapshot: SupervisorSnapshot,
  policy: { maxAuditRounds: number; maxFailures?: number },
  _clock: () => number,
): SupervisorDecision[] {
  const evaluation = evaluateTermination(snapshot, {
    maxAuditRounds: policy.maxAuditRounds,
    maxFailures: policy.maxFailures ?? 3,
  })
  if (evaluation.decision === 'continue') return []
  const decision: SupervisorDecision = {
    type: 'receipt',
    posture: 'execute',
    face: 'receipt',
    action: `terminal:${evaluation.decision}`,
    target: snapshot.roadmapPath,
    reason: evaluation.reasons.join('; '),
    note: `rule ${evaluation.rule} (03 §8 sequential core) — receipt + mdcontrol.status + dispatch suppression; compound declared values normalize here`,
  }
  return [decision]
}

/**
 * Normalize a DECLARED terminal lexeme (`partial` | `blocked` |
 * `partial/blocked`, TRIGGER_TERMINAL_VALUES) against the core's evaluation:
 * the compound value resolves to the core's concrete word (Decision 3 —
 * single-point normalization inside the core, the policy surface stays
 * untouched). A core `continue` ALWAYS overrides a declared terminal — the
 * declared face defers to the sequential core (dual-entry same-source).
 */
export function normalizeDeclaredTerminal(
  declared: string,
  evaluation: TerminationEvaluation,
): { executes: boolean; word: TerminationWord; reason: string } {
  if (evaluation.decision === 'continue') {
    return {
      executes: false,
      word: 'continue',
      reason: `declared terminal ${JSON.stringify(declared)} deferred: the R1–R4 core says continue (${evaluation.reasons.join('; ')}) — declared face never overrides the sequential core`,
    }
  }
  return {
    executes: true,
    word: evaluation.decision,
    reason: `declared ${JSON.stringify(declared)} normalized to ${evaluation.decision} by rule ${evaluation.rule} (${evaluation.reasons.join('; ')})`,
  }
}
