/**
 * dispatch-resolve.ts — supervisor dispatch resolution chain (age-autonomy
 * M3-WI26, plan `docs/plans/age-autonomy/2026-08-26-1411-2` Phase 2;
 * 02-rule-law §4.9 "who works" deployment mapping).
 *
 * Chain: dispatch type → policy `dispatch:` mapping → named agent def →
 * binding, with:
 *   - plan frontmatter `agent:` override routing (legal name → override the
 *     default mapping; missing/undefined name → dispatch: default + note —
 *     01 §4.1 field table: the plan may only REFERENCE policy agent names,
 *     actual binding is resolved by the dispatcher);
 *   - DSH-form model composition → the three ModelSelection fields
 *     agentProvider/agentModel/reasoningEffort (fills the native-executor
 *     documented gap — packaging doc §Behavioral differences;
 *     dsh-agent ModelSelection face);
 *   - independent-form = config.js model/variant/agentFile channel reuse
 *     (pure parsing layer + documentation seam ONLY — no CLI runner in this
 *     plan, 1411-1 service-form ruling);
 *   - requireDistinctModel runtime enforcement (0815-2 WI14 residual
 *     closure): the dispatch point compares the auditor's ACTUAL bound pair
 *     against the executor's through the ONE shared `sameModelPair` pure
 *     function extracted from checkDistinctModelSatisfiability — three
 *     states: satisfied / refused (no downgrade declared) / explicitly
 *     degraded (`downgrade: single-model` → dispatch proceeds with an honest
 *     `models=` lineage written into the dispatch line, 02 §4.9).
 *
 * Idempotency face (03 §5): `dispatchAlreadyRegistered` answers "已派/已完/
 * 被谁持有" by RE-SCANNING the ledger (dispatch lines / pass lines / claim
 * fields) — ledger-derived, no second store; the receipt JSONL carries the
 * occurrence registry for the one dispatch type with no ledger grammar
 * (draft-plans).
 */
import { randomBytes } from 'node:crypto'
import { basename } from 'node:path'
import { sameModelPair } from '../../assets/src/law-policy.mjs'
import { scanPlanLedger, scanRoadmapLedger } from '../../assets/src/ledger-sections.mjs'

interface PlanScanFace {
  draftReviewRecord: { dispatches: Array<{ id: string }> } | null
  closure: { dispatches: Array<{ id: string }>; unpairedDispatches: string[] } | null
}

interface RoadmapScanFace {
  deepAuditRecord: { dispatches: Array<{ id: string }>; unpairedDispatches: string[] } | null
}

// ── policy faces (parsed/validated upstream by law-policy) ──────────────────

export interface AgentModelDef {
  provider?: unknown
  model?: unknown
  reasoningEffort?: unknown
}

export interface AgentDefFace {
  mode?: unknown
  poolKey?: unknown
  model?: AgentModelDef
  requireDistinctModel?: unknown
  downgrade?: unknown
}

export interface PolicyFace {
  agents?: Record<string, AgentDefFace>
  dispatch?: Record<string, string>
}

export const DISPATCH_TYPES = [
  'plan-review',
  'closure-audit',
  'deep-audit',
  'mechanical-verification',
  'execute',
  'draft-plans',
] as const

export type DispatchType = (typeof DISPATCH_TYPES)[number]

/** The audit-family dispatch types the distinct-model floor applies to (02 §4.9). */
const AUDIT_DISPATCH_TYPES: readonly DispatchType[] = ['closure-audit', 'deep-audit']

// ── binding resolution ───────────────────────────────────────────────────────

export interface AgentModelBinding {
  agentName: string
  mode: 'pooled' | 'fresh' | 'unknown'
  provider: string
  model: string
  reasoningEffort: string | undefined
  /** the policy `model: {…}` face (raw pair for sameModelPair comparisons). */
  modelDef: AgentModelDef
}

export type DispatchSource = 'plan-agent-override' | 'dispatch-default' | 'dispatch-default+unknown-plan-agent'

export interface DispatchResolution {
  dispatchType: DispatchType
  agentName: string
  binding: AgentModelBinding
  source: DispatchSource
  notes: string[]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Resolve one dispatch type to its named agent + binding. Pure; never throws
 * (an unresolvable dispatch returns `ok: false` with the refusal reason —
 * the caller records it and refuses THAT dispatch only).
 */
export function resolveDispatch(options: {
  dispatchType: DispatchType
  policy: PolicyFace
  /** plan frontmatter `agent:` override (null = absent). */
  planAgent?: string | null
}): { ok: true; resolution: DispatchResolution } | { ok: false; reason: string } {
  const { dispatchType, policy } = options
  const planAgent = options.planAgent ?? null
  const notes: string[] = []
  const agents = isPlainObject(policy.agents) ? policy.agents : {}
  const dispatchMap = isPlainObject(policy.dispatch) ? policy.dispatch : {}

  let agentName: string | null = null
  let source: DispatchSource = 'dispatch-default'
  if (planAgent !== null && planAgent !== '') {
    if (Object.prototype.hasOwnProperty.call(agents, planAgent)) {
      agentName = planAgent
      source = 'plan-agent-override'
      notes.push(`plan frontmatter agent:${planAgent} overrides the dispatch: default (${dispatchMap[dispatchType] ?? 'none'})`)
    } else {
      source = 'dispatch-default+unknown-plan-agent'
      notes.push(`plan frontmatter agent:${planAgent} is not a policy agents: name — dispatch: default applies (01 §4.1: plans may only reference defined names)`)
    }
  }
  if (agentName === null) {
    const mapped = dispatchMap[dispatchType]
    if (typeof mapped !== 'string' || mapped === '') {
      return { ok: false, reason: `dispatch type "${dispatchType}" has no policy dispatch: mapping — refuse this dispatch (02 §4.9)` }
    }
    agentName = mapped
  }

  const def = agents[agentName]
  if (!isPlainObject(def)) {
    return { ok: false, reason: `dispatch type "${dispatchType}" resolved to agent "${agentName}" which is not defined under policy agents: — refuse this dispatch (02 §4.9)` }
  }
  const modelDef = isPlainObject(def.model) ? (def.model as AgentModelDef) : {}
  const provider = typeof modelDef.provider === 'string' && modelDef.provider !== '' ? modelDef.provider : ''
  const model = typeof modelDef.model === 'string' && modelDef.model !== '' ? modelDef.model : ''
  if (provider === '' || model === '') {
    return { ok: false, reason: `agent "${agentName}" has no resolvable model {provider, model} pair — refuse this dispatch (02 §4.9 binding floor)` }
  }
  const mode = def.mode === 'pooled' || def.mode === 'fresh' ? def.mode : 'unknown'
  const binding: AgentModelBinding = {
    agentName,
    mode,
    provider,
    model,
    reasoningEffort: typeof modelDef.reasoningEffort === 'string' ? modelDef.reasoningEffort : undefined,
    modelDef,
  }
  return { ok: true, resolution: { dispatchType, agentName, binding, source, notes } }
}

// ── DSH-form model composition (three ModelSelection fields) ────────────────

/**
 * The DSH host ModelSelection composition for one binding (fills the
 * native-executor documented gap — packaging doc §Behavioral differences):
 * `agentProvider` / `agentModel` ride `agents.create` agentOptions, and
 * `reasoningEffort` rides the dsh-agent ModelSelection face installed on the
 * agent-scoped context (`installModelSelection`, the sdk-jsonrpc-server /
 * dsh-headless precedent).
 */
export interface DshModelSelection {
  agentProvider: string
  agentModel: string
  reasoningEffort: string | undefined
}

export function dshModelSelectionOf(binding: AgentModelBinding): DshModelSelection {
  return {
    agentProvider: binding.provider,
    agentModel: binding.model,
    reasoningEffort: binding.reasoningEffort,
  }
}

// ── independent-form channel (config.js reuse — pure parsing seam only) ─────

/**
 * Independent-form channel mapping (02 §4.9 双形态映射; 1411-1 ruling: no CLI
 * runner in this plan — this is the documented seam). config.js carries
 * `model` (mission model passthrough) / `variant` / `agentFile` (driver
 * persona file, pi driver); a policy binding maps onto that channel as:
 *   model     → binding.model (provider-owned model id, same value the DSH
 *               face passes as agentModel)
 *   variant   → undefined (no policy face — mission config owns it)
 *   agentFile → undefined (driver persona; stays a mission/driver concern)
 * Provider selection is driver-credential env in the independent form (the
 * engine config has no provider field); reasoningEffort has NO config.js
 * carrier today (documented residual — the M5 independent-form gate decides
 * whether config.js grows the field).
 */
export interface IndependentChannel {
  model: string
  variant: undefined
  agentFile: undefined
  notes: string[]
}

export function independentChannelOf(binding: AgentModelBinding): IndependentChannel {
  return {
    model: binding.model,
    variant: undefined,
    agentFile: undefined,
    notes: [
      `provider ${binding.provider} maps to the independent-form driver credential env (config.js has no provider field)`,
      binding.reasoningEffort !== undefined
        ? `reasoningEffort ${binding.reasoningEffort} has no config.js carrier (documented residual, M5 independent-form gate)`
        : 'no reasoningEffort declared',
    ],
  }
}

// ── requireDistinctModel runtime enforcement (three states) ─────────────────

export interface DistinctModelEnforcement {
  status: 'satisfied' | 'refused' | 'downgraded'
  /** refusal reason (status=refused) or the honest lineage note (downgraded). */
  reason: string
  /** the ` models={exec:…,aud:…}` lineage suffix for the dispatch line (02 §4.1 G4). */
  lineage: string
}

function lineagePairOf(binding: AgentModelBinding): string {
  return `${binding.provider}/${binding.model}`
}

/**
 * Enforce the distinct-model floor AT THE DISPATCH POINT (0815-2 WI14
 * residual closure): when the target agent of an audit-family dispatch
 * declares `requireDistinctModel: true`, its ACTUAL bound provider/model pair
 * must differ from the executor binding's pair — through the ONE shared
 * `sameModelPair` (extracted from the static check; zero second
 * implementation). Same pair + no declared downgrade → refuse THAT dispatch
 * with an explicit observation reason; `downgrade: single-model` declared →
 * proceed degraded with the honest `models=` lineage (never silent, 02 §4.9).
 */
export function enforceDistinctModel(options: {
  dispatchType: DispatchType
  policy: PolicyFace
  resolution: DispatchResolution
  executorBinding: AgentModelBinding
}): DistinctModelEnforcement {
  const { dispatchType, policy, resolution, executorBinding } = options
  const agents = isPlainObject(policy.agents) ? policy.agents : {}
  const def = agents[resolution.agentName]
  const requiresDistinct = isPlainObject(def) && def.requireDistinctModel === true

  const execPair = lineagePairOf(executorBinding)
  const audPair = lineagePairOf(resolution.binding)
  const lineage = ` models={exec:${execPair},aud:${audPair}}`

  if (!requiresDistinct || !AUDIT_DISPATCH_TYPES.includes(dispatchType)) {
    return { status: 'satisfied', reason: `no requireDistinctModel floor on ${resolution.agentName} for ${dispatchType}`, lineage }
  }
  if (!sameModelPair(resolution.binding.modelDef, executorBinding.modelDef)) {
    return { status: 'satisfied', reason: `distinct-model floor satisfied: auditor ${resolution.agentName} ${audPair} ≠ executor ${executorBinding.agentName} ${execPair}`, lineage }
  }
  if (isPlainObject(def) && def.downgrade === 'single-model') {
    return {
      status: 'downgraded',
      reason: `single-model deployment declared (02 §4.9): auditor ${resolution.agentName} ${audPair} == executor ${executorBinding.agentName} ${execPair} — dispatch proceeds with the honest models= lineage`,
      lineage,
    }
  }
  return {
    status: 'refused',
    reason: `requireDistinctModel unsatisfied at dispatch time: auditor ${resolution.agentName} ${audPair} equals executor ${executorBinding.agentName} ${execPair} and no downgrade: single-model is declared — refusing this ${dispatchType} dispatch (02 §4.9; change the auditor model or declare the explicit downgrade)`,
    lineage,
  }
}

// ── dispatch-line ids + registration material (01 §4.4 grammar) ─────────────

const HEX8_RE = /^[0-9a-f]{8}$/

/** Next ledger dispatch id: `#<review|audit>-<runId>-<stem>-<n>-<nonce8>`. */
export function nextDispatchId(options: {
  kind: 'review' | 'audit'
  runId: string
  /** plan or roadmap file stem (no extension). */
  stem: string
  /** next iteration/round number (caller derives from existing lines + 1). */
  counter: number
  nonce?: string
}): string {
  const nonce = options.nonce ?? randomBytes(4).toString('hex')
  if (!HEX8_RE.test(nonce)) throw new Error(`nonce must be 8 hex chars (got ${JSON.stringify(nonce)})`)
  return `#${options.kind}-${options.runId}-${options.stem}-${options.counter}-${nonce}`
}

export function stemOf(filePath: string): string {
  return basename(filePath).replace(/\.(md|json)$/u, '')
}

/** Count existing valid dispatch lines of the kind in one section scan face. */
export function nextCounterOf(existingDispatchIds: string[], prefix: string): number {
  let max = 0
  for (const id of existingDispatchIds) {
    if (!id.startsWith(prefix)) continue
    const tail = id.slice(prefix.length)
    const m = tail.match(/^(\d+)-[0-9a-f]{8}$/)
    if (m !== null) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

// ── occurrence idempotency (03 §5 — re-scan the ledger, no second store) ────

export interface OccurrenceDedupFace {
  /** true when THIS occurrence is already registered / already answered. */
  already: boolean
  detail: string
}

/**
 * Answer "already dispatched?" from the ledger itself: dispatch lines, pass
 * lines and claim fields ARE the registry (03 §5). The one dispatch type
 * with no ledger grammar (draft-plans) dedups against the receipt JSONL —
 * the durable dispatch record — keyed by the ledger-derived occurrenceKey.
 */
export function dispatchAlreadyRegistered(options: {
  occurrenceType: string
  /** plan text when the occurrence targets a plan (null for mission-level). */
  planText: string | null
  /** roadmap text when the occurrence is mission-level (deep-audit/draft-plans). */
  roadmapText: string | null
  /** prior receipt lines (the draft-plans registry face). */
  receiptLines: string[]
  occurrenceKey: string
}): OccurrenceDedupFace {
  const { occurrenceType, planText, roadmapText, receiptLines, occurrenceKey } = options
  if (occurrenceType === 'review') {
    const scan = planText !== null ? (scanPlanLedger(planText) as unknown as PlanScanFace) : null
    const dispatches = scan?.draftReviewRecord?.dispatches ?? []
    if (dispatches.length > 0) return { already: true, detail: `Draft Review Record already carries ${dispatches.length} dispatch review line(s) (first id ${dispatches[0]?.id})` }
    return { already: false, detail: 'no dispatch review line in Draft Review Record' }
  }
  if (occurrenceType === 'audit') {
    const scan = planText !== null ? (scanPlanLedger(planText) as unknown as PlanScanFace) : null
    const dispatches = scan?.closure?.dispatches ?? []
    if (dispatches.length > 0) return { already: true, detail: `Closure already carries ${dispatches.length} dispatch audit line(s) (first id ${dispatches[0]?.id})` }
    return { already: false, detail: 'no dispatch audit line in Closure' }
  }
  if (occurrenceType === 'deep-audit') {
    const scan = roadmapText !== null ? (scanRoadmapLedger(roadmapText) as unknown as RoadmapScanFace) : null
    const unpaired = scan?.deepAuditRecord?.unpairedDispatches ?? []
    if (unpaired.length > 0) return { already: true, detail: `roadmap Deep Audit Record has an unpaired dispatch audit line in flight (${unpaired[0]})` }
    return { already: false, detail: 'no unpaired deep-audit dispatch in the roadmap DAR' }
  }
  if (occurrenceType === 'draft') {
    const marker = `"occurrenceKey":"${occurrenceKey}"`
    if (receiptLines.some((l) => l.includes(marker))) {
      return { already: true, detail: `draft-plans occurrence ${occurrenceKey} already dispatched (supervisor receipt record)` }
    }
    return { already: false, detail: 'no receipt record for this draft-plans occurrence' }
  }
  // verification / execution / reclaim occurrences are guarded by their own
  // predicates (pass lines, claim fields) — no separate registry face.
  return { already: false, detail: `${occurrenceType} occurrences are predicate-guarded (ledger state answers directly)` }
}
