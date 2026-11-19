/**
 * service.ts — noproute cordis service: `noproute.*` routes wired
 * (multi-plugin-dsh M4-WI15; design owner
 * docs/design/multi-plugin-dsh-architecture.md §nop-route Plugin; circuit
 * breaker / project stats / persistence wired at M5-WI3 per
 * docs/design/dsh-routing-with-failover.md §9–§11).
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
 * State ownership (M5-WI3):
 *   - histogram (M4-WI15 precedent): service-layer, route/classify
 *     accumulate, `noproute.health` reads, `resetHistogram()` on the
 *     service.
 *   - circuit-breaker (M5-WI3 / design §6): pure module holding
 *     account-level circuit state, persisted to
 *     `~/.nop/dsh/routing-state.json` at teardown (debounced flush on
 *     recordFailure / recordSuccess via schedulePersist in this module).
 *   - project stats (M5-WI3 / design §11.3 D16): in-memory per-mission
 *     counters, persisted to `~/.nop/dsh/routing-stats/<hash>.json`.
 *     In-memory copy is exposed via `noproute.circuit-state` /
 *     `noproute.project-stats`.
 *
 * Zero host calls: `ctx.inject(['agents'], …)` is NOT used — nop-route
 * dispatches no child agents (design §nop-route Six-call discipline: it
 * only exposes a decision service).
 */
import { Service, type Context } from "@deepseek-ai/cordis";
import {
  createErrorHistogram,
  createMissionCallStats,
  createNopRouteRoutes,
  registerNopRouteHttpDispatcher,
  type ErrorHistogram,
  type MissionCallStats,
  type NopRouteRoutes,
} from "./noproute-routes.ts";
import { createCircuitBreaker, type CircuitBreaker } from "./circuit-breaker.ts";
import { createCircuitPersistence, type CircuitPersistence } from "./state-persistence.ts";
import {
  createFsProjectStatsPersistence,
  type ProjectStatsMap,
  type ProjectStatsPersistence,
} from "./project-stats.ts";
import { defaultFsIo, type AtomicWriteIo } from "./atomic-write.ts";
import { resolveDshDir } from "./home.ts";

/** Plugin config row from cordis.patch.yml (routing triple). */
export interface NopRouteConfig {
  defaultModel?: string;
  maxRetries?: number;
  fallbackModels?: string[];
  /**
   * Override the nop home directory for state persistence (tests inject a
   * temp dir; production leaves it undefined and the platform default
   * `~/.nop/dsh/` is used).
   */
  nopHome?: string;
  /**
   * Override the atomic-write IO (tests inject an in-memory implementation;
   * production leaves it undefined and the default `node:fs` IO is used).
   */
  io?: AtomicWriteIo;
}

const FLUSH_DEBOUNCE_MS = 60_000;

/** The published `noproute` cordis service face. */
export class NopRouteService extends Service {
  readonly routes: NopRouteRoutes;
  readonly histogram: ErrorHistogram;
  readonly circuitBreaker: CircuitBreaker;
  readonly missionCallStats: MissionCallStats;

  constructor(
    ctx: Context,
    routes: NopRouteRoutes,
    histogram: ErrorHistogram,
    circuitBreaker: CircuitBreaker,
    missionCallStats: MissionCallStats,
  ) {
    super(ctx, "noproute");
    this.routes = routes;
    this.histogram = histogram;
    this.circuitBreaker = circuitBreaker;
    this.missionCallStats = missionCallStats;
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

  const io: AtomicWriteIo = config.io ?? defaultFsIo;
  const dshDir = config.nopHome !== undefined
    ? `${config.nopHome}/dsh`
    : resolveDshDir();

  // Account-level circuit-breaker (M5-WI3 / design §6).
  const circuitBreaker = createCircuitBreaker();
  const persistence: CircuitPersistence = createCircuitPersistence(dshDir, io);
  try {
    persistence.load(circuitBreaker);
  } catch (err) {
    logger.warn("circuit state load failed (graceful continue)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Per-project call stats (M5-WI3 / design §11.3 D16).
  const projectStatsPersistence: ProjectStatsPersistence = createFsProjectStatsPersistence(
    `${dshDir}/routing-stats`,
  );
  let projectStatsMap: ProjectStatsMap = projectStatsPersistence.loadAll();

  const histogram = createErrorHistogram();
  const missionCallStats = createMissionCallStats();
  const routes = createNopRouteRoutes({
    config,
    histogram,
    circuitBreaker,
    projectStats: projectStatsMap,
    logger,
  });
  const service = new NopRouteService(
    ctx,
    routes,
    histogram,
    circuitBreaker,
    missionCallStats,
  );

  // ── Persistence scheduling (debounce 60s; flush-on-teardown) ─────────────
  let persistTimer: NodeJS.Timeout | null = null;
  let persistDirty = false;

  const flushNow = () => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    try {
      persistence.flush(circuitBreaker);
      projectStatsMap = { ...missionCallStats.snapshot() };
      projectStatsPersistence.flush(projectStatsMap);
      persistDirty = false;
    } catch (err) {
      logger.warn("routing state flush failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const schedulePersist = () => {
    persistDirty = true;
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      if (persistDirty) flushNow();
    }, FLUSH_DEBOUNCE_MS);
  };

  // Wrap recordFailure / recordSuccess on the breaker to trigger flush.
  const originalRecordFailure = circuitBreaker.recordFailure;
  circuitBreaker.recordFailure = (model, errorClass, now) => {
    originalRecordFailure(model, errorClass, now);
    schedulePersist();
  };
  const originalRecordSuccess = circuitBreaker.recordSuccess;
  circuitBreaker.recordSuccess = (model) => {
    originalRecordSuccess(model);
    schedulePersist();
  };

  // Flush on cordis teardown (preserved for plan 1312-2 / M5-WI3 contract).
  ctx.effect(() => {
    return () => {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (persistDirty) {
        try {
          persistence.flush(circuitBreaker);
          projectStatsPersistence.flush(missionCallStats.snapshot());
          persistDirty = false;
        } catch (err) {
          logger.warn("teardown flush failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };
  }, "noproute: routing state persistence");

  ctx.inject(["webServer"], (webCtx: Context) => {
    const dispose = registerNopRouteHttpDispatcher(webCtx, routes, logger);
    if (dispose) webCtx.effect(() => dispose, "noproute: /noproute/api routes");
  });
  if (!(typeof ctx.get === "function" && ctx.get("webServer"))) {
    logger.info("noproute HTTP dispatcher not registered (webServer service absent — headless posture, cordis service stays published)");
  }

  ctx.logger(LOGGER_NAME).info("nop-route mounted", {
    scope: "noproute",
    package: "nop-route",
    realm: "nopRoute",
    service: "noproute",
    routes: "route/classify/pick-model/health/circuit-state/project-stats/pause/resume (sync, M5-WI3)",
    defaultModel: config.defaultModel,
    maxRetries: config.maxRetries ?? 3,
    fallbackModels: config.fallbackModels ?? [],
    histogram: "service-layer error histogram (route/classify accumulate, health reads, resetHistogram on the service)",
    circuitBreaker: "account-level three-state breaker, ~/.nop/dsh/routing-state.json (debounced 60s flush + teardown)",
    projectStats: "per-project call counters, ~/.nop/dsh/routing-stats/<hash>.json (per-mission in-memory + persistence)",
    paused: "per-mission in-memory flag (noproute.pause / noproute.resume)",
    httpDispatcher: "ctx.inject(['webServer']) → /noproute/api when provided",
  });
}

export default apply;