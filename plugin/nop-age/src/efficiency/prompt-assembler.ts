/**
 * prompt-assembler.ts — the efficiency-layer prompt assembler (age-autonomy
 * M4-WI33, plan `docs/plans/age-autonomy/2026-08-27-0433-3`;
 * 04-efficiency §3; M4-WI34 adds the profile block kind, 04 §4).
 *
 * DUAL-MODE ASSEMBLY (04 §3.1):
 *   assemble('FRESH', spec, dynamicCtx, ledger, io)
 *     => fixedPrefixBlocks ++ [dynamicBlock]
 *   assemble('CONTINUE', spec, dynamicCtx, ledger, io)
 *     => deltaEmbedBlocks(ledger) ++ [dynamicBlock]
 *     (unchanged files are SKIPPED — the initial prompt is sent once,
 *     followups carry only the dynamic part + changed-file deltas; the
 *     session history itself is the shared prefix, 04 §3.2)
 *
 * PREFIX DISCIPLINE (04 §3.2): fixed bytes first (persona / charter /
 * embedded files), volatile bytes (timestamps, turn counters) last, marker
 * instructions belong to the dynamic suffix. The assembler renders, in
 * order: fixed blocks → dynamic block → volatile suffix. Two FRESH
 * assemblies over the same files are byte-identical (deterministic dir
 * listing, no clock in the fixed region).
 *
 * FILE EMBEDDING (04 §3.3): `<file path="{path}" hash="{hash8}">…full
 * text…</file>` (schema-overridable template string, law-policy
 * `assembly.embedStamp`, default exported same-source from law-policy.mjs).
 * Embedding beats forced reads — the "read X completely" instruction
 * becomes the full text in-context, zero read rounds. Directory blocks
 * embed every top-level file under a dir (kind dir + per-file
 * maxFileBytes cap; an over-cap file gets an EXPLICIT exclusion note,
 * never a silent truncation).
 *
 * PROFILE BLOCKS (M4-WI34, 04 §4): `{ kind: profile, ref, topN? }` — the
 * context-profile artifact's top-N stable files (reads desc, path asc)
 * expand into per-file records riding every FILE semantic unchanged
 * (stamp / cap / hash ledger / CONTINUE dedup). Fail-soft: a missing or
 * unknown-version artifact renders one explicit note. Explicit DSL
 * declaration ONLY — agents without a profile block keep byte-identical
 * prompts (the backward-compat pin).
 *
 * HASH LEDGER, three uses (04 §3.3): ① dedup — CONTINUE skips files whose
 * hash matches the ledger; ② stale detection — a dispatch-time hash
 * mismatch re-sends the full file (and the pool's charter-hash face forces
 * member rotation, 04 §2.2 leg 2); ③ auditability — every embedded block
 * is grep-addressable (path + hash render into the output).
 *
 * COMPACTION COUNTER (04 §3.3): long-lived agents WILL be compacted and
 * early file blocks may be trimmed — undetectable from here, so every
 * COMPACTION_RESEND_EVERY-th CONTINUE dispatch re-sends the full charter
 * list regardless of hash matches (periodic re-send, not fighting the
 * compactor).
 *
 * HASH ALGORITHM: `{hash8}` = first 8 hex of sha256 over the file text —
 * the same algorithm source as `computeBasisHash` (ledger-sections.mjs,
 * sha256 via node:crypto). The roadmap "sha256" names the algorithm,
 * `{hash8}` the render width (04 §3.3 example `hash="a1b2c3d4"`).
 *
 * Pure + injectable: the file-read face (AssemblerIo) and every input are
 * injectable, output deterministic — never throws (unreadable files render
 * explicit missing-notes; a vanished charter file must not kill the
 * dispatch). Ledger protocol: `assemble` only READS the ledger; the
 * updated per-agent ledger rides the outcome (`sentHashes`) and lands via
 * `commitToLedger` — the caller owns storage (pool member state for
 * pooled agents, a throwaway for one-shot sessions).
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_EMBED_STAMP, resolvePolicyPlaceholders } from '../../assets/src/law-policy.mjs'
import { readProfileForEmbed } from './context-profile.ts'

// ── faces ────────────────────────────────────────────────────────────────────

/** The file-read face the assembler needs (the LawGateIo read subset). */
export interface AssemblerIo {
  readTextFile(path: string): string | null
  listDirEntries(path: string): string[] | null
  isDirectory(path: string): boolean
}

export const fsAssemblerIo: AssemblerIo = {
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
}

/**
 * One fixedPrefix block (the law-policy FIXED_PREFIX schema shape, resolved).
 * M4-WI34 adds the fourth kind `profile`: `{ kind: profile, ref, topN? }` —
 * the ref points at the context-profile ARTIFACT; resolution pins
 * `profileRoot` (the repo root the artifact's repo-relative entries resolve
 * against); `filesOfBlock` expands it to the top-N stable FILE records
 * (every downstream semantic — embedStamp, maxFileBytes cap, hash-ledger
 * dedup/rotation — applies to each expanded file unchanged).
 */
export interface AssemblyBlock {
  kind: 'text' | 'file' | 'dir' | 'profile'
  ref: string
  maxFileBytes?: number
  /** profile kind: the expansion bound (default 5 — law-policy schema face). */
  topN?: number
  /** profile kind: repo root for the artifact's repo-relative entries (set at resolution). */
  profileRoot?: string
}

/** The assembler spec: resolved blocks + the (optional) stamp override. */
export interface AssemblerSpec {
  blocks: AssemblyBlock[]
  embedStamp?: string
}

export interface AssemblerDynamicCtx {
  /** the dynamic task block (marker instructions live here — 04 §3.2). */
  text: string
  /**
   * volatile bytes (timestamps / turn counters) — ALWAYS rendered last
   * (04 §3.2: the fixed prefix must stay byte-stable for prefix caching).
   */
  volatile?: string
}

export type AssemblyMode = 'FRESH' | 'CONTINUE'

export interface AssembleOutcome {
  text: string
  /** the file hashes SENT by this dispatch (path → hash8; no sentinels). */
  sentHashes: Map<string, string>
  /** files embedded into THIS output (FRESH: all; CONTINUE: the delta). */
  embedded: string[]
  /** files skipped by dedup (CONTINUE only — hash matched the ledger). */
  skipped: string[]
  /** files whose current hash no longer matched the ledger (resent). */
  changed: string[]
  /** true when the compaction counter forced a full charter re-send. */
  fullResend: boolean
}

/** Every COMPACTION_RESEND_EVERY-th CONTINUE dispatch re-sends the charter. */
export const COMPACTION_RESEND_EVERY = 8

// ── ledger protocol ──────────────────────────────────────────────────────────

/**
 * The dispatch counter for the compaction re-send cadence rides the ledger
 * itself (`__sends` sentinel key — never a charter file path: ledger keys
 * are ref-rooted file paths, never `__`-prefixed).
 */
const SENDS_KEY = '__sends'

function ledgerDispatchIndexOf(ledger: Map<string, string>): number {
  const v = ledger.get(SENDS_KEY)
  const n = v !== undefined ? Number(v) : NaN
  return Number.isInteger(n) && n >= 0 ? n : 0
}

/** A fresh empty ledger (wiring + test face). */
export function newLedger(): Map<string, string> {
  return new Map()
}

/** Commit one assembled dispatch into the caller-owned ledger. */
export function commitToLedger(ledger: Map<string, string>, outcome: AssembleOutcome): void {
  for (const [path, hash] of outcome.sentHashes) ledger.set(path, hash)
  ledger.set(SENDS_KEY, String(ledgerDispatchIndexOf(ledger) + 1))
}

// ── hash face ────────────────────────────────────────────────────────────────

/** `{hash8}` — first 8 hex of sha256 (algorithm source: computeBasisHash). */
export function hash8Of(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 8)
}

/** Render one embed stamp from the (schema-validated) template string. */
export function renderEmbedStamp(
  template: string,
  parts: { path: string; hash8: string; content: string },
): string {
  return template
    .split('{path}').join(parts.path)
    .split('{hash8}').join(parts.hash8)
    .split('{content}').join(parts.content)
}

// ── block resolution ─────────────────────────────────────────────────────────

/**
 * Resolve {{plansDir}} / {{roadmapPath}} / {{projectRoot}} placeholders in
 * block refs (law-policy `resolvePolicyPlaceholders` — one resolution
 * face; the mission context supplies the values). Single-brace tokens are
 * deliberately untouched (same discipline as poolKey).
 */
export function resolveAssemblyBlocks(
  blocks: AssemblyBlock[],
  ctx: { projectRoot?: string; plansDir?: string; roadmapPath?: string },
): AssemblyBlock[] {
  return blocks.map((b) => {
    const ref = resolvePolicyPlaceholders(b.ref, ctx)
    const root = ctx.projectRoot
    const rootPrefix = typeof root === 'string' && root !== '' ? `${root.replace(/[\\/]+$/u, '')}/` : null
    return {
      ...b,
      // Placeholder expansion uses forward slashes, while filesystem I/O uses
      // native paths. Profile artifacts are always rooted at projectRoot.
      ref: b.kind === 'profile' && rootPrefix !== null && ref.startsWith(rootPrefix)
        ? join(root!, ref.slice(rootPrefix.length))
        : ref,
      // M4-WI34: profile blocks carry the repo root so their repo-relative
      // entries can resolve at expansion time (filesOfBlock)
      ...(b.kind === 'profile' && typeof root === 'string' && root !== '' ? { profileRoot: root } : {}),
    }
  })
}

interface ResolvedFile {
  path: string
  content: string | null
  overCap: boolean
}

/** Materialize one block into per-file records (dir/profile-expanded, sorted). */
function filesOfBlock(block: AssemblyBlock, io: AssemblerIo): { files: ResolvedFile[]; notes: string[] } {
  const notes: string[] = []
  const cap = typeof block.maxFileBytes === 'number' ? block.maxFileBytes : null
  const one = (path: string): ResolvedFile => {
    const content = io.readTextFile(path)
    return { path, content, overCap: content !== null && cap !== null && Buffer.byteLength(content, 'utf8') > cap }
  }
  if (block.kind === 'profile') {
    // M4-WI34 (04 §4): the profile block expands to its top-N stable files
    // (reads desc, path asc). Every expanded file rides the FILE semantics —
    // stamp, cap, hash ledger, CONTINUE dedup — unchanged. Fail-soft: an
    // unusable artifact (missing / unknown version / no repo root) renders
    // ONE explicit note, never a crash (the assembler discipline).
    if (typeof block.profileRoot !== 'string' || block.profileRoot === '') {
      return { files: [], notes: [`[prompt-assembler] profile block ${block.ref} has no projectRoot in the assembly context — entries unresolvable (not embedded)`] }
    }
    const loaded = readProfileForEmbed(io, block.ref, block.topN)
    if (!loaded.ok) return { files: [], notes: [loaded.note!] }
    return { files: loaded.entries.map((e) => one(join(block.profileRoot!, e.path))), notes }
  }
  if (block.kind === 'dir') {
    const entries = io.listDirEntries(block.ref)
    if (entries === null) {
      return { files: [], notes: [`[prompt-assembler] directory unreadable: ${block.ref} (not embedded)`] }
    }
    const files: ResolvedFile[] = []
    for (const name of [...entries].sort()) {
      const p = `${block.ref.replace(/\/+$/u, '')}/${name}`
      if (io.isDirectory(p)) continue // top-level files only — deterministic, no recursive blast
      files.push(one(p))
    }
    return { files, notes }
  }
  const file = one(block.ref)
  if (file.content === null) notes.push(`[prompt-assembler] file unreadable: ${block.ref} (not embedded)`)
  return { files: [file], notes }
}

/** All charter files of a spec with their CURRENT hashes (dir-expanded). */
export function charterHashesOf(spec: AssemblerSpec, io: AssemblerIo): Map<string, string> {
  const out = new Map<string, string>()
  for (const block of spec.blocks) {
    for (const f of filesOfBlock(block, io).files) {
      if (f.content !== null) out.set(f.path, hash8Of(f.content))
    }
  }
  return out
}

/** Ledger keys that name real charter files (the `__sends` sentinel excluded). */
function realKeysOf(map: Map<string, string>): Set<string> {
  const out = new Set<string>()
  for (const k of map.keys()) if (k !== SENDS_KEY) out.add(k)
  return out
}

/** The 04 §2.2 rotation judgment: any charter hash changed/added/removed. */
export function charterHashesDiffer(current: Map<string, string>, ledger: Map<string, string>): boolean {
  const currentKeys = realKeysOf(current)
  const ledgerKeys = realKeysOf(ledger)
  if (currentKeys.size !== ledgerKeys.size) return true
  for (const path of currentKeys) {
    if (!ledgerKeys.has(path) || ledger.get(path) !== current.get(path)) return true
  }
  return false
}

// ── the assembler ────────────────────────────────────────────────────────────

/**
 * Assemble one dispatch prompt (04 §3.1). Pure over its inputs: the ledger
 * is READ, never mutated (commit lands through `commitToLedger`). Never
 * throws; unreadable charter files render explicit missing-notes.
 */
export function assemble(
  mode: AssemblyMode,
  spec: AssemblerSpec,
  dynamicCtx: AssemblerDynamicCtx,
  ledger: Map<string, string>,
  io: AssemblerIo,
): AssembleOutcome {
  const stamp = spec.embedStamp !== undefined && spec.embedStamp !== '' ? spec.embedStamp : DEFAULT_EMBED_STAMP
  const dispatchIndex = ledgerDispatchIndexOf(ledger)
  const fullResend = mode === 'CONTINUE' && dispatchIndex > 0 && dispatchIndex % COMPACTION_RESEND_EVERY === 0

  const sentHashes = new Map<string, string>()
  const embedded: string[] = []
  const skipped: string[] = []
  const changed: string[] = []
  const chunks: string[] = []

  for (const block of spec.blocks) {
    const { files, notes } = filesOfBlock(block, io)
    const blockOut: string[] = [...notes]
    for (const f of files) {
      if (f.content === null) continue // the missing-note already rendered
      const hash8 = hash8Of(f.content)
      const known = ledger.get(f.path)
      if (mode === 'CONTINUE' && !fullResend && known === hash8) {
        skipped.push(f.path)
        continue // dedup: hash three-use ① — the followup rides the session prefix
      }
      if (known !== undefined && known !== hash8) changed.push(f.path) // three-use ② stale detection
      const content = f.overCap
        ? `[NOT EMBEDDED: ${Buffer.byteLength(f.content, 'utf8')} bytes exceeds maxFileBytes ${block.maxFileBytes} — file present, re-read locally if needed]`
        : f.content
      if (block.kind === 'text' && !f.overCap) {
        blockOut.push(f.content) // persona/charter text: verbatim, no stamp
      } else {
        blockOut.push(renderEmbedStamp(stamp, { path: f.path, hash8, content })) // three-use ③ grep auditability
      }
      sentHashes.set(f.path, hash8)
      embedded.push(f.path)
    }
    if (blockOut.length > 0) chunks.push(blockOut.join('\n'))
  }

  // prefix discipline (04 §3.2): fixed bytes → dynamic block → volatile suffix
  chunks.push(dynamicCtx.text)
  if (dynamicCtx.volatile !== undefined && dynamicCtx.volatile !== '') chunks.push(dynamicCtx.volatile)

  return { text: chunks.join('\n\n'), sentHashes, embedded, skipped, changed, fullResend }
}
