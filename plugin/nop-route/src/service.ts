/**
 * service.ts — noproute cordis service: `noproute.*` routes wired
 * (multi-plugin-dsh M4-WI15; design owner
 * docs/design/multi-plugin-dsh-architecture.md §nop-route Plugin).
 *
 * Mounted by `../cordis.patch.yml` inside an entry-local isolate realm
 * (`isolate: { nopRoute: true }`, better-sidebar + anchored-standard
 * preset precedents; nop-age two-anchor-resolution mount form).
 *
 * Exposure surface (mdcontrol service.ts precedent):
 *   - the wire-method record lives in `./noproute-routes.ts`; this module
 *     (a) publishes it as the cordis service `noproute` (name = bundle
 *     name minus the `nop-` prefix, camelCased — design §Naming
 *     Convention; Service subclass, same registration form as
 *     MdControlService) and (b) registers the plugin's own HTTP dispatcher
 *     at `/noproute/api/<method>` through `ctx.inject(['webServer'], …)`
 *     when the host provides one.
 *   - headless degradation: no webServer = a mount-log line, never a
 *     mount failure — the cordis service publication stays the
 *     consumption face for in-process callers.
 *
 * State ownership (plan 1312-2 Current Baseline ruling): the health error
 * histogram is service-layer state — route/classify call sites accumulate,
 * `noproute.health` reads it, reset semantics travel with this service
 * (`resetHistogram()` returns the pre-reset snapshot). The pure decision
 * modules (`routing-core.ts` and below) stay stateless.
 *
 * Zero host calls: `ctx.inject(['agents'], …)` is NOT used — nop-route
 * dispatches no child agents (design §nop-route Six-call discipline: it
 * only exposes a decision service).
 */
import { Service, type Context } from "@deepseek-ai/cordis";
import {
  createErrorHistogram,
  createNopRouteRoutes,
  registerNopRouteHttpDispatcher,
  type ErrorHistogram,
  type NopRouteRoutes,
} from "./noproute-routes.ts";

/** Plugin config row from cordis.patch.yml (routing triple). */
export interface NopRouteConfig {
  defaultModel?: string;
  maxRetries?: number;
  fallbackModels?: string[];
}

/** The published `noproute` cordis service face. */
export class NopRouteService extends Service {
  readonly routes: NopRouteRoutes;
  readonly histogram: ErrorHistogram;

  constructor(ctx: Context, routes: NopRouteRoutes, histogram: ErrorHistogram) {
    super(ctx, "noproute");
    this.routes = routes;
    this.histogram = histogram;
  }

  /** Reset the health error histogram; returns the pre-reset snapshot. */
  resetHistogram(): Record<string, number> {
    return this.histogram.reset();
  }
}

/** Named logger for the mounted service instance. */
const LOGGER_NAME = "noproute";

/**
 * Cordis plugin entry. Mount log (structural proof the bundle patch
 * mounted the service inside its isolate realm, WI9 convention) + route
 * wiring: record construction → service publication → optional HTTP
 * dispatcher (reactive inject — fires now or whenever webServer appears;
 * never blocks startup when absent).
 */
export function apply(ctx: Context, config: NopRouteConfig = {}): void {
  const logger = {
    info: (message: string, fields?: Record<string, unknown>) =>
      ctx.logger(LOGGER_NAME).info(message, fields ?? {}),
    warn: (message: string, fields?: Record<string, unknown>) =>
      ctx.logger(LOGGER_NAME).warn(message, fields ?? {}),
  };

  const histogram = createErrorHistogram();
  const routes = createNopRouteRoutes({ config, histogram, logger });
  const service = new NopRouteService(ctx, routes, histogram);

  ctx.inject(["webServer"], (webCtx: Context) => {
    const dispose = registerNopRouteHttpDispatcher(webCtx, routes, logger);
    if (dispose) webCtx.effect(() => dispose, "noproute: /noproute/api routes");
  });
  // Headless posture note (mount-log line, never a failure): the inject
  // above stays dormant until a webServer appears; compositions without
  // one keep the cordis service publication as the consumption face.
  if (!(typeof ctx.get === "function" && ctx.get("webServer"))) {
    logger.info("noproute HTTP dispatcher not registered (webServer service absent — headless posture, cordis service stays published)");
  }

  ctx.logger(LOGGER_NAME).info("nop-route mounted", {
    scope: "noproute",
    package: "nop-route",
    realm: "nopRoute",
    service: "noproute",
    routes: "route/classify/pick-model/health (sync, M4-WI14)",
    defaultModel: config.defaultModel,
    maxRetries: config.maxRetries ?? 3,
    fallbackModels: config.fallbackModels ?? [],
    histogram: "service-layer error histogram (route/classify accumulate, health reads, resetHistogram on the service)",
    httpDispatcher: "ctx.inject(['webServer']) → /noproute/api when provided",
  });
}

export default apply;
