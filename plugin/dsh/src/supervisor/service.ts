/**
 * service.ts — supervisor service publication (age-autonomy M3-WI25, plan
 * `docs/plans/age-autonomy/2026-08-26-1411-1` Phase 2).
 *
 * Service-form adjudication (plan Phase 1 Decision 1): the supervisor is
 * the SECOND cordis service publication inside this same DSH bundle
 * (Service-subclass precedent MdControlService; same bundle, same isolate
 * realm, no new host entry). Host lifetime = supervisor lifetime (03 §10
 * watchdog constraint — the host process IS the watchdog; no second
 * deployment face).
 *
 * mountSupervisor() wires the five-duty seam:
 *   - watchdog loop (./watchdog.ts) — heartbeat + event edges, single-flight,
 *     recovery scan on start (restart seam; full semantics = WI29);
 *   - decision core (./decision-core.ts) — decide(); sustain/trigger are
 *     declared interfaces (implementation = 1411-2), terminal evaluation
 *     access point = 1411-3;
 *   - machine-field writer (./writer.ts) — the sole-writer channel (Q4 ③);
 *   - receipt face (./receipt.ts) — JSONL records + best-effort delivery
 *     (A8) + the `mdcontrol.status` read-face passthrough (zero new route).
 *
 * Deployment face: the project root to supervise comes from the bundle
 * config row (`supervisor.projectRoot`); without one the service mounts in
 * idle posture — a mount-log note, never a mount failure (the
 * absent-webServer degradation precedent). Existing hosts gain nothing
 * unattended (Phase 1 Decision 3).
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import { createWatchdog, type WatchdogFace, type WatchdogLogger, type WatchdogStatusFace } from './watchdog.ts'
import type { DispatchAgentsFace } from './exec-arm.ts'
import { fsLawGateIo } from '../law/host-adapter.ts'
import { resolveAgentsService } from '../native-executor.ts'

/** The published `mdsupervisor` cordis service face. */
export class SupervisorService extends Service {
  readonly watchdog: WatchdogFace

  constructor(ctx: Context, watchdog: WatchdogFace) {
    super(ctx, 'mdsupervisor')
    this.watchdog = watchdog
  }
}

export interface MountSupervisorOptions {
  projectRoot?: string
  heartbeatMs?: number
  logger?: WatchdogLogger
  /**
   * M3-WI28 (03 §4 opt-in): pre-enable continuous mode — the headless
   * deployment's EXPLICIT declaration (bundle config `supervisor.continuous:
   * true`); default off. In-memory: restart clears it (the per-root flag
   * lives on the watchdog, mdcontrol.continuous toggles it at runtime).
   */
  continuous?: boolean
}

export interface MountedSupervisor {
  service: SupervisorService | null
  watchdog: WatchdogFace | null
  statusFace: () => WatchdogStatusFace | null
  /**
   * M3-WI28: continuous-mode control face over the mounted watchdog (null
   * when mounted idle) — structurally satisfies mdcontrol-routes'
   * ContinuousControlFace (the route's toggle/query hook).
   */
  continuous: {
    readonly projectRoot: string
    enabled(): boolean
    set(enabled: boolean): void
    setReceiptTarget(sessionId: string | null): void
  } | null
  dispose: () => void
}

/**
 * Mount the supervisor: watchdog over the configured project root (idle
 * posture without one), the cordis service publication, and the mount-log
 * line. The dispose is idempotent (stop() is idempotent; the service
 * unregisters with its owning fiber).
 */
export function mountSupervisor(ctx: Context, options: MountSupervisorOptions = {}): MountedSupervisor {
  const logger = options.logger ?? {}
  const logs = {
    info: (m: string, f?: Record<string, unknown>) => logger.info?.(m, f),
    warn: (m: string, f?: Record<string, unknown>) => logger.warn?.(m, f),
  }

  if (options.projectRoot === undefined || options.projectRoot === '') {
    logger.info?.('[mdsupervisor] supervisor mounted idle — no projectRoot configured (bundle config row supervisor.projectRoot); heartbeat not started', {
      scope: 'mdsupervisor',
      posture: 'observe-only seam (M3-WI25); dispatch decisions no-op until 1411-2',
    })
    return {
      service: null,
      watchdog: null,
      statusFace: () => null,
      continuous: null,
      dispose: () => {},
    }
  }

  // M3-WI26: the DSH agents service (when composed on the host) is the
  // execution arm's dispatch face — dispatch exits create agent sessions
  // bound to the policy model selection. Absent (plain hosts / unit fakes)
  // ⇒ the arm degrades to ledger registration + receipts, never a failure.
  const dispatchAgents = resolveAgentsService(ctx) as DispatchAgentsFace | undefined
  const watchdog = createWatchdog({
    projectRoot: options.projectRoot,
    heartbeatMs: options.heartbeatMs,
    io: fsLawGateIo,
    logger: logs,
    ...(options.continuous !== undefined ? { continuous: options.continuous } : {}),
    ...(dispatchAgents !== undefined && dispatchAgents !== null ? { dispatchAgents } : {}),
  })
  watchdog.start()

  const service = new SupervisorService(ctx, watchdog)
  logger.info?.('[mdsupervisor] supervisor mounted', {
    scope: 'mdsupervisor',
    phase: 'M3-WI28 (continuous-mode opt-in: mdcontrol.continuous route + queue chain edge + terminal receipt wiring) — dispatch decisions stay observation receipts until continuous mode is explicitly enabled',
    projectRoot: options.projectRoot,
    heartbeatMs: options.heartbeatMs ?? 30000,
    service: 'mdsupervisor (second publication, same bundle/isolate realm)',
    dispatchFace: dispatchAgents !== undefined && dispatchAgents !== null ? 'dsh-agents' : 'registration-only (no agents service composed)',
    continuous: options.continuous === true
      ? 'pre-enabled via bundle config supervisor.continuous (explicit headless declaration, 03 §4)'
      : 'off by default — BEHAVIOR TIGHTENING (03 §4 opt-in, M3-WI28): hosts whose policy carries a triggers: section now need an explicit mdcontrol.continuous enable to run unattended dispatch; existing hosts silently degrade to observation receipts (mount log + CONTEXT.md changelog pin discoverability)',
  })

  return {
    service,
    watchdog,
    statusFace: () => watchdog.statusFace(),
    continuous: {
      projectRoot: options.projectRoot,
      enabled: () => watchdog.isContinuous(),
      set: (enabled: boolean) => watchdog.setContinuous(enabled),
      setReceiptTarget: (sessionId: string | null) => watchdog.setReceiptTarget(sessionId),
    },
    dispose: () => watchdog.stop(),
  }
}
