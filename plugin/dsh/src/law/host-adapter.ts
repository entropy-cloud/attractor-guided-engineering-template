/**
 * host-adapter.ts — law-kernel host glue for the DSH face (age-autonomy
 * M2-WI12, plan docs/plans/age-autonomy/2026-08-25-0815-1 Phase 3).
 *
 * What it does: per pending file-write tool call (write / edit /
 * str_replace_editor create|str_replace|insert — the extraction family the
 * retired plan-status-gate established, M3-WI13), discover the nearest
 * ancestor mission context with an `autonomyPolicy`, load + validate the
 * policy through the bundled law kernel copy (assets/src/law-policy.mjs —
 * engine-side placement ruling, 0815-1 Phase 1), resolve the actor from
 * `exec.agent` (Explore conclusion: `Agent.id: SessionId` is available, role
 * is NOT inferable on this face → structural-subset posture with an
 * `unverified-writer` note; role inference is M3 supervisor scope), evaluate
 * the law kernel, and record every observation to the observation-log face
 * (`_tmp/law-observations.jsonl`, one JSON line per matched gate) + a logger
 * one-liner.
 *
 * Posture: gate modes come from the policy (observe | enforce — the kernel
 * records observe would-denies without blocking; the 0815-2/3 + WI21 + WI22
 * batches register enforce faces). The enforce-deny return path rides the
 * policy, not this adapter (02 §6 rolling discipline).
 * Any internal failure fails OPEN (allow + warn, the M3-WI13 D1 lineage):
 * a gate crash must never break the host tool pipeline.
 *
 * Solo listener since WI22 retired the run-state plan-status gate: this is
 * the ONLY tools/pre-execute mount in the service; the only caches are
 * policy snapshots keyed by ancestor dir (staleness accepted for M2
 * observe-only; document-reload discipline lands with enforce stages).
 */
import { appendFileSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { evaluateGates } from '../../assets/src/law-core.mjs'
import { loadPolicyFile, policyAgentNames, resolveMaxAuditRounds } from '../../assets/src/law-policy.mjs'
import { isLawProtectedPath, LEGACY_TERMINAL_PLAN_STATUSES, legacyPlanStatusOf } from '../../assets/src/law-rules.mjs'
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

const LAW_TAG = '[mdcontrol law gate]'

// ── IO seam (pure adapter logic stays unit-testable; production = node:fs) ──

export interface LawGateIo {
  readTextFile(path: string): string | null
  listDirEntries(path: string): string[] | null
  isDirectory(path: string): boolean
  realPath(path: string): string | null
  appendLine(file: string, line: string): void
}

export const fsLawGateIo: LawGateIo = {
  readTextFile(path) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  },
  listDirEntries(path) {
    try {
      return readdirSync(path)
    } catch {
      return null
    }
  },
  isDirectory(path) {
    try {
      return statSync(path).isDirectory()
    } catch {
      return false
    }
  },
  realPath(path) {
    try {
      return realpathSync(path)
    } catch {
      return null
    }
  },
  appendLine(file, line) {
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, line + '\n', 'utf8')
  },
}

// ── proposed-content extraction (plan-status-gate pattern, no prefilter) ────

function applyReplacement(content: string, oldStr: string, newStr: string, all: boolean): string {
  if (!content.includes(oldStr)) return content
  if (all) return content.split(oldStr).join(newStr)
  return content.replace(oldStr, newStr)
}

function applyInsert(content: string, newStr: string, insertLine: number | undefined): string {
  const lines = content.split('\n')
  const at = insertLine === undefined ? lines.length : Math.max(0, Math.min(lines.length, insertLine))
  lines.splice(at, 0, newStr)
  return lines.join('\n')
}

export interface LawToolCall {
  readonly name: string
  readonly arguments: unknown
}

/**
 * Extract { targetPath, proposedContent, disk } for the adjudicated file-write
 * surface. Law gates are structural (any plan-path write matters, not just
 * status-line touches) so there is no status prefilter; `disk` carries the
 * pre-write content for CAS-grade currentFileState when it was read anyway.
 */
export function extractLawAction(
  call: LawToolCall,
  io: LawGateIo,
): { targetPath: string; proposedContent: string; disk: string | null } | null {
  const args = (call.arguments ?? null) as Record<string, unknown> | null
  if (!args || typeof args !== 'object') return null

  if (call.name === 'write') {
    const filePath = args.file_path
    const content = args.content
    if (typeof filePath !== 'string' || filePath === '' || typeof content !== 'string') return null
    return { targetPath: filePath, proposedContent: content, disk: null }
  }

  if (call.name === 'edit') {
    const filePath = args.file_path
    const oldStr = args.old_string
    const newStr = args.new_string
    if (typeof filePath !== 'string' || filePath === '' || typeof oldStr !== 'string' || typeof newStr !== 'string') return null
    const replaceAll = args.replace_all === true
    const disk = io.readTextFile(resolve(filePath))
    if (disk === null) return { targetPath: filePath, proposedContent: newStr, disk: null }
    return { targetPath: filePath, proposedContent: applyReplacement(disk, oldStr, newStr, replaceAll), disk }
  }

  if (call.name === 'str_replace_editor') {
    const command = args.command
    const path = args.path
    if (typeof path !== 'string' || path === '') return null
    if (command === 'create') {
      const fileText = args.file_text
      if (typeof fileText !== 'string') return null
      return { targetPath: path, proposedContent: fileText, disk: null }
    }
    if (command === 'str_replace') {
      const oldStr = args.old_str
      const newStr = args.new_str
      if (typeof oldStr !== 'string' || typeof newStr !== 'string') return null
      const disk = io.readTextFile(resolve(path))
      if (disk === null) return { targetPath: path, proposedContent: newStr, disk: null }
      return { targetPath: path, proposedContent: applyReplacement(disk, oldStr, newStr, false), disk }
    }
    if (command === 'insert') {
      const newStr = args.new_str
      if (typeof newStr !== 'string') return null
      const insertLine = typeof args.insert_line === 'number' ? args.insert_line : undefined
      const disk = io.readTextFile(resolve(path))
      if (disk === null) return { targetPath: path, proposedContent: newStr, disk: null }
      return { targetPath: path, proposedContent: applyInsert(disk, newStr, insertLine), disk }
    }
    return null
  }

  return null
}

// ── actor resolution (0815-1 Phase 1 Explore conclusion) ────────────────────

export interface LawActorFace {
  id?: string
}

/** `exec.agent?.id` is the only identity signal on the pre-execute face. */
export function resolveLawActor(exec: Pick<ToolExecution, 'agent'>): { actor?: LawActorFace } {
  const id = (exec.agent as { id?: unknown } | undefined)?.id
  if (typeof id === 'string' && id !== '') return { actor: { id } }
  return {}
}

// ── mission-context policy discovery (ancestor walk, cached) ────────────────

export interface MissionLawContext {
  projectRoot: string
  policy: Record<string, unknown> & { gates?: unknown[] }
  plansDir: string
  roadmapPath: string
  agentNames: string[]
  /** mission commands.* map — injected as gate ctx for verify-keys (0815-3). */
  commands: Record<string, string>
  /** policy-limits-first / mission-flow-fallback budget (0815-1 ruling). */
  maxAuditRounds: number
}

function toPosix(p: string): string {
  return p.split('\\').join('/')
}

function ancestorsOf(start: string): string[] {
  const out: string[] = []
  let cur = resolve(dirname(start))
  for (;;) {
    out.push(cur)
    const parent = dirname(cur)
    if (parent === cur) return out
    cur = parent
  }
}

/**
 * Nearest ancestor with a missions/*.json carrying `autonomyPolicy`; the
 * policy loads + validates through the bundled copy once per ancestor
 * (cache). Returns null when no policy governs the path — the adapter is
 * inert for that call.
 */
export function discoverLawContext(targetPath: string, io: LawGateIo, cache = new Map<string, MissionLawContext | null>()): MissionLawContext | null {
  for (const ancestor of ancestorsOf(targetPath)) {
    if (!cache.has(ancestor)) {
      cache.set(ancestor, loadLawContextAt(ancestor, io))
    }
    const found = cache.get(ancestor)
    if (found) return found
  }
  return null
}

function loadLawContextAt(ancestor: string, io: LawGateIo): MissionLawContext | null {
  const missions = io.listDirEntries(join(ancestor, 'missions'))
  if (missions === null) return null
  const parsed: Array<{ file: string; mission: {
    autonomyPolicy?: unknown
    plansDir?: unknown
    roadmapPath?: unknown
    name?: unknown
    commands?: unknown
    flow?: unknown
  } }> = []
  for (const entry of missions) {
    if (!entry.endsWith('.json')) continue
    const text = io.readTextFile(join(ancestor, 'missions', entry))
    if (text === null) continue
    try {
      parsed.push({ file: entry, mission: JSON.parse(text) })
    } catch {
      continue
    }
  }
  // one-mission-one-roadmap boundary (01-file-ledger boundary clause,
  // M2-WI21): a roadmap declared by two missions makes the mission set
  // ambiguous — this ancestor contributes no law context at all (fail-fast
  // load face; the engine mission-check CLI surfaces the structured error
  // naming the conflicting missions).
  const roadmapClaims = new Map<string, string[]>()
  for (const { file, mission } of parsed) {
    if (typeof mission.roadmapPath === 'string' && mission.roadmapPath !== '') {
      const abs = toPosix(resolve(ancestor, mission.roadmapPath))
      if (!roadmapClaims.has(abs)) roadmapClaims.set(abs, [])
      roadmapClaims.get(abs)!.push(typeof mission.name === 'string' && mission.name !== '' ? mission.name : file)
    }
  }
  for (const names of roadmapClaims.values()) {
    if (names.length > 1) return null
  }
  for (const { mission } of parsed) {
    if (typeof mission.autonomyPolicy !== 'string' || mission.autonomyPolicy === '') continue
    const policyFile = resolve(ancestor, mission.autonomyPolicy)
    const loaded = (() => {
      try {
        return loadPolicyFile(policyFile)
      } catch {
        return null
      }
    })()
    if (loaded === null || !loaded.ok) continue
    const commands: Record<string, string> = {}
    if (mission.commands !== null && typeof mission.commands === 'object' && !Array.isArray(mission.commands)) {
      for (const [k, v] of Object.entries(mission.commands as Record<string, unknown>)) {
        if (typeof v === 'string') commands[k] = v
      }
    }
    // Budget resolution (0815-1 ruling; consumer switch = 0815-3): policy
    // limits are authoritative, the mission-level `flow.maxAuditRounds`
    // override is the fallback. The engine flows JSON fallback channel stays
    // engine-side — the M3 supervisor resolves it at its dispatch point.
    const maxAuditRounds = resolveMaxAuditRounds(loaded.policy, mission)
    return {
      projectRoot: ancestor,
      policy: loaded.policy as MissionLawContext['policy'],
      plansDir: typeof mission.plansDir === 'string' && mission.plansDir !== '' ? toPosix(resolve(ancestor, mission.plansDir)) : '',
      roadmapPath: typeof mission.roadmapPath === 'string' && mission.roadmapPath !== '' ? toPosix(resolve(ancestor, mission.roadmapPath)) : '',
      agentNames: policyAgentNames(loaded.policy),
      commands,
      maxAuditRounds,
    }
  }
  return null
}

// ── plans-roots passive scan (M2-WI21 path-guardrail domain face) ───────────

/**
 * Known plans roots at one ancestor: default docs/plans + missions/*.json
 * plansDir values (plan-status-gate knownPlansRootsAt precedent; malformed
 * mission configs contribute zero roots; extends deliberately UNRESOLVED —
 * light parse).
 */
function knownPlansRootsAt(ancestor: string, io: LawGateIo): string[] {
  const roots = [toPosix(join(ancestor, 'docs', 'plans'))]
  const missions = io.listDirEntries(join(ancestor, 'missions'))
  if (missions !== null) {
    for (const entry of missions) {
      if (!entry.endsWith('.json')) continue
      const text = io.readTextFile(join(ancestor, 'missions', entry))
      if (text === null) continue
      try {
        const mission = JSON.parse(text) as { plansDir?: unknown }
        if (typeof mission.plansDir === 'string' && mission.plansDir !== '') {
          roots.push(toPosix(resolve(ancestor, mission.plansDir)))
        }
      } catch {
        // malformed mission config contributes no plans root
      }
    }
  }
  return roots
}

/**
 * Plans roots across EVERY ancestor of the target (the path-guardrail legal
 * domain union — 02 §4.7 via the passive-scan precedent). Per-ancestor
 * results cached like law contexts.
 */
export function discoverPlansRoots(targetPath: string, io: LawGateIo, cache = new Map<string, string[]>()): string[] {
  const roots: string[] = []
  for (const ancestor of ancestorsOf(targetPath)) {
    if (!cache.has(ancestor)) cache.set(ancestor, knownPlansRootsAt(ancestor, io))
    roots.push(...cache.get(ancestor)!)
  }
  return roots
}

/**
 * Plan records under the governing mission's plansDir (recursively, capped) —
 * the approved-project exception corpus for the P8 face. Read fresh per
 * protected-path evaluation (plans change during runs; protected writes are
 * rare enough that the walk is cheap).
 */
export function readPlanRecordsUnder(dir: string, io: LawGateIo, cap = 200): Array<{ text: string, path: string }> {
  const records: Array<{ text: string, path: string }> = []
  const walk = (d: string, depth: number): void => {
    if (records.length >= cap || depth > 4) return
    const entries = io.listDirEntries(d)
    if (entries === null) return
    for (const name of entries) {
      const p = join(d, name)
      if (io.isDirectory(p)) {
        walk(p, depth + 1)
      } else if (name.endsWith('.md')) {
        const text = io.readTextFile(p)
        if (text !== null) records.push({ text, path: toPosix(p) })
        if (records.length >= cap) return
      }
    }
  }
  walk(dir, 0)
  return records
}

// ── observation sink ────────────────────────────────────────────────────────

/**
 * Cheap pre-check for the legacy-plan-freeze corpus walk (M2-WI22): does
 * either face of this call touch a legacy TERMINAL `> Plan Status:` line?
 * The shared kernel matcher decides; the adapter only schedules IO.
 */
function legacyFreezeFaceActive(proposedContent: string, disk: string | null): boolean {
  const proposed = legacyPlanStatusOf(proposedContent);
  if (proposed !== null && LEGACY_TERMINAL_PLAN_STATUSES.includes(proposed)) return true;
  if (disk === null) return false;
  const current = legacyPlanStatusOf(disk);
  return current !== null && LEGACY_TERMINAL_PLAN_STATUSES.includes(current);
}


export interface LawObservationRecord {
  ts: string
  face: 'dsh-pre-execute'
  tool: string
  path: string
  actor: { id: string } | 'structural-subset'
  gateId: string
  rule: string
  mode: string
  verdict: string
  reason: string | null
  notes: string[]
  enforced: boolean
}

export function observationFileFor(projectRoot: string): string {
  return join(projectRoot, '_tmp', 'law-observations.jsonl')
}

// ── core evaluation (pure over the IO seam) ─────────────────────────────────

/**
 * Evaluate one pending tool call against the governing policy. Pure apart
 * from the injected IO seam. Never throws to the caller in production (the
 * registration wrapper fail-opens); returns the kernel decision plus the
 * observation records for the sink.
 */
export function evaluateLawCall(
  call: LawToolCall,
  actor: { actor?: LawActorFace },
  io: LawGateIo,
  cache = new Map<string, MissionLawContext | null>(),
  rootsCache = new Map<string, string[]>(),
): { decision: 'allow' | 'deny'; reason: string | null; records: LawObservationRecord[]; lawCtx: MissionLawContext | null } {
  const extracted = extractLawAction(call, io)
  if (extracted === null) return { decision: 'allow', reason: null, records: [], lawCtx: null }
  const { targetPath, proposedContent, disk } = extracted

  const lawCtx = discoverLawContext(resolve(targetPath), io, cache)
  if (lawCtx === null) return { decision: 'allow', reason: null, records: [], lawCtx: null }

  // Roadmap registry for the work-item registration face (M2-WI21): read
  // fresh per evaluation — a cached copy could deny/admit against a stale
  // registry once gates run enforce.
  const roadmapText = lawCtx.roadmapPath !== '' ? io.readTextFile(lawCtx.roadmapPath) : null

  // P8 face (M2-WI21 law-self-protection): protected-path writes need the
  // approved-project corpus to evaluate the active-plan exception — inject
  // the governing mission's plan records (absent corpus = fail-closed deny
  // inside the rule, the adversarial posture).
  const protectedPlans =
    lawCtx.plansDir !== '' && isLawProtectedPath(resolve(targetPath), lawCtx.projectRoot)
      ? readPlanRecordsUnder(lawCtx.plansDir, io)
      : null

  // legacy-plan-freeze face (M2-WI22): terminal-line carries/rewrites need
  // the same corpus for the approved-project exception. Terminal-line writes
  // are rare (once per plan lifecycle), so the walk fires only on the
  // terminal-face pre-check — the judgment itself stays inside the rule
  // (legacyPlanStatusOf is the one shared matcher).
  const freezePlans =
    lawCtx.plansDir !== '' && legacyFreezeFaceActive(proposedContent, disk)
      ? readPlanRecordsUnder(lawCtx.plansDir, io)
      : null

  const corpus = protectedPlans ?? freezePlans

  const out = evaluateGates(
    {
      type: 'write',
      path: targetPath,
      proposedContent,
      // id-only actor (Explore conclusion): role is not inferable on this
      // face — the kernel treats it as structural-subset (unverified-writer).
      ...(actor.actor ? { actor: { id: actor.actor.id } } : {}),
    },
    {
      policy: lawCtx.policy,
      currentFileState: disk === null ? undefined : { text: disk },
      ctx: {
        plansDir: lawCtx.plansDir,
        roadmapPath: lawCtx.roadmapPath,
        agentNames: lawCtx.agentNames,
        commands: lawCtx.commands,
        maxAuditRounds: lawCtx.maxAuditRounds,
        projectRoot: lawCtx.projectRoot,
        plansRoots: discoverPlansRoots(resolve(targetPath), io, rootsCache),
        ...(roadmapText !== null ? { roadmapText } : {}),
        ...(corpus !== null ? { plans: corpus } : {}),
      },
    },
  )

  const records: LawObservationRecord[] = out.observations.map((o) => ({
    ts: new Date().toISOString(),
    face: 'dsh-pre-execute',
    tool: call.name,
    path: targetPath,
    actor: actor.actor?.id ? { id: actor.actor.id } : 'structural-subset',
    gateId: o.gateId,
    rule: o.rule,
    mode: o.mode,
    verdict: o.verdict,
    reason: o.reason,
    notes: out.notes,
    enforced: o.mode === 'enforce' && o.verdict === 'deny' && out.decision === 'deny',
  }))
  return { decision: out.decision, reason: out.reason, records, lawCtx }
}

// ── subscription wiring (service.ts mounts this) ────────────────────────────

export interface LawGateLogger {
  warn?(message: string, fields?: Record<string, unknown>): void
  info?(message: string, fields?: Record<string, unknown>): void
}

/**
 * Register the law gate on one cordis context. Plain (non-agent-scoped)
 * context → receives ALL host tool calls (same carrier discipline as
 * plan-status-gate: only agent-scoped listeners are scope-filtered).
 * Non-matching calls and no-policy paths delegate to next() with minimal IO.
 * Returns the cordis listener disposer.
 */
export function registerLawGate(ctx: Context, logger?: LawGateLogger, io: LawGateIo = fsLawGateIo): () => void {
  const cache = new Map<string, MissionLawContext | null>()
  const rootsCache = new Map<string, string[]>()
  const listener = async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    let result: ReturnType<typeof evaluateLawCall>
    try {
      result = evaluateLawCall({ name: exec.name, arguments: exec.arguments }, resolveLawActor(exec), io, cache, rootsCache)
    } catch (err) {
      // Fail-open (D1 lineage): a gate crash must never break the host pipeline.
      logger?.warn?.(`${LAW_TAG} internal error — failing open`, {
        error: err instanceof Error ? err.message : String(err),
      })
      return next()
    }
    const { decision, reason, records, lawCtx } = result
    if (records.length > 0 && lawCtx !== null) {
      const file = observationFileFor(lawCtx.projectRoot)
      for (const rec of records) {
        try {
          io.appendLine(file, JSON.stringify(rec))
        } catch (err) {
          logger?.warn?.(`${LAW_TAG} observation log append failed`, {
            file,
            error: err instanceof Error ? err.message : String(err),
          })
        }
        logger?.info?.(`${LAW_TAG} ${rec.mode} ${rec.rule} → ${rec.verdict} on ${rec.path}`, {
          scope: 'mdcontrol',
          gate: rec.gateId,
          rule: rec.rule,
          mode: rec.mode,
          verdict: rec.verdict,
          reason: rec.reason,
          notes: rec.notes,
          actor: rec.actor,
        })
      }
    }
    if (decision === 'deny') {
      logger?.warn?.(reason ?? `${LAW_TAG} denied`, { scope: 'mdcontrol', gate: 'law' })
      return { kind: 'deny', reason: reason ?? `${LAW_TAG} denied by policy` }
    }
    return next()
  }
  return ctx.on('tools/pre-execute', listener)
}

/** Re-exported for the service mount log. */
export function lawGateMountSummary(): string {
  return 'tools/pre-execute law gate (M2-WI12 + WI21): policy-driven evaluate over write/edit/str_replace_editor via the bundled law kernel; actor=exec.agent.id (role not inferable — structural-subset posture); ctx carries plansDir/roadmapPath/agentNames/commands/maxAuditRounds + WI21 faces (projectRoot, passive-scan plansRoots, fresh roadmapText for work-item registration, mission plan records for protected-path P8 evaluations); one-mission-one-roadmap conflicts contribute no law context; per-rule and whole-face fail-open (plans 0815-1/0950-1)'
}
