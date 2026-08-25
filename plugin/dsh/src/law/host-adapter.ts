/**
 * host-adapter.ts — law-kernel host glue for the DSH face (age-autonomy
 * M2-WI12, plan docs/plans/age-autonomy/2026-08-25-0815-1 Phase 3).
 *
 * What it does: per pending file-write tool call (write / edit /
 * str_replace_editor create|str_replace|insert — the same extraction family
 * as plan-status-gate.ts), discover the nearest ancestor mission context
 * with an `autonomyPolicy`, load + validate the policy through the bundled
 * law kernel copy (assets/src/law-policy.mjs — engine-side placement ruling,
 * 0815-1 Phase 1), resolve the actor from `exec.agent` (Explore conclusion:
 * `Agent.id: SessionId` is available, role is NOT inferable on this face →
 * structural-subset posture with an `unverified-writer` note; role inference
 * is M3 supervisor scope), evaluate the law kernel, and record every
 * observation to the observation-log face (`_tmp/law-observations.jsonl`,
 * one JSON line per matched gate) + a logger one-liner.
 *
 * Posture: the current policy registers only observe-mode gates — records,
 * never blocks. The enforce-deny return path exists so later plans can flip
 * per-gate modes without touching this adapter (02 §6 rolling discipline).
 * Any internal failure fails OPEN (allow + warn, plan-status-gate D1
 * lineage): a gate crash must never break the host tool pipeline.
 *
 * Coexistence: an independent `tools/pre-execute` listener with its own
 * disposer next to plan-status-gate — no shared mutable state; the only
 * caches are policy snapshots keyed by ancestor dir (staleness accepted for
 * M2 observe-only; document-reload discipline lands with enforce stages).
 */
import { appendFileSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { evaluateGates } from '../../assets/src/law-core.mjs'
import { loadPolicyFile, policyAgentNames } from '../../assets/src/law-policy.mjs'
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
  for (const entry of missions) {
    if (!entry.endsWith('.json')) continue
    const text = io.readTextFile(join(ancestor, 'missions', entry))
    if (text === null) continue
    let mission: { autonomyPolicy?: unknown; plansDir?: unknown; roadmapPath?: unknown }
    try {
      mission = JSON.parse(text) as typeof mission
    } catch {
      continue
    }
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
    return {
      projectRoot: ancestor,
      policy: loaded.policy as MissionLawContext['policy'],
      plansDir: typeof mission.plansDir === 'string' && mission.plansDir !== '' ? toPosix(resolve(ancestor, mission.plansDir)) : '',
      roadmapPath: typeof mission.roadmapPath === 'string' && mission.roadmapPath !== '' ? toPosix(resolve(ancestor, mission.roadmapPath)) : '',
      agentNames: policyAgentNames(loaded.policy),
    }
  }
  return null
}

// ── observation sink ────────────────────────────────────────────────────────

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
): { decision: 'allow' | 'deny'; reason: string | null; records: LawObservationRecord[]; lawCtx: MissionLawContext | null } {
  const extracted = extractLawAction(call, io)
  if (extracted === null) return { decision: 'allow', reason: null, records: [], lawCtx: null }
  const { targetPath, proposedContent, disk } = extracted

  const lawCtx = discoverLawContext(resolve(targetPath), io, cache)
  if (lawCtx === null) return { decision: 'allow', reason: null, records: [], lawCtx: null }

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
      ctx: { plansDir: lawCtx.plansDir, roadmapPath: lawCtx.roadmapPath, agentNames: lawCtx.agentNames },
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
  const listener = async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    let result: ReturnType<typeof evaluateLawCall>
    try {
      result = evaluateLawCall({ name: exec.name, arguments: exec.arguments }, resolveLawActor(exec), io, cache)
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
  return 'tools/pre-execute law gate (M2-WI12): policy-driven evaluate over write/edit/str_replace_editor via the bundled law kernel; actor=exec.agent.id (role not inferable — structural-subset posture); observe-only recording to _tmp/law-observations.jsonl; per-rule and whole-face fail-open (plan 0815-1)'
}
