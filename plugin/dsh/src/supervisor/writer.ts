/**
 * writer.ts — supervisor machine-field writer (age-autonomy M3-WI25, plan
 * `docs/plans/age-autonomy/2026-08-26-1411-1` Phase 2; Q4 adjudication ③).
 *
 * The supervisor is the SOLE writer of the machine fields (plan Phase 1
 * Decision 2 / 02 §4.5 ③): audit-rounds (roadmap frontmatter), failures
 * (plan frontmatter), claim + claim-expires (plan frontmatter). Every write:
 *
 *   1. read the current text;
 *   2. construct the proposed content (frontmatter-only edit, rest verbatim);
 *   3. PRE-WRITE LAW SELF-CHECK — the same evaluateGates pure function the
 *      DSH pre-execute gate runs, with a role-bearing actor
 *      { id: 'mdsupervisor', role: 'supervisor' } — deny ⇒ nothing lands on
 *      disk, the denial is returned for the receipt face. This swaps the
 *      WRITER, not the rules: claim-validity's role whitelist
 *      (engine|supervisor) and writer-identity's faces enforce against this
 *      actor with ZERO rule changes (the 0815-3 claim-residual closure —
 *      the id-only "unverified-writer" transition note is superseded by
 *      this role-bearing channel);
 *   4. baseHash CAS — re-read and compare computeBasisHash (the same
 *      ledger-basis hash the completion formula uses, 01 §5.2); a moved
 *      basis retries (bounded, default 2) and then abandons with status
 *      'conflict' — the next watchdog cycle rescans and re-decides;
 *   5. atomic replace — tmp file in the target directory + rename.
 *
 * Claim shapes mirror the ledger-frontmatter field table (01 §4.4):
 * claim = `attempt-<runId>-<holderSessionId>-<nonce8>` (CLAIM_RE mirror),
 * claim-expires = ISO-8601 in the future at write time (claim-validity TTL
 * face — the law check enforces it; the writer validates the shape first so
 * a malformed call never reaches the disk pipeline).
 */
import { basename, dirname, join } from 'node:path'
import { renameSync, writeFileSync } from 'node:fs'
import { evaluateGates, sha256Text } from '../../assets/src/law-core.mjs'
import { computeBasisHash } from '../../assets/src/ledger-sections.mjs'
import { parseFrontmatter } from '../../assets/src/ledger-frontmatter.mjs'
import { discoverPlansRoots, fsLawGateIo, type LawGateIo, type MissionLawContext } from '../law/host-adapter.ts'
import { receiptFileFor } from './receipt.ts'

/** Mirror of ledger-frontmatter CLAIM_RE (01 §4.4 — the table is not exported). */
const CLAIM_TOKEN_RE = /^attempt-.+-.+-[0-9a-f]{8}$/
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/

export const SUPERVISOR_ACTOR = { id: 'mdsupervisor', role: 'supervisor' } as const

// ── IO seam ──────────────────────────────────────────────────────────────────

export interface MeterWriterIo extends LawGateIo {
  writeTextAtomic(path: string, content: string): void
}

export const fsMeterWriterIo: MeterWriterIo = {
  ...fsLawGateIo,
  writeTextAtomic(path, content) {
    const tmp = join(dirname(path), `.${basename(path)}.mdsupervisor-tmp`)
    writeFileSync(tmp, content, 'utf8')
    renameSync(tmp, path)
  },
}

// ── frontmatter-only editing (pure) ─────────────────────────────────────────

export interface FrontmatterEditOps {
  set?: Record<string, string | number>
  remove?: string[]
}

function renderValue(key: string, value: string | number): string {
  if (typeof value === 'number') return `${key}: ${value}`
  if (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._+-]*$/.test(value)) return `${key}: ${value}`
  return `${key}: ${JSON.stringify(value)}`
}

/**
 * Rewrite ONLY the frontmatter block of a ledger file: existing untouched
 * lines keep their bytes and order, set keys replace-or-insert, remove keys
 * drop out. Returns null when the text is not a frontmatter ledger (the
 * dual-read legacy corpus is out of the machine-field writer's domain).
 */
export function setFrontmatterFields(text: string, ops: FrontmatterEditOps): string | null {
  const parsed = parseFrontmatter(text)
  if (!parsed.ok || parsed.range === null) return null
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const start = parsed.range.start - 1
  const end = parsed.range.end - 1
  const remove = new Set(ops.remove ?? [])
  const out: string[] = []
  for (let i = start; i < end; i++) {
    const line = lines[i]!
    const key = frontmatterKeyOf(line)
    if (key !== null && remove.has(key)) continue
    if (key !== null && ops.set !== undefined && Object.prototype.hasOwnProperty.call(ops.set, key)) {
      out.push(renderValue(key, ops.set[key]!))
      continue
    }
    out.push(line)
  }
  if (ops.set !== undefined) {
    for (const [key, value] of Object.entries(ops.set)) {
      if (out.some((l) => frontmatterKeyOf(l) === key)) continue
      out.push(renderValue(key, value))
    }
  }
  return [...lines.slice(0, start), ...out, ...lines.slice(end)].join('\n')
}

function frontmatterKeyOf(line: string): string | null {
  const m = line.match(/^([A-Za-z0-9][A-Za-z0-9_-]*):/)
  return m !== null ? m[1]! : null
}

// ── the writer core ──────────────────────────────────────────────────────────

export type MachineFieldWriteStatus = 'written' | 'denied' | 'conflict' | 'noop' | 'missing' | 'malformed'

export interface MachineFieldWriteResult {
  status: MachineFieldWriteStatus
  /** the proposed content that was (or would have been) written */
  proposed: string | null
  /** denial reason from the law self-check, when status === 'denied' */
  reason: string | null
}

export interface MachineFieldWriteOptions {
  io?: MeterWriterIo
  /** governing law context (policy + mission faces); required. */
  lawCtx: MissionLawContext
  /** injectable clock (epoch ms) — claim-validity TTL face input. */
  now?: () => number
  /** bounded CAS retries after a moved basis (default 2). */
  casRetries?: number
}

/**
 * One machine-field write through the full pipeline (read → construct → law
 * self-check → CAS → atomic rename). Pure over the IO seam.
 *
 * `cas` selects the comparison hash: 'basis' (default — the completion
 * formula's computeBasisHash domain: frontmatter + Phase + Closure Findings)
 * for frontmatter writes; 'full' (sha256 of the whole text) for body-section
 * appends whose content (Closure / Verification / Deep Audit Record) sits
 * OUTSIDE the basis domain.
 */
function atomicFieldWrite(
  path: string,
  edit: (text: string) => string | null,
  opts: MachineFieldWriteOptions & { cas?: 'basis' | 'full' },
): MachineFieldWriteResult {
  const io = opts.io ?? fsMeterWriterIo
  const retries = opts.casRetries ?? 2
  const casHash = (opts.cas ?? 'basis') === 'full' ? sha256Text : computeBasisHash
  for (let attempt = 0; attempt <= retries; attempt++) {
    const text = io.readTextFile(path)
    if (text === null) return { status: 'missing', proposed: null, reason: null }
    const proposed = edit(text)
    if (proposed === null) return { status: 'malformed', proposed: null, reason: 'target is not a frontmatter ledger (dual-read legacy corpus is outside the machine-field writer domain)' }
    if (proposed === text) return { status: 'noop', proposed, reason: null }

    // pre-write law self-check — same evaluateGates the DSH gate runs, with
    // the role-bearing supervisor actor (claim-validity / writer-identity /
    // record-append-only / closure-audit-binding / audit-rounds-overflow
    // enforce against it with zero rule changes)
    const roadmapText = opts.lawCtx.roadmapPath !== '' ? io.readTextFile(opts.lawCtx.roadmapPath) : null
    const out = evaluateGates(
      {
        type: 'write',
        path,
        proposedContent: proposed,
        baseHash: sha256Text(text),
        actor: { ...SUPERVISOR_ACTOR },
      },
      {
        policy: opts.lawCtx.policy,
        currentFileState: { text },
        ctx: {
          plansDir: opts.lawCtx.plansDir,
          roadmapPath: opts.lawCtx.roadmapPath,
          agentNames: opts.lawCtx.agentNames,
          commands: opts.lawCtx.commands,
          maxAuditRounds: opts.lawCtx.maxAuditRounds,
          projectRoot: opts.lawCtx.projectRoot,
          plansRoots: discoverPlansRoots(path, io),
          now: opts.now?.() ?? Date.now(),
          ...(roadmapText !== null ? { roadmapText } : {}),
        },
      },
    )
    if (out.decision === 'deny') {
      // deny ⇒ nothing lands on disk + a receipt record (plan Phase 2 item 3)
      const ts = new Date(opts.now?.() ?? Date.now()).toISOString()
      try {
        io.appendLine(
          receiptFileFor(opts.lawCtx.projectRoot),
          JSON.stringify({ ts, kind: 'exception', runId: null, plan: path, event: 'machine-field-write-denied', detail: out.reason }),
        )
      } catch {
        // a receipt-append failure must never mask the denial result
      }
      return { status: 'denied', proposed, reason: out.reason }
    }

    // CAS: the comparison hash must not have moved between read and rename
    const reread = io.readTextFile(path)
    if (reread === null) return { status: 'missing', proposed, reason: null }
    if (casHash(reread) !== casHash(text)) continue

    io.writeTextAtomic(path, proposed)
    return { status: 'written', proposed, reason: null }
  }
  return { status: 'conflict', proposed: null, reason: `basis moved across ${retries + 1} attempts — abandoned; the next watchdog cycle rescans and re-decides` }
}

// ── body-section appends (dispatch lines / pass lines; 01 §4.2/§4.4) ───────

/**
 * Append lines at the END of one append-only ledger section (level-2 h2
 * block), creating the section at EOF when absent. Existing bytes keep their
 * order; the insertion point walks back over trailing blank lines so the
 * section's blank separator survives. Returns null for non-frontmatter
 * texts (outside the writer domain).
 */
export function appendToSection(text: string, section: string, lines: string[]): string | null {
  const parsed = parseFrontmatter(text)
  if (!parsed.ok || parsed.range === null) return null
  const normalized = text.replace(/\r\n?/g, '\n')
  const split = normalized.split('\n')
  const bodyStart = parsed.range.end
  let sectionStart = -1
  let sectionEnd = -1
  for (let i = bodyStart; i < split.length; i++) {
    const m = split[i]!.match(/^##(?!#)\s*(\S.*?)\s*$/)
    if (m === null) continue
    if (sectionStart === -1) {
      if (m[1] === section) {
        sectionStart = i
        sectionEnd = split.length
      }
    } else {
      sectionEnd = i
      break
    }
  }
  const block = lines
  if (sectionStart === -1) {
    // section absent → create at EOF (append-only: no existing content touched;
    // a trailing newline in the source becomes the blank separator)
    const out = [...split]
    if (out.length === 0 || out[out.length - 1] !== '') out.push('')
    out.push(`## ${section}`, ...block)
    return out.join('\n')
  }
  let insertAt = sectionEnd
  while (insertAt > sectionStart + 1 && split[insertAt - 1]!.trim() === '') insertAt -= 1
  const out = [...split.slice(0, insertAt), ...block, ...split.slice(insertAt)]
  return out.join('\n')
}

export interface SectionAppendOptions extends MachineFieldWriteOptions {
  path: string
  /** target level-2 section title (e.g. 'Draft Review Record', 'Verification', 'Closure', 'Deep Audit Record'). */
  section: string
  /** append-only lines (dispatch / pass lines per 01 §4.2 grammar). */
  lines: string[]
  /** frontmatter fields set in the SAME atomic write (deep-audit meter increment, 01 §3.1). */
  setFrontmatter?: Record<string, string | number>
}

/**
 * Append dispatch/pass lines into one append-only ledger section through the
 * full writer pipeline (construct → law self-check → full-text CAS → atomic
 * rename). The same-write `setFrontmatter` rides ONE atomic write (01 §3.1:
 * the dispatching write increments audit-rounds together with the DAR line).
 */
export function appendSectionLines(opts: SectionAppendOptions): MachineFieldWriteResult {
  return atomicFieldWrite(
    opts.path,
    (text) => {
      let next = appendToSection(text, opts.section, opts.lines)
      if (next === null) return null
      if (opts.setFrontmatter !== undefined) {
        const withFm = setFrontmatterFields(next, { set: opts.setFrontmatter })
        if (withFm === null) return null
        next = withFm
      }
      return next
    },
    { ...opts, cas: 'full' },
  )
}

// ── the three machine-field write functions (03 §2 meter duty) ──────────────

export interface WriteClaimOptions extends MachineFieldWriteOptions {
  planPath: string
  claim: string
  /** ISO-8601 timestamp in the future at write time (claim-validity TTL face). */
  expires: string
}

/** Issue/replace a claim on an ACTIVE plan (supervisor writer face). */
export function writePlanClaim(opts: WriteClaimOptions): MachineFieldWriteResult {
  if (!CLAIM_TOKEN_RE.test(opts.claim)) {
    return { status: 'malformed', proposed: null, reason: `claim must match attempt-<runId>-<holderSessionId>-<nonce8> (01 §4.4; got ${JSON.stringify(opts.claim)})` }
  }
  if (!ISO8601_RE.test(opts.expires) || Number.isNaN(Date.parse(opts.expires))) {
    return { status: 'malformed', proposed: null, reason: `claim-expires must be an ISO-8601 timestamp (got ${JSON.stringify(opts.expires)})` }
  }
  return atomicFieldWrite(
    opts.planPath,
    (text) => setFrontmatterFields(text, { set: { claim: opts.claim, 'claim-expires': opts.expires } }),
    opts,
  )
}

export interface ClearClaimOptions extends MachineFieldWriteOptions {
  planPath: string
}

/** Clear the claim pair (dispatcher clear face — supervisor role passes claim-validity ①). */
export function clearPlanClaim(opts: ClearClaimOptions): MachineFieldWriteResult {
  return atomicFieldWrite(opts.planPath, (text) => setFrontmatterFields(text, { remove: ['claim', 'claim-expires'] }), opts)
}

export interface WriteFailuresOptions extends MachineFieldWriteOptions {
  planPath: string
  failures: number
}

/** Set the failures counter (supervisor failure attribution; buckets land WI27). */
export function writePlanFailures(opts: WriteFailuresOptions): MachineFieldWriteResult {
  if (!Number.isInteger(opts.failures) || opts.failures < 0) {
    return { status: 'malformed', proposed: null, reason: `failures must be a non-negative integer (got ${JSON.stringify(opts.failures)})` }
  }
  return atomicFieldWrite(opts.planPath, (text) => setFrontmatterFields(text, { set: { failures: opts.failures } }), opts)
}

export interface WriteAuditRoundsOptions extends MachineFieldWriteOptions {
  roadmapPath: string
  auditRounds: number
}

/** Set the roadmap audit-rounds meter (mission-level Deep Audit count, 01 §3.1). */
export function writeRoadmapAuditRounds(opts: WriteAuditRoundsOptions): MachineFieldWriteResult {
  if (!Number.isInteger(opts.auditRounds) || opts.auditRounds < 0) {
    return { status: 'malformed', proposed: null, reason: `audit-rounds must be a non-negative integer (got ${JSON.stringify(opts.auditRounds)})` }
  }
  return atomicFieldWrite(opts.roadmapPath, (text) => setFrontmatterFields(text, { set: { 'audit-rounds': opts.auditRounds } }), opts)
}
