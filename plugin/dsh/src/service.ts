/**
 * service.ts — Mission Control cordis service: `mdcontrol.*` routes wired
 * (dsh-plugin M2-WI10, plan `2026-08-23-1621-2`; skeleton was M2-WI6;
 * draft/analyze routes + skills registration landed M3-WI12, plan
 * `2026-08-23-1852-2`).
 *
 * Mounted by `../cordis.patch.yml` inside an entry-local isolate realm
 * (`isolate: { missionControl: true }`, anchored-standard preset
 * precedent). Host boot resolves this package through two-anchor resolution
 * (dsh installation → profile directory), exactly like the
 * dsh-better-sidebar bundle precedent.
 *
 * In-code ownership ledger (1621-2 §Deferred draft/analyze adjudication
 * collected by M3-WI12; skills row closed by the same plan):
 *   - `mdcontrol.run` / `mdcontrol.status` / `mdcontrol.list` — LANDED (M2-WI10):
 *     async job contract ({ runId, status: 'started' } detached in-host task,
 *     run-state passthrough reads, run enumeration) + plugin-level
 *     active-run guard (single run per projectRoot; 1447-1 adjudication
 *     collected) + opt-in terminal receipt (sixth host call `agents.get`,
 *     host-source verified — see mdcontrol-routes.ts header).
 *   - `mdcontrol.draft` / `mdcontrol.analyze` — LANDED (M3-WI12, plan
 *     `2026-08-23-1852-2`): draft = async job contract through the
 *     pre-authorized `cmdDraftMission` executor seam (draft-state.json
 *     vocabulary reused; shares the active-run guard root slot);
 *     analyze = synchronous single-turn postmortem through a plugin-owned
 *     thin runner adapter over runPostmortem (zero engine diff).
 *   - skills registration (mission-control-run/draft/analyze) — LANDED
 *     (M3-WI12): runtime rows on `ctx.skills` via reactive `ctx.inject`
 *     (see ./mdcontrol-skills.ts).
 *   - tools/pre-execute gates — the law gate is the solo listener since
 *     age-autonomy M2-WI22 (plan `docs/plans/age-autonomy/2026-08-25-0950-2`)
 *     retired the run-state plan-status reinforcement gate (M3-WI13): its
 *     protection semantics live in the law kernel rule `legacy-plan-freeze`,
 *     its run-state evidence faces (F1/F2/F3) are abolished — plan
 *     frontmatter/closures are the only completion evidence face (see
 *     ./law/host-adapter.ts).
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
import { registerMissionControlSkills, type SkillsRegistryFace } from './mdcontrol-skills.ts'
import { lawGateMountSummary, registerLawGate } from './law/host-adapter.ts'

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

  // Skills registration (M3-WI12, Phase 1 Decision 1): reactive inject —
  // the callback fires whenever the skills service is available (now or
  // later), unloads + re-runs when it changes, and simply never activates
  // in compositions without skills (the absent-webServer degrade posture;
  // never blocks this service's own startup).
  ctx.inject(['skills'], (skillsCtx: Context) => {
    const skills = (typeof skillsCtx.get === 'function' ? skillsCtx.get('skills') : undefined) as SkillsRegistryFace | undefined
    return registerMissionControlSkills(skills, logger)
  })

  // tools/pre-execute law gate (age-autonomy M2-WI12 plan 0815-1, extended
  // WI21/WI22): policy-driven evaluate via the bundled law kernel, recording
  // to the observation-log face. The solo pre-execute listener since WI22
  // retired the M3-WI13 plan-status gate (its protection semantics moved
  // into the kernel rule `legacy-plan-freeze`); auto-disposed with the
  // plugin context, the explicit effect parks the disposer for
  // dispose-on-unload parity with the HTTP routes.
  const disposeLawGate = registerLawGate(ctx, logger)
  ctx.effect(() => disposeLawGate, 'mdcontrol: tools/pre-execute law gate')

  ctx.logger(LOGGER_NAME).info('mission-control mounted', {
    scope: 'mdcontrol',
    phase: 'M3-WI13(retired WI22) + M2-WI12..WI22(law)',
    assetsDir: config.assetsDir ?? './assets',
    routes: 'run/status/list (M2-WI10) + draft/analyze (M3-WI12)',
    skills: 'mission-control-run/draft/analyze (M3-WI12)',
    lawGate: lawGateMountSummary(),
    httpDispatcher: disposeHttp ? '/mdcontrol/api' : 'absent (webServer not provided)',
    guard: 'single-engine-activity-per-projectRoot, run+draft shared slot (1447-1 + 1852-2 adjudications)',
  })
}

export default apply
