/**
 * service.ts — Mission Control cordis service, minimal mountable skeleton
 * (dsh-plugin M2-WI6 Phase 3).
 *
 * Scope: prove the patch → service mount chain's types and shape only.
 * Deliberately ABSENT (owned by later work items):
 *   - `mdcontrol.*` routes (run/draft/analyze/status/list) — M2-WI10
 *   - async job contract ({ runId, status: 'started' } detached start) — M2-WI10
 *   - skills registration (mission-control-run/draft/analyze) — M3-WI12
 *   - plugin-level active-run guard / single-run-per-root — M2-WI10
 *     (adjudicated in plan 2026-08-23-1447-1 §Deferred But Adjudicated)
 *
 * The service is mounted by `../cordis.patch.yml` inside an entry-local
 * isolate realm (`isolate: { missionControl: true }`, anchored-standard
 * preset precedent), so it never publishes into the process-global root
 * realm. Host boot resolves this package through two-anchor resolution
 * (dsh installation → profile directory), exactly like the
 * dsh-better-sidebar bundle precedent.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Plugin config row from cordis.patch.yml (`assetsDir: ./assets` today). */
export interface MissionControlConfig {
  /** Root of the bundled engine copy (flows/ prompts/ agents/ src/). */
  assetsDir?: string
}

/**
 * Route table placeholder — intentionally empty until M2-WI10 lands the
 * `mdcontrol.*` namespace (thin wrappers over engine orchestration, never
 * reimplementing engine logic).
 */
export interface MdControlRoutes {
  readonly [route: string]: never
}

/** Named logger for the mounted service instance. */
const LOGGER_NAME = 'mdcontrol'

/**
 * Cordis plugin entry — one structured mount log line is the whole skeleton
 * behavior: seeing this line in the host log is the structural proof that
 * the bundle patch mounted the service inside its isolate realm.
 */
export function apply(ctx: Context, config: MissionControlConfig = {}): void {
  ctx.logger(LOGGER_NAME).info('mission-control mounted (skeleton)', {
    scope: 'mdcontrol',
    phase: 'M2-WI6',
    assetsDir: config.assetsDir ?? './assets',
    routes: 'not-registered (M2-WI10)',
  })
}

export default apply
