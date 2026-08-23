/**
 * service.ts — Mission Control cordis service: `mdcontrol.*` routes wired
 * (dsh-plugin M2-WI10, plan `2026-08-23-1621-2` Phase 1; skeleton was
 * M2-WI6).
 *
 * Mounted by `../cordis.patch.yml` inside an entry-local isolate realm
 * (`isolate: { missionControl: true }`, anchored-standard preset
 * precedent). Host boot resolves this package through two-anchor resolution
 * (dsh installation → profile directory), exactly like the
 * dsh-better-sidebar bundle precedent.
 *
 * In-code ownership ledger (kept narrow on WI10 landing, per plan
 * §Deferred But Adjudicated — the draft-stage "routes — M2-WI10" scope was
 * split: run/status/list landed here, draft/analyze follow their job
 * semantics into M3 with the WI12 skills wiring, where they are a
 * completion precondition):
 *   - `mdcontrol.run` / `mdcontrol.status` / `mdcontrol.list` — LANDED (M2-WI10):
 *     async job contract ({ runId, status: 'started' } detached in-host task,
 *     run-state passthrough reads, run enumeration) + plugin-level
 *     active-run guard (single run per projectRoot; 1447-1 adjudication
 *     collected) + opt-in terminal receipt (sixth host call `agents.get`,
 *     host-source verified — see mdcontrol-routes.ts header).
 *   - `mdcontrol.draft` / `mdcontrol.analyze` — M3 (WI12 completion
 *     precondition; plan §Deferred But Adjudicated).
 *   - skills registration (mission-control-run/draft/analyze) — M3-WI12.
 *
 * Exposure surface (plan Phase 1 Decision 1, better-sidebar precedent):
 * the wire-method record lives in `./mdcontrol-routes.ts`; this service
 * (a) publishes it as the cordis service `mdcontrol` (Service subclass —
 * same registration form as the host's own AgentRegistry) and (b) registers
 * the plugin's own HTTP dispatcher at `/mdcontrol/api/<method>` through
 * `ctx.get('webServer')` when the host provides one (headless compositions
 * degrade to a mount-log line, never a mount failure).
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import {
  ActiveRunGuard,
  createMdControlRoutes,
  registerMdControlHttpDispatcher,
  type MdControlRoutes,
} from './mdcontrol-routes.ts'

/** Plugin config row from cordis.patch.yml (`assetsDir: ./assets` today). */
export interface MissionControlConfig {
  /** Root of the bundled engine copy (flows/ prompts/ agents/ src/). */
  assetsDir?: string
}

/** The published `mdcontrol` cordis service face. */
export class MdControlService extends Service {
  readonly routes: MdControlRoutes
  readonly guard: ActiveRunGuard

  constructor(ctx: Context, routes: MdControlRoutes, guard: ActiveRunGuard) {
    super(ctx, 'mdcontrol')
    this.routes = routes
    this.guard = guard
  }
}

/** Named logger for the mounted service instance. */
const LOGGER_NAME = 'mdcontrol'

/**
 * Cordis plugin entry. Mount log (structural proof the bundle patch mounted
 * the service inside its isolate realm, WI6 convention) + route wiring:
 * record construction → service publication → optional HTTP dispatcher.
 */
export function apply(ctx: Context, config: MissionControlConfig = {}): void {
  const logger = {
    info: (message: string, fields?: Record<string, unknown>) => ctx.logger(LOGGER_NAME).info(message, fields ?? {}),
    warn: (message: string, fields?: Record<string, unknown>) => ctx.logger(LOGGER_NAME).warn(message, fields ?? {}),
  }
  const { guard, ...routes } = createMdControlRoutes({ ctx, logger })

  new MdControlService(ctx, routes, guard)

  const disposeHttp = registerMdControlHttpDispatcher(ctx, routes, logger)
  // better-sidebar form: the effect's return value IS the route disposer.
  if (disposeHttp) ctx.effect(() => disposeHttp, 'mdcontrol: /mdcontrol/api routes')

  ctx.logger(LOGGER_NAME).info('mission-control mounted', {
    scope: 'mdcontrol',
    phase: 'M2-WI10',
    assetsDir: config.assetsDir ?? './assets',
    routes: 'run/status/list (M2-WI10); draft/analyze → M3 (WI12 precondition)',
    httpDispatcher: disposeHttp ? '/mdcontrol/api' : 'absent (webServer not provided)',
    guard: 'single-run-per-projectRoot (1447-1 adjudication)',
  })
}

export default apply
