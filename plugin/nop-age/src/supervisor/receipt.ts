/**
 * receipt.ts — supervisor receipt minimal face (age-autonomy M3-WI25, plan
 * `docs/plans/age-autonomy/2026-08-26-1411-1` Phase 2; 03-supervisor §2
 * receipt duty + the A8 adjudication 2026-08-24).
 *
 * Structured receipt records land in ONE append-only JSONL per project root
 * — `_tmp/supervisor-receipts.jsonl` (pinned here, the
 * `_tmp/law-observations.jsonl` precedent — one file family, no second
 * invention). Records carry the run dimension as a field (runId / plan) so
 * the single file serves every run. Best-effort delivery posts ONE
 * plain-text line to a live session through the agents face
 * (`agents.get(sessionId)` → `followup`, the mdcontrol terminal-receipt
 * precedent); a dead session or a throwing followup is delivery-failure
 * record + warn — never a loop blocker (A8: dead-session delivery failure
 * is adjudicated as accepted). The `mdcontrol.status` read face exposes the
 * recent records through the supervisor status hook (zero new route —
 * mdcontrol-routes.ts threads the hook through).
 */
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export type SupervisorReceiptKind = 'mount' | 'observation' | 'terminal' | 'exception' | 'delivery-failure'

export interface SupervisorReceiptRecord {
  ts: string
  kind: SupervisorReceiptKind
  /** run dimension fields (null when not run-scoped) */
  runId: string | null
  plan: string | null
  event: string
  detail?: string
}

/** Pinned receipt file path (single file family per project root). */
export function receiptFileFor(projectRoot: string): string {
  return join(projectRoot, '_tmp', 'supervisor-receipts.jsonl')
}

export interface ReceiptIo {
  appendLine(file: string, line: string): void
  readTextFile(path: string): string | null
}

export const fsReceiptIo: ReceiptIo = {
  appendLine(file, line) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, line + '\n', { flag: 'a' })
  },
  readTextFile(path) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  },
}

/** Append one structured receipt record (append-only JSONL). */
export function appendReceipt(
  io: ReceiptIo,
  projectRoot: string,
  record: Omit<SupervisorReceiptRecord, 'ts'>,
  now: () => string = () => new Date().toISOString(),
): SupervisorReceiptRecord {
  const stamped: SupervisorReceiptRecord = { ts: now(), ...record }
  io.appendLine(receiptFileFor(projectRoot), JSON.stringify(stamped))
  return stamped
}

/** Read the receipt log (most recent last); a missing file reads as empty. */
export function readReceipts(io: ReceiptIo, projectRoot: string, limit = 20): SupervisorReceiptRecord[] {
  const text = io.readTextFile(receiptFileFor(projectRoot))
  if (text === null) return []
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  const tail = lines.slice(-limit)
  const out: SupervisorReceiptRecord[] = []
  for (const line of tail) {
    try {
      out.push(JSON.parse(line) as SupervisorReceiptRecord)
    } catch {
      // a torn final line never breaks the read face
    }
  }
  return out
}

// ── best-effort delivery (A8: dead session = accepted failure) ──────────────

/** The agents face slice delivery needs (mdcontrol terminal-receipt shape). */
export interface ReceiptAgentsFace {
  get(id: string): { followup(message: unknown): void } | undefined
}

export interface DeliveryOutcome {
  delivered: boolean
  error: string | null
}

/**
 * Post ONE plain-text receipt line to a session, best-effort: unknown/dead
 * session and throwing followup both return { delivered: false } — never
 * throws (a delivery failure must never block the watchdog loop, A8).
 */
export function deliverReceiptLine(agents: ReceiptAgentsFace | undefined, sessionId: string, line: string): DeliveryOutcome {
  const agent = typeof agents?.get === 'function' ? agents.get(sessionId) : undefined
  if (agent === undefined || typeof agent.followup !== 'function') {
    return { delivered: false, error: `session ${sessionId} not live — receipt delivery skipped (A8 adjudicated failure)` }
  }
  try {
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: line }],
        source: { kind: 'user' },
      }),
    )
    return { delivered: true, error: null }
  } catch (err) {
    return { delivered: false, error: err instanceof Error ? err.message : String(err) }
  }
}
