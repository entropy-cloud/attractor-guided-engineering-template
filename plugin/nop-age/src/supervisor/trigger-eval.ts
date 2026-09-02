/**
 * trigger-eval.ts — supervisor trigger evaluation core (age-autonomy M3-WI26,
 * plan `docs/plans/age-autonomy/2026-08-26-1411-2` Phase 1).
 *
 * The pure judgment seam behind the `TriggerDuty` interface declared in
 * ./decision-core.ts (03-supervisor §3): policy `triggers:` entries parsed by
 * the shared law-policy parseTriggerWhen (syntax + 14-predicate vocabulary,
 * already schema-pinned since M2) are EVALUATED here over a ledger snapshot ×
 * injected clock — zero IO, deterministic, same inputs → same hits.
 *
 * ── Dual evaluation domain (plan Phase 1 Decision) ───────────────────────────
 *   per-plan predicates (evaluated against ONE plan record at a time):
 *     plan.full-tick · plan.status=<v> · mechanical-verification-missing ·
 *     mechanical-verification-pass · closure-receipt-missing ·
 *     review-dispatch-missing · claim-expired
 *   mission-level predicates (evaluated once per snapshot):
 *     draftPlans() · activePlans() · heldPlans() · roadmap.unchecked ·
 *     roadmap.all-done · deep-audit.accepted-findings=<v> ·
 *     terminal-claim=<v> (reads the `_tmp/<runDir>/terminal-claim.json`
 *     action-record face — the same record nothing-claim-guard intercepts;
 *     the scan face injects the resolved kinds, 02 §4.4)
 * A trigger whose predicate tree contains ANY per-plan predicate is evaluated
 * for every plan record (02 §3 examples judge `plan.status=draft` per plan);
 * pure mission triggers evaluate once. Both domains are pinned by the truth
 * table (7 policy triggers × positive/negative).
 *
 * ── Fail-soft discipline (plan Phase 1 Decision) ────────────────────────────
 * cmp/call form type violations (non-number comparison with a numeric-only
 * operator, malformed claim expiry, absent roadmap/DAR faces) are EVALUATION
 * ERRORS carried on the decision (`errors[]`) — the errored predicate reads
 * as false and the supervisor never crashes on malformed ledger data.
 *
 * ── Idempotency material (03 §5) ────────────────────────────────────────────
 * Every hit carries its occurrenceKey material `<planPath>#<occurrenceType>@
 * <hash8-of-the-relevant-ledger-section>` — a ledger-DERIVED value, no second
 * store: the registration checks (dispatch lines / pass lines / claim fields)
 * that make re-dispatch refuse live in the exec arm (Phase 2/3 wiring).
 */
import { parseTriggerWhen } from '../../assets/src/law-policy.mjs'
import { scanPlanLedger, scanRoadmapLedger, splitLedgerSections } from '../../assets/src/ledger-sections.mjs'
import { sha256Text } from '../../assets/src/law-core.mjs'
import type { SupervisorPlanRecord, SupervisorSnapshot } from './decision-core.ts'

// ── trigger spec (parsed policy face; shapes validated by law-policy) ───────

export interface TriggerSpec {
  when: string
  dispatch?: string
  action?: string
  terminal?: string
}

export interface TerminalClaimFace {
  file: string
  kind: string
}

// ── per-plan derived state (01 §5.2 derivation domains) ─────────────────────

export interface PlanTriggerState {
  path: string
  status: string | null
  /** active ∧ all-checked over the counting domain (Phase + Closure Findings). */
  fullTick: boolean
  /** every resolvable verify key has an exit=0 pass line. */
  mechanicalVerificationPass: boolean
  /** ¬pass (missing pass lines; no-verify-keys reads as missing, M2-WI44 fail-closed). */
  mechanicalVerificationMissing: boolean
  /** Closure has no paired dispatch+accepted audit receipt. */
  closureReceiptMissing: boolean
  /** Draft Review Record has no dispatch review line. */
  reviewDispatchMissing: boolean
  /** claim present ∧ claim-expires ≤ clock (malformed expiry = false + error, fail-soft). */
  claimExpired: boolean
  verifyKeys: string[] | null
  /** plan frontmatter `agent:` override (legal-name check happens at resolution). */
  agent: string | null
  errors: string[]
}

// Minimal structural faces of the assets scan results (untyped .mjs imports).
interface PlanScanFace {
  fm: Record<string, unknown> | null
  counts: { total: number; checked: number; unchecked: number }
  verification: { passes: Array<{ key: string; exit: number }> } | null
  closure: { pairs: string[] } | null
  draftReviewRecord: { dispatches: Array<{ id: string; valid: boolean }> } | null
}

function scanPlan(recordText: string): PlanScanFace {
  return scanPlanLedger(recordText) as unknown as PlanScanFace
}

function sectionTextOf(text: string, title: string): string {
  const split = splitLedgerSections(text)
  for (const block of split.blocks) {
    if (block.level === 2 && block.text === title) return block.lines.join('\n')
  }
  return ''
}

function resolveVerifyKeysOf(fm: Record<string, unknown> | null, defaultVerifyKeys: string[] | undefined, errors: string[]): string[] | null {
  const verify = fm ? fm.verify : undefined
  if (Array.isArray(verify)) {
    if (verify.length === 0) {
      errors.push('plan.verify is an explicit empty array — rejected semantics (M2-WI44), treated as no-verify-keys')
      return null
    }
    const keys = verify.filter((k): k is string => typeof k === 'string')
    if (keys.length !== verify.length) errors.push('plan.verify carries non-string elements — ignored')
    return keys
  }
  if (verify !== undefined) {
    errors.push('plan.verify is not an array — treated as no-verify-keys')
    return null
  }
  if (defaultVerifyKeys !== undefined && defaultVerifyKeys.length > 0) return [...defaultVerifyKeys]
  return null
}

/** Derive ONE plan record's trigger state (pure; scan-based, no IO). */
export function planTriggerStateOf(
  record: SupervisorPlanRecord,
  options: { defaultVerifyKeys?: string[]; clock: () => number },
): PlanTriggerState {
  const errors: string[] = []
  const scan = scanPlan(record.text)
  const fm = scan.fm
  const status = fm !== null && typeof fm.status === 'string' ? fm.status : null
  const allChecked = scan.counts.unchecked === 0 && scan.counts.total > 0
  const verifyKeys = resolveVerifyKeysOf(fm, options.defaultVerifyKeys, errors)

  const passes = scan.verification ? scan.verification.passes : []
  const satisfying = new Set(passes.filter((p) => p.exit === 0).map((p) => p.key))
  const mechanicalVerificationPass = verifyKeys !== null && verifyKeys.length > 0 && verifyKeys.every((k) => satisfying.has(k))
  if (verifyKeys === null) errors.push('no-verify-keys resolvable (plan.verify absent and no mission default) — mechanical-verification reads missing (fail-closed)')

  const closurePairs = scan.closure ? scan.closure.pairs : []
  const reviewDispatches = scan.draftReviewRecord ? scan.draftReviewRecord.dispatches : []

  let claimExpired = false
  if (fm !== null) {
    const claim = fm.claim
    const expires = fm['claim-expires']
    if (typeof claim === 'string' && claim !== '') {
      if (typeof expires !== 'string') {
        errors.push(`plan carries claim without a string claim-expires (claim=${JSON.stringify(claim)}) — claim-expired reads false (fail-soft)`)
      } else {
        const expiry = Date.parse(expires)
        if (Number.isNaN(expiry)) {
          errors.push(`claim-expires ${JSON.stringify(expires)} is not a parseable timestamp — claim-expired reads false (fail-soft)`)
        } else {
          claimExpired = expiry <= options.clock()
        }
      }
    }
  }

  return {
    path: record.path,
    status,
    fullTick: status === 'active' && allChecked,
    mechanicalVerificationPass,
    mechanicalVerificationMissing: !mechanicalVerificationPass,
    closureReceiptMissing: closurePairs.length === 0,
    reviewDispatchMissing: reviewDispatches.filter((d) => d.valid !== false).length === 0,
    claimExpired,
    verifyKeys,
    agent: fm !== null && typeof fm.agent === 'string' ? fm.agent : null,
    errors,
  }
}

// ── mission-level state ──────────────────────────────────────────────────────

export interface MissionTriggerState {
  draft: number
  active: number
  held: number
  roadmapUnchecked: boolean
  roadmapAllDone: boolean
  /** most recent accepted line's findings lexeme in roadmap `## Deep Audit Record` (null = no accepted line). */
  acceptedFindings: 'none' | 'items' | null
  terminalClaims: TerminalClaimFace[]
  errors: string[]
}

/** Derive the mission-level trigger state from a snapshot face (pure). */
export function missionTriggerStateOf(snapshot: SupervisorSnapshot, terminalClaims: TerminalClaimFace[] = []): MissionTriggerState {
  const errors: string[] = []
  const roadmap = snapshot.roadmap
  let acceptedFindings: 'none' | 'items' | null = null
  let roadmapUnchecked = false
  let roadmapAllDone = false
  if (roadmap !== null) {
    const scan = scanRoadmapLedger(roadmap.text)
    roadmapUnchecked = scan.counts.unchecked > 0
    roadmapAllDone = scan.counts.total > 0 && scan.counts.unchecked === 0
    const accepted = scan.deepAuditRecord ? scan.deepAuditRecord.accepted : []
    const last = accepted.length > 0 ? accepted[accepted.length - 1] : null
    if (last !== null && (last.findings === 'none' || last.findings === 'items')) acceptedFindings = last.findings
    else if (last !== null) errors.push('roadmap DAR accepted line carries no findings lexeme (grammar violation) — deep-audit.accepted-findings reads false')
  }
  const derivedTerminal = (snapshot.derived as { terminalClaims?: TerminalClaimFace[] }).terminalClaims
  const claims = terminalClaims.length > 0 ? terminalClaims : derivedTerminal ?? []
  return {
    draft: snapshot.derived.draft.length,
    active: snapshot.derived.active.length,
    held: snapshot.derived.held.length,
    roadmapUnchecked,
    roadmapAllDone,
    acceptedFindings,
    terminalClaims: claims,
    errors,
  }
}

// ── when-tree evaluation (atom/cmp/call × and/or/not; fail-soft) ────────────

const PLAN_DOMAIN_PREDICATES = new Set([
  'plan.full-tick',
  'plan.status',
  'mechanical-verification-missing',
  'mechanical-verification-pass',
  'closure-receipt-missing',
  'review-dispatch-missing',
  'claim-expired',
])

export type WhenAst =
  | { kind: 'and'; left: WhenAst; right: WhenAst }
  | { kind: 'or'; left: WhenAst; right: WhenAst }
  | { kind: 'not'; inner: WhenAst }
  | { kind: 'predicate'; name: string; call: boolean; op: string | null; value: string | number | null }

function astHasPlanPredicate(node: WhenAst): boolean {
  if (node.kind === 'predicate') return PLAN_DOMAIN_PREDICATES.has(node.name)
  if (node.kind === 'not') return astHasPlanPredicate(node.inner)
  return astHasPlanPredicate(node.left) || astHasPlanPredicate(node.right)
}

const STRING_OPS = new Set(['=', '==', '!='])

function evalPredicate(
  node: Extract<WhenAst, { kind: 'predicate' }>,
  plan: PlanTriggerState | null,
  mission: MissionTriggerState,
  errors: string[],
): boolean {
  const name = node.name
  const fail = (msg: string): boolean => {
    errors.push(msg)
    return false
  }

  // per-plan predicates
  if (PLAN_DOMAIN_PREDICATES.has(name)) {
    if (plan === null) {
      errors.push(`predicate ${name} is per-plan but evaluated at mission domain (misroute) — reads false`)
      return false
    }
    switch (name) {
      case 'plan.full-tick':
        return plan.fullTick
      case 'plan.status': {
        if (node.op === null) return fail(`predicate plan.status requires a comparison`)
        if (typeof node.value !== 'string') return fail(`plan.status compares against a status word (got ${JSON.stringify(node.value)})`)
        if (!STRING_OPS.has(node.op)) {
          return fail(`plan.status is a string comparison — operator "${node.op}" needs numbers (fail-soft, non-number comparison)`)
        }
        const actual = plan.status
        if (actual === null) return false
        return node.op === '!=' ? actual !== node.value : actual === node.value
      }
      case 'mechanical-verification-missing':
        return plan.mechanicalVerificationMissing
      case 'mechanical-verification-pass':
        return plan.mechanicalVerificationPass
      case 'closure-receipt-missing':
        return plan.closureReceiptMissing
      case 'review-dispatch-missing':
        return plan.reviewDispatchMissing
      case 'claim-expired':
        return plan.claimExpired
      default:
        return fail(`unknown per-plan predicate ${name}`)
    }
  }

  // mission-level predicates
  switch (name) {
    case 'draftPlans':
    case 'activePlans':
    case 'heldPlans': {
      if (!node.call) return fail(`predicate ${name} must be called as ${name}()`)
      if (node.op === null || typeof node.value !== 'number') return fail(`predicate ${name}() requires a numeric comparison`)
      const count = name === 'draftPlans' ? mission.draft : name === 'activePlans' ? mission.active : mission.held
      return compareNumeric(count, node.op, node.value)
    }
    case 'roadmap.unchecked':
      return mission.roadmapUnchecked
    case 'roadmap.all-done':
      return mission.roadmapAllDone
    case 'deep-audit.accepted-findings': {
      if (typeof node.value !== 'string') return fail(`deep-audit.accepted-findings compares against none|items (got ${JSON.stringify(node.value)})`)
      if (!STRING_OPS.has(node.op ?? '')) {
        return fail(`deep-audit.accepted-findings is a string comparison — operator "${node.op}" needs numbers (fail-soft)`)
      }
      if (mission.acceptedFindings === null) return false
      return node.op === '!=' ? mission.acceptedFindings !== node.value : mission.acceptedFindings === node.value
    }
    case 'terminal-claim': {
      if (typeof node.value !== 'string') return fail(`terminal-claim compares against a claim kind word (got ${JSON.stringify(node.value)})`)
      if (!STRING_OPS.has(node.op ?? '')) {
        return fail(`terminal-claim is a string comparison — operator "${node.op}" needs numbers (fail-soft)`)
      }
      const kinds = mission.terminalClaims.map((c) => c.kind)
      const hit = kinds.includes(node.value)
      return node.op === '!=' ? !hit : hit
    }
    default:
      return fail(`unknown predicate ${name}`)
  }
}

function compareNumeric(actual: number, op: string, expected: number): boolean {
  switch (op) {
    case '=':
    case '==':
      return actual === expected
    case '!=':
      return actual !== expected
    case '>':
      return actual > expected
    case '<':
      return actual < expected
    case '>=':
      return actual >= expected
    case '<=':
      return actual <= expected
    default:
      return false
  }
}

function evalNode(node: WhenAst, plan: PlanTriggerState | null, mission: MissionTriggerState, errors: string[]): boolean {
  if (node.kind === 'and') return evalNode(node.left, plan, mission, errors) && evalNode(node.right, plan, mission, errors)
  if (node.kind === 'or') return evalNode(node.left, plan, mission, errors) || evalNode(node.right, plan, mission, errors)
  if (node.kind === 'not') return !evalNode(node.inner, plan, mission, errors)
  return evalPredicate(node, plan, mission, errors)
}

/** Evaluate one `when` expression text against one domain context (fail-soft). */
export function evaluateTriggerWhen(
  when: string,
  context: { plan?: PlanTriggerState | null; mission: MissionTriggerState },
): { hit: boolean; errors: string[] } {
  const errors: string[] = []
  const parsed = parseTriggerWhen(when)
  if (!parsed.ok) return { hit: false, errors: [`when parse error: ${parsed.error}`] }
  const hit = evalNode(parsed.ast as WhenAst, context.plan ?? null, context.mission, errors)
  return { hit, errors }
}

// ── occurrenceKey material (03 §5: ledger-derived, no second store) ─────────

export type OccurrenceType = 'review' | 'execution' | 'audit' | 'reclaim' | 'verification' | 'draft' | 'deep-audit' | 'terminal'

export function hash8(text: string): string {
  return sha256Text(text).slice(0, 8)
}

export function occurrenceKeyOf(subject: string, type: OccurrenceType, relevantLedgerText: string): string {
  return `${subject}#${type}@${hash8(relevantLedgerText)}`
}

// ── trigger decisions (the TriggerDuty output face) ─────────────────────────

export interface TriggerHit {
  type: 'dispatch' | 'meter-write' | 'receipt'
  posture: 'execute'
  face: 'trigger'
  action: string
  target: string | null
  reason: string
  trigger: {
    index: number
    when: string
    exit: 'dispatch' | 'action' | 'terminal'
    exitValue: string
    domain: 'plan' | 'mission'
  }
  occurrence: { key: string; type: OccurrenceType }
  errors: string[]
}

export interface TriggerEvalOptions {
  /** mission default verify keys (commands.* intersection — verify-runner defaultVerifyKeys, same source). */
  defaultVerifyKeys?: string[]
  /** `_tmp/<runDir>/terminal-claim.json` faces; defaults to the snapshot-derived list. */
  terminalClaims?: TerminalClaimFace[]
}

const OCCURRENCE_OF_DISPATCH: Record<string, OccurrenceType> = {
  'plan-review': 'review',
  'closure-audit': 'audit',
  'deep-audit': 'deep-audit',
  'mechanical-verification': 'verification',
  execute: 'execution',
  'draft-plans': 'draft',
}

/**
 * The trigger duty (03-supervisor §3): evaluate every policy trigger over the
 * snapshot × clock, per-plan and mission domains, and emit execute-posture
 * decisions. Pure — the exec arm (Phase 3) owns every side effect.
 */
export function triggerDuty(
  snapshot: SupervisorSnapshot,
  policy: { triggers?: TriggerSpec[] },
  clock: () => number,
  options: TriggerEvalOptions = {},
): TriggerHit[] {
  const triggers = Array.isArray(policy.triggers) ? policy.triggers : []
  if (triggers.length === 0) return []

  const plans = snapshot.plans.filter((p) => {
    const state = scanPlanLedger(p.text)
    return state.hasFrontmatter && state.fmError === null
  })
  const planStates = plans.map((p) => planTriggerStateOf(p, { defaultVerifyKeys: options.defaultVerifyKeys, clock }))
  const mission = missionTriggerStateOf(snapshot, options.terminalClaims)
  const roadmapPath = snapshot.roadmapPath

  const hits: TriggerHit[] = []
  triggers.forEach((trig, index) => {
    const parsed = parseTriggerWhen(trig.when)
    if (!parsed.ok) {
      hits.push({
        type: 'receipt',
        posture: 'execute',
        face: 'trigger',
        action: 'trigger-parse-error',
        target: null,
        reason: `triggers[${index}].when failed to parse — trigger inert (fail-soft; law-policy validates policy at load, this is the runtime backstop)`,
        trigger: { index, when: trig.when, exit: 'dispatch', exitValue: '', domain: 'mission' },
        occurrence: { key: `triggers[${index}]#parse-error`, type: 'terminal' },
        errors: [parsed.error],
      })
      return
    }
    const ast = parsed.ast as WhenAst
    const perPlan = astHasPlanPredicate(ast)
    const exit = trig.dispatch !== undefined ? 'dispatch' : trig.action !== undefined ? 'action' : 'terminal'
    const exitValue = trig.dispatch ?? trig.action ?? trig.terminal ?? ''

    const emit = (domain: 'plan' | 'mission', plan: PlanTriggerState | null, planText: string | null): void => {
      const errors: string[] = [...(plan?.errors ?? []), ...mission.errors]
      const hit = evalNode(ast, plan, mission, errors)
      if (!hit) return
      const target = plan !== null ? plan.path : roadmapPath
      let occurrenceType: OccurrenceType = 'terminal'
      let relevant = ''
      if (exit === 'dispatch') occurrenceType = OCCURRENCE_OF_DISPATCH[exitValue] ?? 'execution'
      else if (exit === 'action') occurrenceType = 'reclaim'
      if (planText !== null) {
        relevant =
          occurrenceType === 'review'
            ? sectionTextOf(planText, 'Draft Review Record')
            : occurrenceType === 'audit'
              ? sectionTextOf(planText, 'Closure')
              : occurrenceType === 'verification'
                ? sectionTextOf(planText, 'Verification')
                : occurrenceType === 'reclaim'
                  ? planText
                  : ''
      } else if (snapshot.roadmap !== null) {
        relevant = sectionTextOf(snapshot.roadmap.text, 'Deep Audit Record')
      }
      const key = occurrenceKeyOf(target ?? '-', occurrenceType, relevant)
      hits.push({
        type: exit === 'dispatch' ? 'dispatch' : exit === 'action' ? 'meter-write' : 'receipt',
        posture: 'execute',
        face: 'trigger',
        action: exit === 'dispatch' ? exitValue : exit === 'action' ? exitValue : `terminal:${exitValue}`,
        target,
        reason:
          exit === 'terminal'
            ? `trigger[${index}] ${trig.when} → terminal ${exitValue} — declared face; executed through the R1–R4 core (M3-WI27: compound value normalized, core continue defers)`
            : `trigger[${index}] ${trig.when} → ${exit} ${exitValue} (${domain} domain)`,
        trigger: { index, when: trig.when, exit, exitValue, domain },
        occurrence: { key, type: occurrenceType },
        errors,
      })
    }

    if (perPlan) {
      for (let i = 0; i < plans.length; i++) emit('plan', planStates[i]!, plans[i]!.text)
    } else {
      emit('mission', null, null)
    }
  })
  return hits
}
