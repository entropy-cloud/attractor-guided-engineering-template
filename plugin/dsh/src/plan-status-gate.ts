/**
 * plan-status-gate.ts — `tools/pre-execute` reinforcement gate for plan-status
 * `completed` edits (dsh-plugin M3-WI13, plan
 * `docs/plans/dsh-plugin/2026-08-23-1852-3-pre-execute-plan-status-gate.md`;
 * Phase 1 Decision Record D1–D4 in that plan is the semantics owner).
 *
 * What it denies: a file-write tool call whose PROPOSED content carries a
 * `> Plan Status: completed` line (engine-authoritative matcher
 * `PLAN_STATUS_RE`, imported from the bundled engine copy — zero engine diff,
 * draft-review N1) targeting a markdown file under a known plans root, when
 * run-state evidence for that plan exists but no adjudicated allow face holds.
 *
 * Allow faces (plan D2, any one):
 *   F1 in-flight per-plan — a subflow run-state child file (run-state-*.json,
 *      NOT the top-level run-state.json; forEach subflow children persist
 *      `forEachItem` + `status:"running"` at child init, engine.js
 *      `_initWorkflow`) whose normalized `forEachItem` matches the target and
 *      whose status is "running". Covers the engine's own in-run edits
 *      (prompts/execute.md step 4a, prompts/closure-audit.md refresh). The
 *      top-level `subflowRuns[]` array is deliberately NOT a query face: the
 *      engine appends entries on item COMPLETION, so in-flight children are
 *      absent there by construction.
 *   F2 post-hoc closure-audit visit — matching subflow file has a
 *      steps[] record {name:"CLOSURE_AUDIT", status:"completed"} (the
 *      roadmap's literal rule, on the subflow-file query face).
 *   F3 post-hoc fast path — matching subflow file has a steps[] record
 *      {name:"BUILD_VERIFY", status:"completed"} or overall
 *      status:"completed" (the only route to subflow completion is
 *      BUILD_VERIFY pass → done — the fast path the literal rule would
 *      have false-killed).
 *
 * Deny iff: an evidence surface exists (any matching subflow file in any
 * ancestor `_tmp` run dir) AND no face holds. No evidence surface at all →
 * allow + observation note (plan D3: never-ran projects' manual closure is
 * legitimate per AGENTS.md Reviewer-Availability Fallback).
 *
 * Recorded miss faces (漏杀, plan D2 adjudication — the gate's protection
 * scope narrows to engine-tracked plan lifecycles): stale "running" subflow
 * files left by crashed runs (no pid re-check — in-host deployments share the
 * gate's process, so a dead-pid probe never fires); plan rewrites through
 * non-matching tools (bash/sed); create-with-completed on never-tracked
 * paths (equivalent to hand-authoring). Any internal gate error fails OPEN
 * (allow + warn) — a gate crash must not break the host tool pipeline.
 *
 * Dual-form asymmetry is by design (plan red line): the standalone CLI form
 * has no host, hence no `tools/pre-execute` boundary and no gate. Only the
 * dsh-host-mounted service enforces this.
 *
 * Path domain (D1): only `.md` targets under a KNOWN plans root are gated —
 * each ancestor's default `docs/plans` plus the `plansDir` of every
 * `missions/*.json` found there (passive reads). This keeps non-plan
 * documents that happen to carry `> Status: completed` lines out of the
 * gate (false-kill guard).
 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { PLAN_STATUS_RE } from '../assets/src/plan-check.mjs'
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

// ── IO seam (pure core stays unit-testable; production = node:fs) ──────────

/** Read-only disk face the gate needs. null = unreadable/missing. */
export interface PlanStatusGateIo {
  readTextFile(path: string): string | null
  listDirEntries(path: string): string[] | null
  isDirectory(path: string): boolean
  /** Physical path (symlinks resolved); null when unresolvable (e.g. create-before-exist). */
  realPath(path: string): string | null
}

export const fsGateIo: PlanStatusGateIo = {
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
}

// ── Decision shape ──────────────────────────────────────────────────────────

export type PlanStatusGateDecision =
  | { kind: 'allow'; note?: string }
  | { kind: 'deny'; reason: string }

/** Minimal structural view of one pending tool call (fake-able in tests). */
export interface GateToolCall {
  readonly name: string
  readonly arguments: unknown
}

const GATE_TAG = '[mdcontrol plan-status gate]'

export function denyReason(planPath: string, runDirs: string[]): string {
  return (
    `${GATE_TAG} denied a plan-status "completed" edit on ${planPath}. ` +
    `Run-state evidence exists for this plan (${runDirs.join(', ')}) but shows no closed CLOSURE_AUDIT visit, ` +
    `no completed BUILD_VERIFY, and no in-flight execution. ` +
    `Legal path: let the mission loop close the plan (CLOSURE_AUDIT → BUILD_VERIFY), ` +
    `or complete a closure audit before marking the plan completed.`
  )
}

// ── Proposed-content extraction (D1 matcher mechanics) ──────────────────────

/** True when a string mentions a status line at all (cheap edit prefilter). */
function mentionsStatus(text: string): boolean {
  return /status/i.test(text)
}

/** Replace-first (or all) literal substring, mirroring the host edit tool. */
function applyReplacement(content: string, oldStr: string, newStr: string, all: boolean): string {
  if (!content.includes(oldStr)) return content
  if (all) return content.split(oldStr).join(newStr)
  return content.replace(oldStr, newStr)
}

/** Insert text after a 1-based line number (str_replace_editor insert). */
function applyInsert(content: string, newStr: string, insertLine: number | undefined): string {
  const lines = content.split('\n')
  const at = insertLine === undefined ? lines.length : Math.max(0, Math.min(lines.length, insertLine))
  lines.splice(at, 0, newStr)
  return lines.join('\n')
}

/**
 * Extract { targetPath, proposedContent } for the adjudicated file-write tool
 * surface. Returns null for every non-matching call (unknown tool name or
 * argument shape) — those pass straight through. Edit-shaped calls whose
 * old/new strings cannot touch a status line also return null (zero-disk-read
 * fast path, plan Phase 2 wiring item).
 */
function extractProposedContent(call: GateToolCall, io: PlanStatusGateIo): { targetPath: string; proposedContent: string } | null {
  const args = (call.arguments ?? null) as Record<string, unknown> | null
  if (!args || typeof args !== 'object') return null

  if (call.name === 'write') {
    const filePath = args.file_path
    const content = args.content
    if (typeof filePath !== 'string' || filePath === '' || typeof content !== 'string') return null
    return { targetPath: filePath, proposedContent: content }
  }

  if (call.name === 'edit') {
    const filePath = args.file_path
    const oldStr = args.old_string
    const newStr = args.new_string
    if (typeof filePath !== 'string' || filePath === '' || typeof oldStr !== 'string' || typeof newStr !== 'string') return null
    if (!mentionsStatus(oldStr) && !mentionsStatus(newStr)) return null
    const replaceAll = args.replace_all === true
    const disk = io.readTextFile(resolve(filePath))
    if (disk === null) return { targetPath: filePath, proposedContent: newStr }
    return { targetPath: filePath, proposedContent: applyReplacement(disk, oldStr, newStr, replaceAll) }
  }

  if (call.name === 'str_replace_editor') {
    const command = args.command
    const path = args.path
    if (typeof path !== 'string' || path === '') return null
    if (command === 'create') {
      const fileText = args.file_text
      if (typeof fileText !== 'string') return null
      return { targetPath: path, proposedContent: fileText }
    }
    if (command === 'str_replace') {
      const oldStr = args.old_str
      const newStr = args.new_str
      if (typeof oldStr !== 'string' || typeof newStr !== 'string') return null
      if (!mentionsStatus(oldStr) && !mentionsStatus(newStr)) return null
      const disk = io.readTextFile(resolve(path))
      if (disk === null) return { targetPath: path, proposedContent: newStr }
      return { targetPath: path, proposedContent: applyReplacement(disk, oldStr, newStr, false) }
    }
    if (command === 'insert') {
      const newStr = args.new_str
      if (typeof newStr !== 'string') return null
      if (!mentionsStatus(newStr)) return null
      const insertLine = typeof args.insert_line === 'number' ? args.insert_line : undefined
      const disk = io.readTextFile(resolve(path))
      if (disk === null) return { targetPath: path, proposedContent: newStr }
      return { targetPath: path, proposedContent: applyInsert(disk, newStr, insertLine) }
    }
    return null
  }

  return null
}

/** Engine-authoritative status-line resolution on proposed content. */
function proposedPlanStatus(proposedContent: string): string | null {
  const m = proposedContent.match(PLAN_STATUS_RE)
  return m ? (m[1] || '').trim().toLowerCase() : null
}

// ── Path domain + ancestor walk (D1) ────────────────────────────────────────

function toPosix(p: string): string {
  return p.split('\\').join('/')
}

/** Normalized comparable form for a plan path (resolve + posix). */
function normPath(p: string): string {
  return toPosix(resolve(p))
}

/**
 * Comparable forms of one path: the resolve() form AND the physical
 * (symlink-resolved) form. On symlink-aliasing hosts (macOS `/var` vs
 * `/private/var`) the engine persists the resolve form while cwd-derived
 * paths surface the physical form — matching either form keeps
 * normalization sound (iter3 N2, macOS case discovered in Phase 2 tests).
 */
function pathForms(p: string, io: PlanStatusGateIo): { raw: string; real: string } {
  const raw = normPath(p)
  const real = io.realPath(p)
  return { raw, real: real === null ? raw : toPosix(real) }
}

function samePath(a: { raw: string; real: string }, b: { raw: string; real: string }): boolean {
  return a.raw === b.raw || a.real === b.real
}

/** Every ancestor directory of `start` from its dirname up to the fs root. */
function ancestorsOf(start: string): string[] {
  const out: string[] = []
  let cur = resolve(dirname(start))
  while (true) {
    out.push(cur)
    const parent = dirname(cur)
    if (parent === cur) return out
    cur = parent
  }
}

/** Known plans roots at one ancestor: default docs/plans + missions/*.json plansDir values. */
function knownPlansRootsAt(ancestor: string, io: PlanStatusGateIo): string[] {
  const roots = [join(ancestor, 'docs', 'plans')]
  const missions = io.listDirEntries(join(ancestor, 'missions'))
  if (missions) {
    for (const entry of missions) {
      if (!entry.endsWith('.json')) continue
      const text = io.readTextFile(join(ancestor, 'missions', entry))
      if (text === null) continue
      try {
        const mission = JSON.parse(text) as { plansDir?: unknown }
        if (typeof mission.plansDir === 'string' && mission.plansDir !== '') {
          roots.push(resolve(ancestor, mission.plansDir))
        }
      } catch {
        // malformed mission config contributes no plans root
      }
    }
  }
  return roots
}

function isUnder(path: string, root: string): boolean {
  if (path === root) return true
  return path.startsWith(root.endsWith('/') ? root : root + '/')
}

function isUnderAnyForm(target: { raw: string; real: string }, root: string, io: PlanStatusGateIo): boolean {
  if (isUnder(target.raw, normPath(root))) return true
  const rootForms = pathForms(root, io)
  return isUnder(target.real, rootForms.real)
}

// ── Run-state evidence scan (D2) ────────────────────────────────────────────

interface SubflowMatch {
  runDir: string
  state: {
    status?: unknown
    forEachItem?: unknown
    steps?: unknown
  }
}

/**
 * Comparable forms of a persisted forEachItem, resolved against the run's
 * project root when relative (engine persists the resolve() form; the
 * relative branch is defensive for foreign deployments).
 */
function forEachItemForms(item: unknown, projectRoot: string, io: PlanStatusGateIo): { raw: string; real: string } | null {
  if (typeof item !== 'string' || item === '') return null
  const p = item.startsWith('/') ? item : resolve(projectRoot, item)
  return pathForms(p, io)
}

/**
 * Scan ancestor `_tmp/<runId>` run dirs for subflow files (`run-state-*.json`,
 * excluding the top-level `run-state.json`) whose `forEachItem` matches the
 * plan — the init-persisted per-plan identity face (engine `_initWorkflow`).
 * Query-face discipline (draft-review it2-B1/N1): in-flight AND post-hoc
 * faces both read the CHILD files; the top-level `subflowRuns[]` mapping is
 * completion-time-only and never consulted.
 */
function scanSubflowMatches(planForms: { raw: string; real: string }, io: PlanStatusGateIo): SubflowMatch[] {
  const matches: SubflowMatch[] = []
  const seenAncestors = new Set<string>()
  // Union of both forms' ancestor chains — a cwd-derived physical target and
  // an engine-recorded resolve-form run dir can live under aliased prefixes.
  for (const ancestor of [...ancestorsOf(planForms.raw), ...ancestorsOf(planForms.real)]) {
    if (seenAncestors.has(ancestor)) continue
    seenAncestors.add(ancestor)
    const tmp = join(ancestor, '_tmp')
    const runIds = io.listDirEntries(tmp)
    if (runIds === null) continue
    for (const runId of runIds) {
      const runDir = join(tmp, runId)
      if (!io.isDirectory(runDir)) continue
      const files = io.listDirEntries(runDir)
      if (files === null) continue
      for (const file of files) {
        if (!file.startsWith('run-state-') || file === 'run-state.json' || !file.endsWith('.json')) continue
        const text = io.readTextFile(join(runDir, file))
        if (text === null) continue
        let state: SubflowMatch['state']
        try {
          state = JSON.parse(text) as SubflowMatch['state']
        } catch {
          continue
        }
        const itemForms = forEachItemForms(state.forEachItem, ancestor, io)
        if (itemForms !== null && samePath(itemForms, planForms)) {
          matches.push({ runDir, state })
        }
      }
    }
  }
  return matches
}

function hasClosedStep(state: SubflowMatch['state'], stepName: string): boolean {
  if (!Array.isArray(state.steps)) return false
  return state.steps.some(
    (step) =>
      step !== null && typeof step === 'object' &&
      (step as { name?: unknown }).name === stepName &&
      (step as { status?: unknown }).status === 'completed',
  )
}

// ── Core evaluation (pure over the IO seam) ─────────────────────────────────

/**
 * Evaluate one pending tool call. Pure apart from the injected IO seam.
 * Any internal failure MUST surface as allow (fail-open, D1 adjudication) —
 * the production wrapper enforces this via try/catch around the call.
 */
export function evaluatePlanStatusGate(call: GateToolCall, io: PlanStatusGateIo): PlanStatusGateDecision {
  const extracted = extractProposedContent(call, io)
  if (extracted === null) return { kind: 'allow' }
  const { targetPath, proposedContent } = extracted

  if (proposedPlanStatus(proposedContent) !== 'completed') return { kind: 'allow' }
  if (!targetPath.toLowerCase().endsWith('.md')) return { kind: 'allow' }

  const targetForms = pathForms(targetPath, io)
  let gated = false
  const gatedAncestors = new Set<string>([...ancestorsOf(targetForms.raw), ...ancestorsOf(targetForms.real)])
  for (const ancestor of gatedAncestors) {
    for (const root of knownPlansRootsAt(ancestor, io)) {
      if (isUnderAnyForm(targetForms, root, io)) {
        gated = true
        break
      }
    }
    if (gated) break
  }
  if (!gated) return { kind: 'allow' }

  const matches = scanSubflowMatches(targetForms, io)
  if (matches.length === 0) {
    return {
      kind: 'allow',
      note: `${GATE_TAG} allowed a "completed" edit on ${targetForms.raw} with no run-state evidence surface (never engine-tracked) — manual-closure posture, plan D3.`,
    }
  }

  for (const m of matches) {
    if (m.state.status === 'running') return { kind: 'allow' } // F1 in-flight
    if (hasClosedStep(m.state, 'CLOSURE_AUDIT')) return { kind: 'allow' } // F2
    if (m.state.status === 'completed' || hasClosedStep(m.state, 'BUILD_VERIFY')) return { kind: 'allow' } // F3
  }

  return { kind: 'deny', reason: denyReason(targetForms.raw, [...new Set(matches.map((m) => m.runDir))]) }
}

// ── Subscription wiring (service.ts mounts this) ────────────────────────────

export interface PlanStatusGateLogger {
  warn?(message: string, fields?: Record<string, unknown>): void
  info?(message: string, fields?: Record<string, unknown>): void
}

/**
 * Register the gate on one cordis context (plan Phase 2 wiring item):
 * plain (non-agent-scoped) plugin context → receives ALL host tool calls
 * (host waterfall carrier `scopeTarget(this, exec.agent)` filters only
 * agent-scoped listeners — D1). Non-matching calls delegate to `next()`
 * with zero disk reads (the extract prefilter short-circuits). The dsh-tools
 * type-only import in this module brings the host `Events` augmentation
 * into the program, so the subscription is fully typed with zero runtime
 * require (D4). Returns the cordis listener disposer (auto-disposed with
 * the plugin context; the service additionally parks it in a ctx.effect
 * for explicit dispose-on-unload semantics).
 */
export function registerPlanStatusGate(ctx: Context, logger?: PlanStatusGateLogger): () => void {
  const listener = async (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    let decision: PlanStatusGateDecision
    try {
      decision = evaluatePlanStatusGate({ name: exec.name, arguments: exec.arguments }, fsGateIo)
    } catch (err) {
      // Fail-open: a gate crash must never break the host tool pipeline.
      logger?.warn?.(`${GATE_TAG} internal error — failing open`, {
        error: err instanceof Error ? err.message : String(err),
      })
      return next()
    }
    if (decision.kind === 'deny') {
      logger?.warn?.(decision.reason, { scope: 'mdcontrol', gate: 'plan-status' })
      return { kind: 'deny', reason: decision.reason }
    }
    if (decision.note) logger?.info?.(decision.note, { scope: 'mdcontrol', gate: 'plan-status' })
    return next()
  }
  return ctx.on('tools/pre-execute', listener)
}

/** Re-exported for the service mount log (imports stay type-only otherwise). */
export function gateMountSummary(): string {
  return 'tools/pre-execute plan-status completed gate (M3-WI13): matcher PLAN_STATUS_RE over write/edit/str_replace_editor; allow faces F1 in-flight subflow / F2 CLOSURE_AUDIT closed / F3 BUILD_VERIFY-or-subflow completed; deny iff evidence surface exists and no face holds (plan 1852-3 D1-D4)'
}
