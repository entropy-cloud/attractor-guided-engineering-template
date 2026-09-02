/**
 * context-profile.ts — the efficiency-layer context profile (age-autonomy
 * M4-WI34, plan `docs/plans/age-autonomy/2026-08-27-0558-1`;
 * 04-efficiency §4).
 *
 * ARTIFACT (04 §4): `docs/references/context-profile.json` — project-owned,
 * git-committed, schema-versioned. NEVER under `missions/`: that directory
 * is scanned by the mission scanner (`config.js` `listMissionsString` /
 * monitor `GET /api/configs` pick up every `*.json`), so a non-mission JSON
 * there pollutes `--list-missions` and the monitor config face. A JSON
 * artifact is outside the path-guardrail plan-domain (.md), outside the P8
 * protected set, and NOT a completion-evidence surface (efficiency cache,
 * not state authority — P2 same-source: losing it only loses cache hits;
 * correctness rebuilds from the git ledger).
 *
 * SCHEMA v1: `{ version: 1, seededFrom, updatedAt, entries: [{ path,
 * reads, lastSeenAt }] }` — entries are repo-root-relative paths.
 *
 * DATA SOURCES (04 §4, three layers — each has a consumption face):
 *   1. child session events — tool/call events × file-argument paths
 *      (read/grep/glob class). Event schema pinned on the live DSH host
 *      (SessionEventMap: `'tool/call': { turn, step, callId, name,
 *      arguments: string }` — the native-executor `agent.session?.events`
 *      precedent shape; no in-library tool-call consumer existed before
 *      this module).
 *   2. run-state step products — `_tmp/<runDir>/run-state.json` steps[]
 *      with promptFile basenames; the rendered prompt text is mined for
 *      repo-relative paths (what the run was TOLD to read).
 *   3. Reflexion memory — `tools/mission-driver/memory/runs.md`
 *      (`--analyze-run` product) mined the same way.
 *
 * SEEDING: first start (artifact absent) seeds from the AGENTS.md「Read
 * This First」 list — DIRECT path lines only (a line that is exactly one
 * path, bare or in a single code span). Indirect reference lines (「the
 * active requirement listed in `docs/context/project-context.md`」) are
 * deliberately skipped: the indirect surface is covered by that file's own
 * embedding, never double-entered.
 *
 * DEBOUNCE (04 §4「无进展不刷」, plan Phase 2 Decision): a mining pass
 * writes iff the tally is non-empty AND the effective top-N path SET
 * changed. Rank drift WITHIN an unchanged set never writes (the consumption
 * face only takes the set, so the write would be git churn); empty tally
 * never writes; oscillation in/out of the set is suppressed by the
 * set-equivalence judgment itself.
 *
 * Mining leg routing (04 §6): agents face absent (headless) ⇒ explicit
 * degradation note, the seed table is preserved, nothing is mined — the
 * independent-form complete face belongs to WI35.
 *
 * Pure + injectable: every function is deterministic over its inputs (io +
 * clock injected); zero runtime imports (no import cycle with
 * prompt-assembler.ts, which value-imports the read face below).
 */
import { basename, dirname, join } from 'node:path'
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'

export const PROFILE_SCHEMA_VERSION = 1

/** The repo-relative artifact home (04 §4; deliberately NOT under missions/). */
export const DEFAULT_PROFILE_ARTIFACT = 'docs/references/context-profile.json'

/** Plan Phase 1 Decision: topN default = 5 (seed list parity; DSL-overridable). */
export const DEFAULT_PROFILE_TOP_N = 5

/** The seeding source marker recorded in `seededFrom`. */
export const PROFILE_SEED_SOURCE = 'AGENTS.md#read-this-first'

/** The Reflexion memory default (repo deployment; injectable per mount). */
export const DEFAULT_MEMORY_RUNS_REL = 'tools/mission-driver/memory/runs.md'

// ── faces ────────────────────────────────────────────────────────────────────

export interface ProfileIo {
  readTextFile(path: string): string | null
  writeTextAtomic(path: string, content: string): void
}

/** The mining io: profile io + run-dir enumeration (run-state scan). */
export interface MiningIo extends ProfileIo {
  listDirEntries(path: string): string[] | null
}

export const fsProfileIo: ProfileIo = {
  readTextFile(path) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  },
  writeTextAtomic(path, content) {
    // writer.ts precedent: tmp file in the target directory + rename; the
    // artifact's parent (docs/references/) may not exist on a first start
    mkdirSync(dirname(path), { recursive: true })
    const tmp = join(dirname(path), `.${basename(path)}.ctxprofile-tmp`)
    writeFileSync(tmp, content, 'utf8')
    renameSync(tmp, path)
  },
}

export const fsMiningIo: MiningIo = {
  ...fsProfileIo,
  listDirEntries(path) {
    try {
      return readdirSync(path)
    } catch {
      return null
    }
  },
}

// ── schema + pure core ───────────────────────────────────────────────────────

export interface ProfileEntry {
  /** repo-root-relative path (forward slashes, no leading ./ or /). */
  path: string
  reads: number
  lastSeenAt: string | null
}

export interface ContextProfile {
  version: number
  seededFrom: string
  updatedAt: string | null
  entries: ProfileEntry[]
}

/** Normalize one observed path to the repo-root-relative form (pure). */
export function normalizeProfilePath(path: string, projectRoot?: string): string {
  let p = String(path).replace(/\\/g, '/')
  if (typeof projectRoot === 'string' && projectRoot !== '') {
    const root = projectRoot.replace(/\\/g, '/').replace(/\/+$/u, '')
    if (root !== '' && p.startsWith(`${root}/`)) p = p.slice(root.length + 1)
    else if (p === root) p = ''
  }
  while (p.startsWith('./')) p = p.slice(2)
  p = p.replace(/^\/+/u, '')
  return p
}

/** Sort comparator: reads desc, ties by path asc (the consumption order). */
function byReadsDescPathAsc(a: ProfileEntry, b: ProfileEntry): number {
  if (b.reads !== a.reads) return b.reads - a.reads
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

/** The top-N stable-file path list (reads desc, ties path asc — 04 §4). */
export function topNPathsOf(profile: ContextProfile, topN: number = DEFAULT_PROFILE_TOP_N): string[] {
  const n = Number.isInteger(topN) && topN > 0 ? topN : DEFAULT_PROFILE_TOP_N
  return [...profile.entries].sort(byReadsDescPathAsc).slice(0, n).map((e) => e.path)
}

// ── seeding (AGENTS.md「Read This First」) ────────────────────────────────────

const PATH_TOKEN_RE = /^[^\s`*]+\/[^\s`*]+$/u

/** A path-like token: contains a separator, has an extension, no URL scheme. */
function isRepoRelativePathToken(token: string): boolean {
  if (token.includes('://')) return false
  if (!PATH_TOKEN_RE.test(token)) return false
  return /\.[A-Za-z0-9]{1,8}$/u.test(token)
}

/**
 * Parse the AGENTS.md「Read This First」 list into seed entries (reads=0).
 * DIRECT path lines only: after the list marker, the line content must be
 * exactly one path — bare, or a single code span wrapping one path. Prose
 * lines (indirect references like 「listed in `docs/…`」) never enter the
 * table (the indirect surface is that file's own embedding, not a duplicate
 * row). Deterministic: entry order = document order.
 */
export function seedFromReadFirst(agentsText: string): ProfileEntry[] {
  const lines = String(agentsText).replace(/\r\n?/g, '\n').split('\n')
  let inSection = false
  const entries: ProfileEntry[] = []
  const seen = new Set<string>()
  for (const raw of lines) {
    if (/^##\s/u.test(raw)) {
      inSection = /^##\s+Read This First\s*$/u.test(raw)
      continue
    }
    if (!inSection) continue
    const m = raw.match(/^\s*[-*]\s+(.*)$/u)
    if (m === null) continue
    let content = m[1]!.trim()
    const span = content.match(/^`([^`]+)`$/u)
    if (span !== null) content = span[1]!.trim()
    if (!isRepoRelativePathToken(content)) continue
    const path = normalizeProfilePath(content)
    if (path === '' || seen.has(path)) continue
    seen.add(path)
    entries.push({ path, reads: 0, lastSeenAt: null })
  }
  return entries
}

/** A freshly seeded profile (first start — the artifact did not exist). */
export function newSeededProfile(agentsText: string, now: string): ContextProfile {
  return {
    version: PROFILE_SCHEMA_VERSION,
    seededFrom: PROFILE_SEED_SOURCE,
    updatedAt: now,
    entries: seedFromReadFirst(agentsText),
  }
}

// ── read-frequency merge ─────────────────────────────────────────────────────

export type ReadTally = Record<string, number>

/**
 * Merge one tally (path → count) into a profile (PURE — returns a new
 * profile): reads accumulate, lastSeenAt refreshes to `now`, unseen paths
 * enter the table. Paths are normalized (projectRoot prefix stripped).
 */
export function mergeReads(
  profile: ContextProfile,
  tally: ReadTally | Map<string, number>,
  now: string,
  options?: { projectRoot?: string },
): ContextProfile {
  const projectRoot = options?.projectRoot
  const counts = new Map<string, number>()
  const source = tally instanceof Map ? [...tally.entries()] : Object.entries(tally ?? {})
  for (const [rawPath, count] of source) {
    if (!Number.isFinite(count) || count <= 0) continue
    const path = normalizeProfilePath(rawPath, projectRoot)
    if (path === '') continue
    counts.set(path, (counts.get(path) ?? 0) + Math.round(count))
  }
  const byPath = new Map(profile.entries.map((e) => [e.path, { ...e }]))
  for (const [path, count] of counts) {
    const existing = byPath.get(path)
    if (existing === undefined) byPath.set(path, { path, reads: count, lastSeenAt: now })
    else {
      existing.reads += count
      existing.lastSeenAt = now
    }
  }
  return {
    version: PROFILE_SCHEMA_VERSION,
    seededFrom: profile.seededFrom,
    updatedAt: now,
    entries: [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  }
}

// ── load / save (schema-versioned, deterministic, atomic) ────────────────────

export type ProfileLoadOutcome =
  | { ok: true; profile: ContextProfile }
  | { ok: false; status: 'uninitialized' | 'unreadable' | 'corrupt' | 'unknown-version'; note: string; foundVersion?: number }

function coerceProfile(value: unknown): ContextProfile | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v.version !== PROFILE_SCHEMA_VERSION || !Array.isArray(v.entries)) return null
  const entries: ProfileEntry[] = []
  for (const raw of v.entries) {
    if (typeof raw !== 'object' || raw === null) return null
    const e = raw as Record<string, unknown>
    if (typeof e.path !== 'string' || e.path === '') return null
    if (typeof e.reads !== 'number' || !Number.isInteger(e.reads) || e.reads < 0) return null
    entries.push({ path: e.path, reads: e.reads, lastSeenAt: typeof e.lastSeenAt === 'string' ? e.lastSeenAt : null })
  }
  return {
    version: PROFILE_SCHEMA_VERSION,
    seededFrom: typeof v.seededFrom === 'string' ? v.seededFrom : '',
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null,
    entries,
  }
}

/**
 * Load the profile artifact. Missing file = `uninitialized` (the caller
 * seeds). An UNKNOWN version = explicit note + conservative rebuild path
 * (re-seed) — never silently carrying an old structure forward.
 */
export function loadProfile(io: { readTextFile(path: string): string | null }, artifactPath: string): ProfileLoadOutcome {
  const text = io.readTextFile(artifactPath)
  if (text === null) {
    return { ok: false, status: 'uninitialized', note: `profile artifact not found at ${artifactPath} — first start (seed path)` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { ok: false, status: 'corrupt', note: `profile artifact at ${artifactPath} is not valid JSON (${err instanceof Error ? err.message : String(err)}) — conservative rebuild (re-seed)` }
  }
  const version = typeof (parsed as Record<string, unknown> | null)?.version === 'number'
    ? (parsed as Record<string, unknown>).version as number
    : undefined
  const profile = coerceProfile(parsed)
  if (profile === null) {
    if (version !== undefined && version !== PROFILE_SCHEMA_VERSION) {
      return { ok: false, status: 'unknown-version', note: `profile artifact version ${version} ≠ supported ${PROFILE_SCHEMA_VERSION} — profile unavailable, conservative rebuild (re-seed)`, foundVersion: version }
    }
    return { ok: false, status: 'corrupt', note: `profile artifact at ${artifactPath} does not match schema v${PROFILE_SCHEMA_VERSION} — conservative rebuild (re-seed)` }
  }
  return { ok: true, profile }
}

/**
 * Deterministic serialization: entries sorted by path, fixed field order,
 * single trailing newline. Two serializations of equal content are
 * byte-identical (git-churn discipline).
 */
export function serializeProfile(profile: ContextProfile): string {
  const entries = [...profile.entries]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((e) => ({ path: e.path, reads: e.reads, lastSeenAt: e.lastSeenAt }))
  const body = { version: PROFILE_SCHEMA_VERSION, seededFrom: profile.seededFrom, updatedAt: profile.updatedAt, entries }
  return `${JSON.stringify(body, null, 2)}\n`
}

/** saveProfile = deterministic serialization + tmp+rename atomic write. */
export function saveProfile(io: ProfileIo, artifactPath: string, profile: ContextProfile): void {
  io.writeTextAtomic(artifactPath, serializeProfile(profile))
}

// ── session-event tally (data source 1 — DSH form) ───────────────────────────

/**
 * The read-class tool names whose file arguments count as reads. Kept to
 * the read/grep/glob family (04 §4「工具调用事件 × 文件参数路径计数，
 * read/grep/glob 类」) plus `ls`/`view` aliases — write-class tools
 * (edit/write/bash) are deliberately NOT reads.
 */
const READ_TOOL_NAMES = new Set(['read', 'view', 'cat', 'grep', 'glob', 'find', 'ls'])

/** Path-argument keys accepted in a tool/call arguments object. */
const PATH_ARG_KEYS = new Set(['path', 'file', 'file_path', 'filePath', 'directory', 'dir', 'root', 'cwd', 'include', 'target'])

interface ToolCallEventPin {
  type?: string
  data?: {
    name?: unknown
    arguments?: unknown
  }
}

function extractPathsFromArguments(args: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      // a bare path-like string argument (read's `arguments` is a JSON string
      // of the tool arguments object; some hosts pass positional strings)
      if (isRepoRelativePathToken(v) || /^[.~]?[^\s`*]*\/[^\s`*]+$/u.test(v)) out.push(v)
      return
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item)
      return
    }
    if (typeof v === 'object' && v !== null) {
      for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
        if (PATH_ARG_KEYS.has(key) && typeof value === 'string') out.push(value)
        else walk(value)
      }
    }
  }
  if (typeof args === 'string') {
    try {
      walk(JSON.parse(args))
    } catch {
      walk(args)
    }
  } else {
    walk(args)
  }
  return out
}

/**
 * Aggregate one session's events into a read tally: tool/call events ×
 * file-argument paths, read/grep/glob class only (one count per call per
 * path). Pure; unknown event shapes are skipped (fail-soft, the schema pin
 * tolerates host additions).
 */
export function tallyFromSessionEvents(events: readonly unknown[], options?: { projectRoot?: string }): ReadTally {
  const tally: ReadTally = {}
  for (const raw of events ?? []) {
    const ev = raw as ToolCallEventPin
    if (ev === null || typeof ev !== 'object' || ev.type !== 'tool/call') continue
    const name = typeof ev.data?.name === 'string' ? ev.data.name : ''
    const shortName = name.split('/').pop() ?? name
    if (!READ_TOOL_NAMES.has(name) && !READ_TOOL_NAMES.has(shortName)) continue
    for (const p of extractPathsFromArguments(ev.data?.arguments)) {
      const path = normalizeProfilePath(p, options?.projectRoot)
      if (path === '') continue
      tally[path] = (tally[path] ?? 0) + 1
    }
  }
  return tally
}

// ── text-path tally (data sources 2/3 — prompt files + Reflexion memory) ─────

/**
 * Mine repo-relative path mentions out of free text (rendered prompts,
 * Reflexion `runs.md`). Every path-like token that exists (when an exists
 * predicate is supplied) counts once per occurrence.
 */
export function tallyFromText(text: string | null, options?: { projectRoot?: string; exists?: (relPath: string) => boolean }): ReadTally {
  const tally: ReadTally = {}
  if (typeof text !== 'string' || text === '') return tally
  const tokens = text.match(/[^\s`*()[\]{}<>"'，。；：、|]+/g) ?? []
  for (const token of tokens) {
    const trimmed = token.replace(/[.,:;!?—–-]+$/u, '')
    if (!isRepoRelativePathToken(trimmed)) continue
    const path = normalizeProfilePath(trimmed, options?.projectRoot)
    if (path === '') continue
    if (options?.exists !== undefined && !options.exists(path)) continue
    tally[path] = (tally[path] ?? 0) + 1
  }
  return tally
}

export function mergeTallies(...tallies: Array<ReadTally | Map<string, number>>): ReadTally {
  const out: ReadTally = {}
  for (const tally of tallies) {
    const source = tally instanceof Map ? [...(tally as Map<string, number>).entries()] : Object.entries(tally ?? {})
    for (const [rawPath, count] of source) {
      if (!Number.isFinite(count) || count <= 0) continue
      const path = normalizeProfilePath(rawPath)
      if (path === '') continue
      out[path] = (out[path] ?? 0) + Math.round(count)
    }
  }
  return out
}

// ── the mining pipeline (run-terminal face, 04 §4) ───────────────────────────

export type MineStatus = 'seeded' | 'written' | 'skipped' | 'failed'

export interface MineOutcome {
  status: MineStatus
  note: string
  /** the aggregated tally of this pass (absent when skipped before tallying). */
  tally?: ReadTally
}

export interface MineOptions {
  io: MiningIo
  projectRoot: string
  /** repo-relative artifact home (default docs/references/context-profile.json). */
  artifactRelPath?: string
  /** live child-session event arrays (pool members; the DSH collection leg). */
  sessionEvents?: unknown[][]
  /** false ⇒ headless: explicit degrade note, seed preserved, no mining. */
  agentsFacePresent?: boolean
  /** repo-relative Reflexion memory path (default tools/mission-driver/memory/runs.md). */
  memoryRunsRelPath?: string
  /** effective topN for the debounce set judgment (default 5). */
  topN?: number
  now: string
}

/**
 * The run-terminal mining pipeline (04 §4): collect → merge → debounce →
 * atomic write. Fail-soft by construction — never throws; every abnormal
 * leg degrades to an explicit note. Sources absent ⇒ fail-soft notes (the
 * three-layer data-source contract each has a consumption face, so a
 * missing layer is NOT silently skipped).
 */
export function mineContextProfile(options: MineOptions): MineOutcome {
  const { io, projectRoot, now } = options
  const artifactPath = join(projectRoot, options.artifactRelPath ?? DEFAULT_PROFILE_ARTIFACT)
  const topN = Number.isInteger(options.topN) && (options.topN as number) > 0 ? (options.topN as number) : DEFAULT_PROFILE_TOP_N
  try {
    // headless degrade (04 §6 / plan Phase 2): keep the seed table, no mining
    if (options.agentsFacePresent === false) {
      return { status: 'skipped', note: 'context-profile: agents face absent (headless) — mining degraded, seed table preserved (independent-form complete face = WI35)' }
    }

    const notes: string[] = []
    const loaded = loadProfile(io, artifactPath)
    let profile: ContextProfile
    let seededThisPass = false
    if (loaded.ok) {
      profile = loaded.profile
    } else {
      // uninitialized ⇒ seed; unknown-version/corrupt ⇒ conservative rebuild (re-seed)
      const agentsText = io.readTextFile(join(projectRoot, 'AGENTS.md'))
      profile = newSeededProfile(agentsText ?? '', now)
      saveProfile(io, artifactPath, profile)
      seededThisPass = true
      if (loaded.status !== 'uninitialized') notes.push(loaded.note)
    }

    // data source 1 — child session events (DSH leg)
    const sources = options.sessionEvents ?? []
    if (sources.length === 0) notes.push('session-events source empty (no live pool members this run)')
    let tally: ReadTally = {}
    for (const events of sources) {
      tally = mergeTallies(tally, tallyFromSessionEvents(events, { projectRoot }))
    }

    // data source 2 — run-state step products (auxiliary; merge when present)
    const tmpDir = join(projectRoot, '_tmp')
    const runDirs = io.listDirEntries(tmpDir) ?? []
    let runStates = 0
    for (const dir of runDirs) {
      const runDir = join(tmpDir, dir)
      const stateText = io.readTextFile(join(runDir, 'run-state.json'))
      if (stateText === null) continue
      let steps: Array<{ promptFile?: unknown }> = []
      try {
        const parsed = JSON.parse(stateText) as { steps?: Array<{ promptFile?: unknown }> }
        if (Array.isArray(parsed.steps)) steps = parsed.steps
      } catch {
        continue
      }
      runStates += 1
      for (const step of steps) {
        if (typeof step.promptFile !== 'string' || step.promptFile === '') continue
        const promptText = io.readTextFile(join(runDir, step.promptFile))
        if (promptText === null) continue
        tally = mergeTallies(tally, tallyFromText(promptText, { projectRoot, exists: (p) => io.readTextFile(join(projectRoot, p)) !== null }))
      }
    }
    if (runStates === 0) notes.push('run-state source absent (no _tmp/<runDir>/run-state.json found)')

    // data source 3 — Reflexion memory (auxiliary; merge when present)
    const memoryPath = join(projectRoot, options.memoryRunsRelPath ?? DEFAULT_MEMORY_RUNS_REL)
    const memoryText = io.readTextFile(memoryPath)
    if (memoryText === null) notes.push(`reflexion memory absent (${memoryPath})`)
    else tally = mergeTallies(tally, tallyFromText(memoryText, { projectRoot, exists: (p) => io.readTextFile(join(projectRoot, p)) !== null }))

    // debounce leg 1 — empty tally never writes a MINING update (04 §4 无进展
    // 不刷); a first-start pass has already written its seed
    if (Object.keys(tally).length === 0) {
      return {
        status: seededThisPass ? 'seeded' : 'skipped',
        tally,
        note: `context-profile: ${seededThisPass ? `first start — seeded ${profile.entries.length} entries from ${PROFILE_SEED_SOURCE}` : 'empty tally — no write'} (debounce)${notes.length > 0 ? `; ${notes.join('; ')}` : ''}`,
      }
    }

    const merged = mergeReads(profile, tally, now, { projectRoot })
    // debounce leg 2 — an unchanged effective top-N SET never writes.
    // SET equivalence (sorted member comparison), NOT ordered: rank drift
    // inside the set does not change what the consumption face embeds (it
    // takes the set), and set equivalence naturally suppresses in/out
    // oscillation (04 §4 停滞/振荡检测, plan Phase 2 Decision)
    const setOf = (p: ContextProfile): string => topNPathsOf(p, topN).sort().join('\n')
    if (setOf(profile) === setOf(merged)) {
      return {
        status: seededThisPass ? 'seeded' : 'skipped',
        tally,
        note: `context-profile: ${seededThisPass ? `first start — seeded ${profile.entries.length} entries from ${PROFILE_SEED_SOURCE}` : `top-${topN} set unchanged — no write`} (debounce)${notes.length > 0 ? `; ${notes.join('; ')}` : ''}`,
      }
    }
    saveProfile(io, artifactPath, merged)
    return { status: 'written', tally, note: `context-profile: mined ${Object.keys(tally).length} paths, top-${topN} set updated — written${seededThisPass ? ` (first start seed: ${profile.entries.length} entries)` : ''}${notes.length > 0 ? `; ${notes.join('; ')}` : ''}` }
  } catch (err) {
    return { status: 'failed', note: `context-profile: mining failed (fail-soft) — ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── the consumption read face (prompt-assembler kind: profile) ───────────────

export interface ProfileEmbedOutcome {
  ok: boolean
  /** the top-N entries in consumption order (ok === true). */
  entries: ProfileEntry[]
  /** explicit note when ok === false (artifact missing/unknown version). */
  note: string | null
}

/**
 * Read the profile artifact for embedding: top-N entries (reads desc, path
 * asc tie) in consumption order. Fail-soft: every abnormal shape returns
 * ok:false + an explicit note, never a throw (the assembler discipline).
 */
export function readProfileForEmbed(io: { readTextFile(path: string): string | null }, artifactPath: string, topN?: number): ProfileEmbedOutcome {
  const loaded = loadProfile(io, artifactPath)
  if (!loaded.ok) return { ok: false, entries: [], note: `[prompt-assembler] profile artifact unusable: ${loaded.note}` }
  const n = Number.isInteger(topN) && (topN as number) > 0 ? (topN as number) : DEFAULT_PROFILE_TOP_N
  const entries = [...loaded.profile.entries].sort(byReadsDescPathAsc).slice(0, n)
  return { ok: true, entries, note: null }
}
