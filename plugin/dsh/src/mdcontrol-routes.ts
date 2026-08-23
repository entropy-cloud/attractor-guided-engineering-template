/**
 * mdcontrol-routes.ts — Mission Control wire routes: mdcontrol.run /
 * mdcontrol.status / mdcontrol.list (dsh-plugin M2-WI10, plan
 * `2026-08-23-1621-2` Phase 1).
 *
 * ── Exposure surface (plan Phase 1 Decision 1) ──────────────────────────────
 * better-sidebar precedent shape (`src/index.ts` buildApi + `src/wire.ts`):
 * a wire-method FULL-NAME record → async handlers, served by the plugin's
 * own dispatcher; missing services degrade to structured wire errors. This
 * module owns the record; `service.ts` owns mounting (cordis Service
 * publication as `mdcontrol` + optional HTTP dispatcher via ctx.webServer,
 * better-sidebar `/sidebar/api` pattern). `mdcontrol.draft` / `mdcontrol.analyze`
 * are deliberately absent — adjudicated to M3/WI12 (plan §Deferred But
 * Adjudicated; service.ts header ledger).
 *
 * ── Async job contract (packaging doc §Service Surface, owner) ──────────────
 * `mdcontrol.run` NEVER blocks on mission completion: validate config →
 * start the engine loop as a detached in-host task → return immediately with
 * `{ runId, status: 'started' }`. Progress flows through `mdcontrol.status`
 * (reads the engine's run-state files — thin passthrough, NO second state
 * machine) and the unchanged monitor dashboard. Session lifetime is
 * decoupled: closing the chat session that started a run does not stop it
 * (the task holds no reference to the requesting session; the optional
 * terminal receipt merely fails to find a live agent afterwards).
 *
 * ── runId semantics (plan Phase 1 Decision 2) ───────────────────────────────
 * runId = basename of the engine's runDir (`<projectRoot>/_tmp/<runId>/`).
 * The engine already stamps `run-state.json.runId` with the same value
 * (engine.js: `this.runId = cfg.runDir ? basename(cfg.runDir) : null`), so
 * route runId, run-state runId, and monitor run identity are ONE vocabulary.
 * Same-root concurrency — the only collision case for the timestamped
 * default runDir — is excluded by the active-run guard below.
 *
 * ── Active-run guard (adjudicated in plan `2026-08-23-1447-1` §Deferred But
 * Adjudicated "插件层 active-run guard", reopen trigger = this plan) ─────────
 * "单 run per projectRoot + 宿主侧注册；比引擎 CLI 宽松的并发语义（reaper 饶并行
 * run）更严格是有意为之；跨 root 独立。" One run at a time per resolved
 * projectRoot, registered host-side (this registry, NOT the engine CLI's
 * `~/.mission-driver/active/` files — embed mode never touches those,
 * M1-WI4). Cleared on EVERY terminal path (success, engine failure, task
 * crash); concurrent same-root start = explicit `run-in-progress` wire
 * error. Runs across different roots stay independent engine instances.
 *
 * ── Terminal receipt (plan Phase 1 Decision 3) ──────────────────────────────
 * Opt-in via payload `followup: { sessionId }`. On terminal state the route
 * posts ONE plain-text line back to the requesting agent through
 * `agents.get(sessionId)` → `agent.followup(...)`. Host-source verified
 * (2026-08-23, local clone `~/ai/dsh-src/deepseek-harness`, read-only):
 * `AgentRegistry.get(id)` exists at `packages/core/agent/src/index.ts:583`
 * ("Look up a live agent … undefined when no live agent has that id",
 * returns the bare Agent — no handle). This is the SIXTH host call beyond
 * the packaging doc's pinned five (create/resume/followup/status/dispose);
 * the doc's §Dependency and Version Risk list is amended by this plan's
 * Phase 3. When the session is no longer live (host restart, session
 * closed) the receipt is skipped with a log line — the run itself already
 * reached its terminal state on disk, so nothing is lost.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { beginNativeMission, type HostContext, type NativeRunTerminal } from './engine-bridge.ts'
import { resolveAgentsService } from './native-executor.ts'

// ── Wire errors (better-sidebar SidebarError pattern) ───────────────────────

export type MdControlErrorCode =
  | 'bad-request'
  | 'not-found'
  | 'run-in-progress'
  | 'internal'

/** One route failure with its machine-readable wire code. */
export class MdControlError extends Error {
  readonly code: MdControlErrorCode

  constructor(code: MdControlErrorCode, message: string) {
    super(message)
    this.name = 'MdControlError'
    this.code = code
  }
}

// ── Payload / result shapes (wire method full names pinned by Decision 1) ───

export interface MdControlRunPayload {
  /** Project root the mission runs against (missions/ + _tmp/ live here). */
  projectRoot: string
  /** Engine args passthrough (mission, runDir, driver, …) — resolveConfig keys. */
  args?: Record<string, unknown>
  /** Opt-in terminal receipt: one plain-text line posted to this session. */
  followup?: { sessionId: string }
}

export interface MdControlRunResult {
  runId: string
  runDir: string
  status: 'started'
  startedAt: string
}

export interface MdControlStatusPayload {
  projectRoot: string
  runId: string
}

export interface MdControlStatusResult {
  runId: string
  runDir: string | null
  /** false when neither a live record nor a run-state file exists. */
  found: boolean
  /** true while the run task of THIS service instance is in flight. */
  live: boolean
  /** Engine run-state passthrough (the status vocabulary owner). */
  runState: Record<string, unknown> | null
  /** In-memory terminal record (error path survives even without run-state). */
  terminal: NativeRunTerminal | null
}

export interface MdControlListPayload {
  projectRoot: string
}

export interface MdControlListRunRow {
  runId: string
  runDir: string
  status: string | null
  missionName: string | null
  startedAt: string | null
  live: boolean
  terminal: NativeRunTerminal | null
}

export interface MdControlListResult {
  projectRoot: string
  runs: MdControlListRunRow[]
}

/** The three M2-WI10 routes (draft/analyze → M3/WI12, plan §Deferred). */
export interface MdControlRoutes {
  'mdcontrol.run'(payload: unknown): Promise<MdControlRunResult>
  'mdcontrol.status'(payload: unknown): Promise<MdControlStatusResult>
  'mdcontrol.list'(payload: unknown): Promise<MdControlListResult>
}

// ── Active-run guard (1447-1 adjudication, see file header) ─────────────────

/** Guard slot for one occupied project root (runId assigned once known). */
export interface ActiveRunHandle {
  readonly projectRoot: string
  runId: string | null
}

export class ActiveRunGuard {
  private readonly byRoot = new Map<string, ActiveRunHandle>()

  /** Occupy the root; null when another run already holds it. */
  tryAcquire(projectRoot: string): ActiveRunHandle | null {
    const root = resolve(projectRoot)
    if (this.byRoot.has(root)) return null
    const handle: ActiveRunHandle = { projectRoot: root, runId: null }
    this.byRoot.set(root, handle)
    return handle
  }

  /** Release a root — a no-op when the slot was already cleared/replaced. */
  release(handle: ActiveRunHandle): void {
    if (this.byRoot.get(handle.projectRoot) === handle) this.byRoot.delete(handle.projectRoot)
  }

  current(projectRoot: string): ActiveRunHandle | null {
    return this.byRoot.get(resolve(projectRoot)) ?? null
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export interface MdControlLogger {
  info?(message: string, fields?: Record<string, unknown>): void
  warn?(message: string, fields?: Record<string, unknown>): void
}

function requireString(payload: unknown, key: string): string {
  const value = (payload as Record<string, unknown> | null)?.[key]
  if (typeof value !== 'string' || value === '') {
    throw new MdControlError('bad-request', `missing or invalid "${key}"`)
  }
  return value
}

function readRunState(runDir: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(runDir, 'run-state.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Disk row source: `_tmp/<dir>/run-state.json` (monitor listRuns precedent). */
function listDiskRuns(projectRoot: string): Array<{ runId: string; runDir: string; mtimeMs: number; runState: Record<string, unknown> | null }> {
  const tmp = resolve(projectRoot, '_tmp')
  let dirs: string[]
  try {
    dirs = readdirSync(tmp)
  } catch {
    return []
  }
  const rows = []
  for (const d of dirs) {
    const runDir = join(tmp, d)
    let isDir = false
    let mtimeMs = 0
    try {
      const st = statSync(runDir)
      isDir = st.isDirectory()
      mtimeMs = st.mtimeMs
    } catch {
      continue
    }
    if (!isDir) continue
    // Only dirs that ARE runs (run-state.json present or being written) —
    // `_tmp` also hosts draft jobs and analyze artifacts.
    if (!existsSync(join(runDir, 'run-state.json'))) continue
    rows.push({ runId: d, runDir, mtimeMs, runState: readRunState(runDir) })
  }
  return rows
}

interface LiveRunRecord {
  runId: string
  runDir: string
  projectRoot: string
  startedAt: string
  terminal: NativeRunTerminal | null
  endedAt: string | null
  followup: { sessionId: string } | null
}

// ── Route record factory ────────────────────────────────────────────────────

export interface CreateMdControlRoutesOptions {
  ctx: HostContext
  guard?: ActiveRunGuard
  logger?: MdControlLogger
  now?: () => string
}

/**
 * Build the `mdcontrol.*` wire-method record over one host context. Pure
 * plugin-layer logic: the engine surface it consumes is exactly
 * `beginNativeMission` (engine-bridge) + run-state file reads. Unit-testable
 * with a fake HostContext (fake agents service) via direct record calls.
 */
export function createMdControlRoutes({
  ctx,
  guard = new ActiveRunGuard(),
  logger,
  now = () => new Date().toISOString(),
}: CreateMdControlRoutesOptions): MdControlRoutes & { guard: ActiveRunGuard } {
  const records = new Map<string, LiveRunRecord>()

  const postReceipt = (record: LiveRunRecord, terminal: NativeRunTerminal): void => {
    if (!record.followup) return
    const line =
      `[mdcontrol] run ${record.runId} finished: status=${terminal.status ?? 'error'} ` +
      `exitCode=${terminal.exitCode}` +
      (terminal.error ? ` error=${terminal.error.message}` : '')
    // resolveAgentsService: real cordis contexts require ctx.get(name) for
    // services the plugin never declared in inject (property read throws).
    const agents = resolveAgentsService(ctx) as
      | { get(id: string): { followup(message: unknown): void } | undefined }
      | undefined
    const agent = typeof agents?.get === 'function' ? agents.get(record.followup.sessionId) : undefined
    if (!agent || typeof agent.followup !== 'function') {
      logger?.warn?.('mdcontrol.run terminal receipt skipped (requesting session no longer live)', {
        runId: record.runId,
        sessionId: record.followup.sessionId,
      })
      return
    }
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: line }],
        source: { kind: 'user' },
      }))
      logger?.info?.('mdcontrol.run terminal receipt posted', { runId: record.runId })
    } catch (err) {
      logger?.warn?.('mdcontrol.run terminal receipt failed', {
        runId: record.runId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const settle = (record: LiveRunRecord, handle: ActiveRunHandle, terminal: NativeRunTerminal): void => {
    record.terminal = terminal
    record.endedAt = now()
    guard.release(handle)
    postReceipt(record, terminal)
  }

  const routes: MdControlRoutes = {
    async 'mdcontrol.run'(payload) {
      const projectRoot = requireString(payload, 'projectRoot')
      const rawArgs = (payload as MdControlRunPayload | null)?.args
      if (rawArgs !== undefined && (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs))) {
        throw new MdControlError('bad-request', '"args" must be a plain object')
      }
      const rawFollowup = (payload as MdControlRunPayload | null)?.followup
      if (rawFollowup !== undefined) {
        if (typeof rawFollowup !== 'object' || rawFollowup === null || typeof rawFollowup.sessionId !== 'string' || rawFollowup.sessionId === '') {
          throw new MdControlError('bad-request', '"followup", when set, must be { sessionId: string }')
        }
      }

      // Guard FIRST: a rejected concurrent start must not even bootstrap a
      // runDir; a bootstrap/executor failure below releases immediately, so
      // the observable postcondition of a failed call is an unoccupied root.
      const handle = guard.tryAcquire(projectRoot)
      if (handle === null) {
        const holder = guard.current(projectRoot)
        throw new MdControlError(
          'run-in-progress',
          `a mission run is already active for project root ${resolve(projectRoot)}` +
            (holder?.runId ? ` (runId ${holder.runId})` : '') +
            ' — single run per project root (mdcontrol guard); wait for its terminal state or choose another root',
        )
      }

      let start
      try {
        start = await beginNativeMission({ ctx, projectRoot, args: rawArgs as Record<string, unknown> | undefined })
      } catch (err) {
        guard.release(handle)
        throw err
      }
      handle.runId = start.runId

      const record: LiveRunRecord = {
        runId: start.runId,
        runDir: start.runDir,
        projectRoot: resolve(projectRoot),
        startedAt: now(),
        terminal: null,
        endedAt: null,
        followup: rawFollowup ?? null,
      }
      records.set(start.runId, record)

      // Detached in-host task: the terminal handler always runs (the promise
      // never rejects — engine-bridge captures every error), clearing the
      // guard on success, engine failure, AND task crash alike.
      void start.promise.then((terminal) => settle(record, handle, terminal))

      return { runId: start.runId, runDir: start.runDir, status: 'started', startedAt: record.startedAt }
    },

    async 'mdcontrol.status'(payload) {
      const projectRoot = requireString(payload, 'projectRoot')
      const runId = requireString(payload, 'runId')
      const root = resolve(projectRoot)
      const record = [...records.values()].find((r) => r.projectRoot === root && r.runId === runId) ?? null
      const runDir = record?.runDir ?? join(root, '_tmp', runId)
      const runState = readRunState(runDir)
      const found = record !== null || runState !== null
      return {
        runId,
        runDir: found ? runDir : null,
        found,
        live: record !== null && record.terminal === null,
        runState,
        terminal: record?.terminal ?? null,
      }
    },

    async 'mdcontrol.list'(payload) {
      const projectRoot = requireString(payload, 'projectRoot')
      const root = resolve(projectRoot)
      const byRunId = new Map<string, MdControlListRunRow>()
      for (const row of listDiskRuns(root)) {
        byRunId.set(row.runId, {
          runId: row.runId,
          runDir: row.runDir,
          status: (row.runState?.status as string | undefined) ?? null,
          missionName: (row.runState?.missionName as string | undefined) ?? null,
          startedAt: null,
          live: false,
          terminal: null,
        })
      }
      for (const record of records.values()) {
        if (record.projectRoot !== root) continue
        const disk = byRunId.get(record.runId)
        byRunId.set(record.runId, {
          runId: record.runId,
          runDir: record.runDir,
          status: disk?.status ?? null,
          missionName: disk?.missionName ?? null,
          startedAt: record.startedAt,
          live: record.terminal === null,
          terminal: record.terminal,
        })
      }
      return { projectRoot: root, runs: [...byRunId.values()] }
    },
  }

  return { ...routes, guard }
}

// ── Service publication + HTTP dispatcher (service.ts consumes both) ────────

/** Structural face of the host webServer this plugin uses (better-sidebar mirror). */
export interface MdControlWebServer {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: { method?: string; url?: string } & AsyncIterable<Buffer | string>, res: {
      writeHead(status: number, headers?: Record<string, string>): void
      end(body?: string): void
    }) => void | Promise<void>
  }): () => void
}

const HTTP_PREFIX = '/mdcontrol/api'

function writeJson(res: Parameters<Parameters<MdControlWebServer['register']>[0]['handler']>[1], status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * Own HTTP API dispatcher (Decision 1, better-sidebar `/sidebar/api` pattern):
 * POST `<prefix>/<wire method full name>` with a JSON body →
 * `{ ok: true, value }` / `{ ok: false, error: { code, message } }`.
 * Registered only when the host provides `webServer` (resolved via
 * `ctx.get('webServer')` — a direct property read of an un-provided service
 * throws in cordis, `get` returns undefined); otherwise the routes stay
 * reachable through the cordis service publication (degradation is a
 * mount-log line, never a mount failure).
 */
export function registerMdControlHttpDispatcher(
  ctx: { get?(name: string): unknown },
  routes: MdControlRoutes,
  logger?: MdControlLogger,
): (() => void) | null {
  const webServer = (typeof ctx.get === 'function' ? ctx.get('webServer') : undefined) as MdControlWebServer | undefined
  if (!webServer || typeof webServer.register !== 'function') {
    logger?.info?.('mdcontrol HTTP dispatcher not registered (webServer service absent)', { prefix: HTTP_PREFIX })
    return null
  }
  return webServer.register({
    kind: 'prefix',
    path: HTTP_PREFIX,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'bad-request', message: 'method not allowed (POST only)' } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://mdcontrol.internal').pathname
      const method = pathname.startsWith(`${HTTP_PREFIX}/`) ? pathname.slice(HTTP_PREFIX.length + 1) : undefined
      if (method === undefined || method.includes('/')) {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown mdcontrol API method' } })
        return
      }
      const handler = (routes as unknown as Record<string, ((payload: unknown) => Promise<unknown>) | undefined>)[method]
      if (handler === undefined) {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown mdcontrol API method "${method}"` } })
        return
      }
      let payload: unknown = {}
      try {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(Buffer.from(chunk))
          if (chunks.reduce((n, c) => n + c.length, 0) > (1 << 20)) {
            throw new MdControlError('bad-request', 'request body too large')
          }
        }
        const text = Buffer.concat(chunks).toString('utf8')
        if (text.trim() !== '') payload = JSON.parse(text)
      } catch (err) {
        const code = err instanceof MdControlError ? err.code : 'bad-request'
        const message = err instanceof MdControlError ? err.message : 'request body is not valid JSON'
        writeJson(res, 400, { ok: false, error: { code, message } })
        return
      }
      try {
        writeJson(res, 200, { ok: true, value: await handler(payload) })
      } catch (err) {
        if (err instanceof MdControlError) {
          writeJson(res, 400, { ok: false, error: { code: err.code, message: err.message } })
          return
        }
        writeJson(res, 500, { ok: false, error: { code: 'internal', message: err instanceof Error ? err.message : String(err) } })
      }
    },
  })
}
