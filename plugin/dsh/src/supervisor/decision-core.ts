/**
 * decision-core.ts — supervisor decision core: the pure judgment seam of the
 * watchdog loop (age-autonomy M3-WI25, plan
 * `docs/plans/age-autonomy/2026-08-26-1411-1` Phase 2).
 *
 * ── Interface contract (structural boundary definition, 00-plan-guide rule
 *    6 exception: extraction plans pin interface contracts) ──────────────────
 *
 *   decide(snapshot, policy, clock) → decisions[]
 *
 *   - snapshot  = the scanned ledger state of ONE project root: every plan
 *     under the governing mission's plansDir + the roadmap text, with the
 *     derived faces (predicate family draftPlans/activePlans/heldPlans/
 *     openPlans/awaitingClosure reused through the assets channel — the law
 *     kernel precedent, engine-side modules shared via build-bundle
 *     ALLOWED_MODULES) plus the clock-decidable machine-field faces (expired
 *     claims, roadmap counts, audit-rounds).
 *   - policy    = the resolved policy face ({ maxAuditRounds } today; the
 *     triggers/dispatch maps join with 1411-2).
 *   - clock     = injectable now() (epoch ms) — determinism under test.
 *   - decisions = the 03-supervisor §2 machine-registration type surface:
 *       type      ∈ 'dispatch' | 'meter-write' | 'receipt' | 'no-op'
 *       posture   ∈ 'observe' | 'execute'   (THIS plan: every decision is
 *                                       posture 'observe' — WI25 delivers
 *                                       the seam, not the executor)
 *       face      ∈ 'sustain' | 'trigger' | 'meter' | 'restart' | 'receipt'
 *
 *   Implemented judgments in THIS plan (snapshot × clock decidable only):
 *     1. expired claim      → meter-write/claim-reclaim, posture observe
 *                             (reclaim EXECUTION = 1411-2 reclaim trigger +
 *                             WI29 recovery semantics)
 *     2. awaitingClosure    → dispatch/mechanical-verification+closure-audit,
 *                             posture observe (03 §5.2 derived middle state)
 *     3. otherwise          → a single no-op decision
 *   Dispatch decisions are ALWAYS posture 'observe' + successor note until
 *   1411-2 wires the executor (plan Phase 1 Decision 3 default posture — no
 *   existing host gains unattended progression from this module).
 *
 * ── Successor access points (consumed by the sibling 1411-2/1411-3 plans) ──
 *   - 1411-2 trigger evaluation: read policy.triggers × snapshot.derived and
 *     emit dispatch decisions (posture 'execute'); the declared seam is
 *     `TriggerDuty` below — the successor implements the interface, this
 *     module keeps the pure decide() contract stable.
 *   - 1411-2 reclaim trigger: flip decision 1's posture to 'execute' (the
 *     writer face in ./writer.ts clears/re-issues the claim).
 *   - 1411-3 terminal evaluation: R1–R4 over snapshot.derived × policy —
 *     IMPLEMENTED in ./terminal-rules.ts (M3-WI27; the declared `TerminalDuty`
 *     seam below now has its implementation there — dual entry, one core).
 *   - sustain duty: `SustainDuty` below (agent idle ∧ ledger has work →
 *     followup/redispatch) — implementation = 1411-2.
 *
 * ── Phase 1 adjudications carried by this module (plan Phase 1) ─────────────
 *   - service form: DSH plugin form — supervisor is a second cordis service
 *     publication inside plugin/dsh (Service subclass precedent MdControlService;
 *     same bundle, same isolate realm, no new host entry). Independent CLI
 *     form is a documentation seam only (03 §6) until the M5 gate.
 *   - Q4 write-back routing: ③ the supervisor is the SOLE machine-field
 *     writer, serializing writes in-process (baseHash CAS + tmp+rename in
 *     ./writer.ts); AI sub-agents only ever submit proposed content (law
 *     gate enforcement on the AI tool face unchanged).
 *   - default posture: heartbeat scan on mount, but only meter/receipt/
 *     observation decisions — dispatch decisions stay no-op (see above).
 */
import { join } from 'node:path'
import {
  activePlans,
  awaitingClosure,
  draftPlans,
  heldPlans,
  openPlans,
  scanRoadmapLedger,
} from '../../assets/src/ledger-sections.mjs'
import { parseFrontmatter } from '../../assets/src/ledger-frontmatter.mjs'
import { defaultVerifyKeys } from '../../assets/src/verify-runner.mjs'
import { triggerDuty, type TriggerHit } from './trigger-eval.ts'
import {
  discoverLawContext,
  fsLawGateIo,
  readPlanRecordsUnder,
  type LawGateIo,
  type MissionLawContext,
} from '../law/host-adapter.ts'

// ── snapshot types ───────────────────────────────────────────────────────────

export interface SupervisorPlanRecord {
  path: string
  text: string
}

export interface ExpiredClaimFace {
  path: string
  claim: string
  claimExpires: string
}

export interface SupervisorSnapshotDerived {
  draft: string[]
  active: string[]
  held: string[]
  open: string[]
  awaitingClosure: string[]
  expiredClaims: ExpiredClaimFace[]
  roadmapCounts: { total: number; checked: number; unchecked: number }
  auditRounds: number
  /**
   * M3-WI26 trigger faces: the `_tmp/<runDir>/terminal-claim.json` action
   * records (nothing-claim-guard's interception face — consumed records are
   * renamed .consumed and never re-surface) and the roadmap DAR's most
   * recent accepted findings lexeme (null = no accepted line).
   */
  terminalClaims: Array<{ file: string; kind: string }>
  acceptedFindings: 'none' | 'items' | null
}

export interface SupervisorSnapshot {
  scannedAt: string
  projectRoot: string
  plansDir: string
  roadmapPath: string | null
  plans: SupervisorPlanRecord[]
  roadmap: { path: string; text: string } | null
  derived: SupervisorSnapshotDerived
}

/** The resolved policy face decide() consumes (extends with 1411-2). */
export interface SupervisorPolicyFace {
  maxAuditRounds: number
  /** circuit-breaker bound, policy-limits-first / mission-flow-fallback (M3-WI27). */
  maxFailures?: number
  /** policy `triggers:` section — present ⇒ decide() runs the trigger duty (M3-WI26). */
  triggers?: Array<{ when: string; dispatch?: string; action?: string; terminal?: string }>
  /** mission default verify keys (commands.* ∩ the standard key order — verify-runner same source). */
  defaultVerifyKeys?: string[]
}

// ── decision types ───────────────────────────────────────────────────────────

export type SupervisorDecisionType = 'dispatch' | 'meter-write' | 'receipt' | 'no-op'
export type SupervisorDecisionPosture = 'observe' | 'execute'
export type SupervisorDutyFace = 'sustain' | 'trigger' | 'meter' | 'restart' | 'receipt'

export interface SupervisorDecision {
  type: SupervisorDecisionType
  posture: SupervisorDecisionPosture
  face: SupervisorDutyFace
  action: string
  target: string | null
  reason: string
  /** successor wiring annotation (1411-2 / 1411-3 / WI29) */
  note?: string
}

/** The 03 §2 machine-field decision carriers (meter duty). */
export interface MeterWriteDecision extends SupervisorDecision {
  type: 'meter-write'
  field: 'claim' | 'claim-expires' | 'failures' | 'audit-rounds'
  target: string
}

// ── declared duty seams (implementation = 1411-2 / 1411-3; plan Non-Goals) ──

/** sustain duty (03 §2): agent idle ∧ ledger has work → continue the loop. */
export interface SustainDuty {
  (snapshot: SupervisorSnapshot, policy: SupervisorPolicyFace, clock: () => number): SupervisorDecision[]
}

/** trigger duty (03 §3, policy triggers: section → dispatch maps) — 1411-2. */
export interface TriggerDuty {
  (snapshot: SupervisorSnapshot, policy: SupervisorPolicyFace, clock: () => number): SupervisorDecision[]
}

/** terminal duty (03 §8 R1–R4 terminal rule set) — implemented in ./terminal-rules.ts (M3-WI27). */
export interface TerminalDuty {
  (snapshot: SupervisorSnapshot, policy: SupervisorPolicyFace, clock: () => number): SupervisorDecision[]
}

// ── scan (ledger state → snapshot; predicates reused through assets) ────────

export interface ScanSupervisorSnapshotOptions {
  projectRoot: string
  /** governing law context (policy/plansDir/roadmapPath); when omitted it is
   * discovered from the project root's missions/ through the adapter face. */
  lawCtx?: MissionLawContext | null
  io?: LawGateIo
  /** plan corpus cap (readPlanRecordsUnder default 200). */
  scanCap?: number
  now?: () => string
  clock?: () => number
}

function expiredClaimsOf(records: SupervisorPlanRecord[], clock: () => number): ExpiredClaimFace[] {
  const now = clock()
  const out: ExpiredClaimFace[] = []
  for (const r of records) {
    const parsed = parseFrontmatter(r.text)
    if (!parsed.ok || parsed.range === null) continue
    const fm = parsed.fm as Record<string, unknown>
    if (fm.status !== 'active') continue
    const claim = fm.claim
    const expires = fm['claim-expires']
    if (typeof claim !== 'string' || typeof expires !== 'string') continue
    const expiry = Date.parse(expires)
    if (Number.isNaN(expiry)) continue
    if (expiry <= now) out.push({ path: r.path, claim, claimExpires: expires })
  }
  return out
}

/**
 * Scan one project root into a supervisor snapshot. Pure over the injected
 * IO seam; the law-context discovery is cached by the caller when the
 * watchdog reuses one context across cycles.
 */
export function scanSupervisorSnapshot(options: ScanSupervisorSnapshotOptions): SupervisorSnapshot | null {
  const { projectRoot } = options
  const io = options.io ?? fsLawGateIo
  const readText = io.readTextFile ?? (() => null)
  const lawCtx =
    options.lawCtx !== undefined ? options.lawCtx : discoverLawContext(join(projectRoot, 'missions'), io)
  if (lawCtx === null || lawCtx.plansDir === '') return null

  const plans = lawCtx.plansDir !== '' ? readPlanRecordsUnder(lawCtx.plansDir, io, options.scanCap) : []
  const roadmap =
    lawCtx.roadmapPath !== '' && lawCtx.roadmapPath !== null
      ? (() => {
          const text = readText(lawCtx.roadmapPath)
          return text === null ? null : { path: lawCtx.roadmapPath, text }
        })()
      : null

  const clock = options.clock ?? (() => Date.now())
  const roadmapScan = roadmap !== null ? scanRoadmapLedger(roadmap.text) : null
  const roadmapFm =
    roadmapScan !== null && !roadmapScan.fmError && roadmapScan.hasFrontmatter
      ? (roadmapScan.fm as Record<string, unknown> | null)
      : null

  const acceptedOf = (): 'none' | 'items' | null => {
    if (roadmapScan === null || roadmapScan.deepAuditRecord == null) return null
    const accepted = roadmapScan.deepAuditRecord.accepted ?? []
    const last = accepted.length > 0 ? accepted[accepted.length - 1] : null
    return last !== null && (last.findings === 'none' || last.findings === 'items') ? last.findings : null
  }

  return {
    scannedAt: (options.now ?? (() => new Date().toISOString()))(),
    projectRoot,
    plansDir: lawCtx.plansDir,
    roadmapPath: lawCtx.roadmapPath !== '' ? lawCtx.roadmapPath : null,
    plans,
    roadmap,
    derived: {
      draft: draftPlans(plans),
      active: activePlans(plans),
      held: heldPlans(plans),
      open: openPlans(plans),
      awaitingClosure: awaitingClosure(plans),
      expiredClaims: expiredClaimsOf(plans, clock),
      roadmapCounts:
        roadmapScan !== null && !roadmapScan.fmError && roadmapScan.hasFrontmatter
          ? { total: roadmapScan.counts.total, checked: roadmapScan.counts.checked, unchecked: roadmapScan.counts.unchecked }
          : { total: 0, checked: 0, unchecked: 0 },
      auditRounds:
        roadmapFm !== null && typeof roadmapFm['audit-rounds'] === 'number'
          ? (roadmapFm['audit-rounds'] as number)
          : 0,
      terminalClaims: terminalClaimsUnder(projectRoot, io),
      acceptedFindings: acceptedOf(),
    },
  }
}

/**
 * Scan the `_tmp/<runDir>/terminal-claim.json` action-record face (02 §4.4 —
 * the same record nothing-claim-guard intercepts; consumed records are
 * renamed `.consumed` by the exec arm and never re-surface). Fail-soft: a
 * torn/unparseable record contributes nothing.
 */
function terminalClaimsUnder(projectRoot: string, io: LawGateIo): Array<{ file: string; kind: string }> {
  const runs = io.listDirEntries(join(projectRoot, '_tmp'))
  if (runs === null) return []
  const out: Array<{ file: string; kind: string }> = []
  for (const run of runs.slice(0, 50)) {
    const dir = join(projectRoot, '_tmp', run)
    if (!io.isDirectory(dir)) continue
    const file = join(dir, 'terminal-claim.json')
    const text = io.readTextFile(file)
    if (text === null) continue
    try {
      const parsed = JSON.parse(text) as { kind?: unknown }
      if (parsed !== null && typeof parsed === 'object' && typeof parsed.kind === 'string') {
        out.push({ file, kind: parsed.kind })
      }
    } catch {
      // torn record — fail-soft
    }
  }
  return out
}

/** The law context the snapshot scan resolved (policy face for decide()). */
export function policyFaceOf(lawCtx: MissionLawContext): SupervisorPolicyFace {
  const policy = lawCtx.policy as { triggers?: Array<{ when: string; dispatch?: string; action?: string; terminal?: string }> }
  return {
    maxAuditRounds: lawCtx.maxAuditRounds,
    ...(lawCtx.maxFailures !== undefined ? { maxFailures: lawCtx.maxFailures } : {}),
    ...(Array.isArray(policy.triggers) && policy.triggers.length > 0 ? { triggers: policy.triggers } : {}),
    ...(Object.keys(lawCtx.commands).length > 0 ? { defaultVerifyKeys: defaultVerifyKeys(lawCtx.commands) } : {}),
  }
}

// ── decide (pure; the watchdog loop's judgment step, 03 §3) ─────────────────

/**
 * Decide what the supervisor should do about ONE snapshot. Deterministic:
 * same (snapshot, policy, clock) → same decisions.
 *
 * M3-WI26 integration: when the policy face carries a `triggers:` section,
 * the TRIGGER DUTY owns the judgment (./trigger-eval.ts — execute-posture
 * decisions the watchdog's exec arm carries out; the WI25 heuristic
 * observations are superseded because the trigger set covers their faces:
 * expired-claim observe → reclaim-claim action, awaitingClosure observe →
 * mechanical-verification/closure-audit dispatches). Without a triggers
 * section the WI25 legacy observe-only posture is byte-compatible
 * (existing hosts without triggers gain nothing unattended).
 */
export function decide(
  snapshot: SupervisorSnapshot,
  policy: SupervisorPolicyFace,
  clock: () => number,
): SupervisorDecision[] {
  if (Array.isArray(policy.triggers) && policy.triggers.length > 0) {
    return triggerDuty(
      snapshot,
      policy,
      clock,
      policy.defaultVerifyKeys !== undefined ? { defaultVerifyKeys: policy.defaultVerifyKeys } : {},
    ) as unknown as SupervisorDecision[]
  }
  return legacyDecide(snapshot, policy, clock)
}

/** Re-exported for the exec arm/wiring (the TriggerDuty implementation). */
export { triggerDuty }
export type { TriggerHit }

function legacyDecide(
  snapshot: SupervisorSnapshot,
  policy: SupervisorPolicyFace,
  clock: () => number,
): SupervisorDecision[] {
  const nowIso = new Date(clock()).toISOString()
  const decisions: SupervisorDecision[] = []

  for (const c of snapshot.derived.expiredClaims) {
    const decision: MeterWriteDecision = {
      type: 'meter-write',
      posture: 'observe',
      face: 'meter',
      action: 'claim-reclaim',
      field: 'claim',
      target: c.path,
      reason: `claim ${c.claim} expired at ${c.claimExpires} (clock ${nowIso}) — 03 §5 reclaim face`,
      note: 'reclaim execution = 1411-2 reclaim trigger (writer.ts clear/re-issue) + WI29 recovery semantics',
    }
    decisions.push(decision)
  }

  for (const p of snapshot.derived.awaitingClosure) {
    decisions.push({
      type: 'dispatch',
      posture: 'observe',
      face: 'trigger',
      action: 'mechanical-verification+closure-audit',
      target: p,
      reason: 'active ∧ all-checked ∧ no audit receipt — awaitingClosure derived middle state (01 §5.2)',
      note: 'dispatch wiring = 1411-2 (policy triggers: full-tick → mechanical-verification → closure-audit); dispatch decisions stay no-op until then (plan Phase 1 Decision 3)',
    })
  }

  if (decisions.length === 0) {
    decisions.push({
      type: 'no-op',
      posture: 'observe',
      face: 'meter',
      action: 'idle',
      target: null,
      reason: `no snapshot×clock-decidable face (${nowIso}): no expired claims, no awaitingClosure plans`,
    })
  }
  return decisions
}
