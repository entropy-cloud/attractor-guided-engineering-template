/**
 * noproute-routes.ts — noproute wire routes + HTTP dispatcher
 * (multi-plugin-dsh M4-WI14; design owner
 * docs/design/multi-plugin-dsh-architecture.md §nop-route Plugin routing
 * table; exposure shape = mdcontrol-routes precedent: a wire-method
 * FULL-NAME record, served by the plugin's own dispatcher).
 *
 * ── Sync contract (design §nop-route table) ────────────────────────────────
 *   - `noproute.route`         — single call result → RoutingDecision (+ the
 *                                next model when applicable).
 *   - `noproute.classify`      — error → ErrorClass (pure classify-only).
 *   - `noproute.pick-model`    — request descriptor → ModelSelection (pure).
 *   - `noproute.health`        — version + configured fallback chain + the
 *                                error histogram since last reset.
 *   - `noproute.circuit-state` — full per-model circuit-breaker snapshot
 *                                (account-level) + per-project / global stats
 *                                snapshot, + paused flag, + error histogram.
 *                                Pure read; intended for monitor dashboard
 *                                5s REST polling.
 *   - `noproute.project-stats` — per-project call-stats listing across all
 *                                tracked projects. Optional `projectRoot`
 *                                payload narrows to a single project.
 *   - `noproute.pause`         — set the in-memory pause flag; every
 *                                `noproute.route` call returns
 *                                `{ decision: "paused" }` while set.
 *   - `noproute.resume`        — clear the pause flag.
 *
 * ── State ownership boundary ───────────────────────────────────────────────
 * The pure decision modules stay stateless; the following mutable faces are
 * owned by the service layer and INJECTED here via the options record:
 *   - histogram (errors-class counter, M4-WI15 precedent)
 *   - circuitBreaker (account-level circuit state)
 *   - projectStats (per-project call statistics, see §11.3 D16)
 *   - paused flag (per-mission, in-memory only — design owner §10)
 *
 * ── Wire errors (mdcontrol MdControlError pattern) ─────────────────────────
 * Parameter validation failures throw NopRouteError with a machine-readable
 * code; the HTTP dispatcher maps them to the structured
 * `{ ok: false, error: { code, message } }` envelope.
 *
 * ── HTTP dispatcher (better-sidebar `/sidebar/api` + mdcontrol
 * `/mdcontrol/api` precedents) ──────────────────────────────────────────────
 * `registerNopRouteHttpDispatcher(ctx, routes, logger?)` registers
 * `POST /noproute/api/<wire method full name>` through `ctx.get('webServer')`
 * when the host provides one; an absent webServer is a degrade LOG line,
 * never a mount failure (headless compositions keep the cordis service
 * publication as the consumption face).
 */
import { classify } from "./error-classifier.ts";
import type { ErrorClass } from "./error-classifier.ts";
import { decide } from "./routing-core.ts";
import type { RoutingDecision } from "./routing-core.ts";
import { buildBaseChain, pickModel } from "./model-selector.ts";
import type {
  ModelHistoryEntry,
  ModelSelection,
  ReasoningEffort,
} from "./model-selector.ts";
import type { CircuitBreaker, CircuitStateRecord } from "./circuit-breaker.ts";
import type { ProjectAggregate as ProjectStats, ProjectStatsMap } from "./project-stats.ts";

// ── Wire errors ──────────────────────────────────────────────────────────────

export type NopRouteErrorCode = "bad-request" | "not-found" | "internal";

/** One route failure with its machine-readable wire code. */
export class NopRouteError extends Error {
  readonly code: NopRouteErrorCode;

  constructor(code: NopRouteErrorCode, message: string) {
    super(message);
    this.name = "NopRouteError";
    this.code = code;
  }
}

// ── Error histogram (service-owned state, injected) ──────────────────────────

/** Mutable error-class counter face owned by the service layer (WI15). */
export interface ErrorHistogram {
  record(errorClass: ErrorClass): void;
  snapshot(): Record<string, number>;
  /** Reset and return the pre-reset snapshot. */
  reset(): Record<string, number>;
}

export function createErrorHistogram(): ErrorHistogram {
  const counts = new Map<string, number>();
  const snapshot = (): Record<string, number> =>
    Object.fromEntries([...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return {
    record(errorClass) {
      counts.set(errorClass, (counts.get(errorClass) ?? 0) + 1);
    },
    snapshot,
    reset() {
      const before = snapshot();
      counts.clear();
      return before;
    },
  };
}

// ── Payload / result shapes (wire method full names pinned by the design) ────

export interface NopRouteRoutePayload {
  error: unknown;
  model?: string;
  attempt?: number;
  history?: ModelHistoryEntry[];
  reasoningEffort?: ReasoningEffort;
  expectedTokens?: number;
}

export interface NopRouteClassifyPayload {
  error: unknown;
}

export interface NopRoutePickModelPayload {
  preferredModel?: string;
  reasoningEffort?: ReasoningEffort;
  expectedTokens?: number;
  history?: ModelHistoryEntry[];
}

export interface NopRouteHealth {
  version: string;
  defaultModel: string;
  fallbackChain: string[];
  maxRetries: number;
  errorHistogram: Record<string, number>;
}

export interface NopRouteCircuitStateModel {
  state: "closed" | "open" | "half-open";
  until: number;
  remainingMs: number;
  consecutiveFailures: number;
  cooldownMs: number;
  lastErrorClass: ErrorClass | null;
  lastErrorAt: number;
}

export interface NopRouteCircuitState {
  version: string;
  defaultModel: string;
  paused: boolean;
  models: Record<string, NopRouteCircuitStateModel>;
  projectStats: Record<string, ProjectStats>;
  globalStats: ProjectStats;
  errorHistogram: Record<string, number>;
}

export interface NopRouteProjectStatsResult {
  projects: Record<string, ProjectStats>;
}

export interface NopRoutePauseResult {
  paused: boolean;
}

export interface NopRouteResumeResult {
  paused: boolean;
}

/** The wire-method record — all sync (design §nop-route contract). */
export interface NopRouteRoutes {
  "noproute.route"(payload: unknown): RoutingDecision | { decision: "paused" };
  "noproute.classify"(payload: unknown): { errorClass: ErrorClass };
  "noproute.pick-model"(payload: unknown): ModelSelection;
  "noproute.health"(payload?: unknown): NopRouteHealth;
  "noproute.circuit-state"(payload?: unknown): NopRouteCircuitState;
  "noproute.project-stats"(payload: unknown): NopRouteProjectStatsResult;
  "noproute.pause"(payload?: unknown): NopRoutePauseResult;
  "noproute.resume"(payload?: unknown): NopRouteResumeResult;
}

export interface NopRouteLogger {
  info?(message: string, fields?: Record<string, unknown>): void;
  warn?(message: string, fields?: Record<string, unknown>): void;
}

/** Bundle config row (cordis.patch.yml service-row config face). */
export interface NopRouteServiceConfig {
  defaultModel?: string;
  maxRetries?: number;
  fallbackModels?: string[];
}

const SERVICE_VERSION = "0.1.0";
const DEFAULT_MAX_RETRIES = 3;

// ── Payload validation helpers (mdcontrol requireString precedent) ──────────

function requireKey(payload: unknown, key: string): unknown {
  const value = (payload as Record<string, unknown> | null | undefined)?.[key];
  if (value === undefined) {
    throw new NopRouteError("bad-request", `missing "${key}"`);
  }
  return value;
}

function optionalModelString(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "") {
    throw new NopRouteError("bad-request", `"${key}", when set, must be a non-empty string`);
  }
  return value;
}

function optionalAttempt(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new NopRouteError("bad-request", '"attempt", when set, must be a non-negative integer');
  }
  return value;
}

function optionalHistory(value: unknown): ModelHistoryEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new NopRouteError("bad-request", '"history", when set, must be an array');
  }
  return value.map((entry, index) => {
    if (
      entry === null || typeof entry !== "object" ||
      typeof (entry as Record<string, unknown>).model !== "string" || (entry as Record<string, unknown>).model === "" ||
      ((entry as Record<string, unknown>).outcome !== "success" && (entry as Record<string, unknown>).outcome !== "failure")
    ) {
      throw new NopRouteError(
        "bad-request",
        `"history[${index}]" must be { model: non-empty string, outcome: "success" | "failure" }`,
      );
    }
    return entry as ModelHistoryEntry;
  });
}

function optionalReasoningEffort(value: unknown): ReasoningEffort | undefined {
  if (value === undefined) return undefined;
  if (value !== "low" && value !== "medium" && value !== "high") {
    throw new NopRouteError("bad-request", '"reasoningEffort", when set, must be "low" | "medium" | "high"');
  }
  return value;
}

function optionalExpectedTokens(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new NopRouteError("bad-request", '"expectedTokens", when set, must be a positive number');
  }
  return value;
}

// ── Route record factory ─────────────────────────────────────────────────────

export interface CreateNopRouteRoutesOptions {
  config?: NopRouteServiceConfig;
  /** Service-owned histogram state; a fresh one is created when omitted. */
  histogram?: ErrorHistogram;
  /**
   * Account-level circuit breaker (M5-WI3 / design §6). Optional — when
   * provided, `noproute.route` records failures/successes against it and
   * `noproute.circuit-state` exposes its snapshot. When omitted, the
   * circuit-breaker features are no-ops (still type-safe).
   */
  circuitBreaker?: CircuitBreaker;
  /**
   * Project-level stats (M5-WI3 / design §11.3 D16). Optional — when
   * provided, `noproute.route` records calls and `noproute.circuit-state`
   * / `noproute.project-stats` expose the snapshot. Per-mission by default
   * (no persistence wiring here — the service layer wires persistence).
   */
  projectStats?: ProjectStatsMap;
  logger?: NopRouteLogger;
}

/** Per-mission in-memory stats holder; mutated by `recordCall`. */
export interface MissionCallStats {
  record(projectRoot: string, model: string, durationMs: number, tokensInput: number, tokensOutput: number, errorClass: ErrorClass | null, now: number): void;
  snapshot(): ProjectStatsMap;
  reset(): void;
}

const ensureProjectEntry = (map: ProjectStatsMap, key: string, now: number): ProjectStats => {
  let entry = map[key];
  if (entry === undefined) {
    entry = {
      firstSeenAt: now,
      totalCalls: 0,
      totalSuccess: 0,
      totalFailures: 0,
      totalDurationMs: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      byModel: {},
    };
    map[key] = entry;
  }
  return entry;
};

const ensureModelEntry = (project: ProjectStats, model: string, now: number) => {
  let entry = project.byModel[model];
  if (entry === undefined) {
    entry = {
      calls: 0,
      success: 0,
      failures: 0,
      durationMs: 0,
      tokensInput: 0,
      tokensOutput: 0,
      firstCallAt: now,
      lastCallAt: now,
      lastErrorClass: null,
    };
    project.byModel[model] = entry;
  }
  return entry;
};

export function createMissionCallStats(): MissionCallStats {
  const map: ProjectStatsMap = {};
  return {
    record(projectRoot, model, durationMs, tokensInput, tokensOutput, errorClass, now) {
      const key = typeof projectRoot === "string" && projectRoot.length > 0 ? projectRoot : "__global__";
      const project = ensureProjectEntry(map, key, now);
      const m = ensureModelEntry(project, model, now);
      project.totalCalls += 1;
      project.totalDurationMs += durationMs;
      project.totalTokensInput += tokensInput;
      project.totalTokensOutput += tokensOutput;
      m.calls += 1;
      m.durationMs += durationMs;
      m.tokensInput += tokensInput;
      m.tokensOutput += tokensOutput;
      m.lastCallAt = now;
      if (errorClass === null) {
        project.totalSuccess += 1;
        m.success += 1;
      } else {
        project.totalFailures += 1;
        m.failures += 1;
        m.lastErrorClass = errorClass;
      }
    },
    snapshot() {
      return map;
    },
    reset() {
      for (const key of Object.keys(map)) {
        delete map[key];
      }
    },
  };
}

/**
 * Build the `noproute.*` wire-method record. Pure plugin-layer wiring over
 * the decision modules; mutable faces (histogram / circuitBreaker /
 * projectStats) are injected. Unit-testable with direct record calls —
 * zero host, zero I/O.
 */
export function createNopRouteRoutes({
  config = {},
  histogram = createErrorHistogram(),
  circuitBreaker,
  projectStats,
  logger,
}: CreateNopRouteRoutesOptions = {}): NopRouteRoutes {
  const defaultModel = config.defaultModel;
  if (typeof defaultModel !== "string" || defaultModel === "") {
    throw new Error("noproute config requires a non-empty defaultModel (bundle patch service-row config)");
  }
  const maxRetries =
    config.maxRetries === undefined
      ? DEFAULT_MAX_RETRIES
      : config.maxRetries;
  if (typeof maxRetries !== "number" || !Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error("noproute config maxRetries, when set, must be a non-negative integer");
  }
  const fallbackModels = Array.isArray(config.fallbackModels) ? config.fallbackModels : [];
  if (!fallbackModels.every((m) => typeof m === "string" && m.length > 0)) {
    throw new Error("noproute config fallbackModels, when set, must be an array of non-empty strings");
  }

  const fallbackChain = [defaultModel, ...fallbackModels].filter(
    (model, index, all) => all.indexOf(model) === index,
  );

  const baseChain = buildBaseChain({ defaultModel, fallbackModels });
  let paused = false;

  logger?.info?.("noproute routes created", {
    defaultModel,
    maxRetries,
    fallbackModels,
  });

  return {
    "noproute.route"(payload) {
      if (paused) {
        return { decision: "paused" };
      }
      const p = payload as NopRouteRoutePayload | null | undefined;
      const error = requireKey(payload, "error");
      const model = optionalModelString(p?.model, "model");
      const attempt = optionalAttempt(p?.attempt);
      const history = optionalHistory(p?.history);
      const reasoningEffort = optionalReasoningEffort(p?.reasoningEffort);
      const expectedTokens = optionalExpectedTokens(p?.expectedTokens);
      const decision = decide(
        { error, model, attempt, history, reasoningEffort, expectedTokens },
        { defaultModel, maxRetries, fallbackModels },
        0,
        baseChain,
      );
      histogram.record(decision.errorClass);
      return decision;
    },

    "noproute.classify"(payload) {
      const error = requireKey(payload, "error");
      const errorClass = classify(error);
      histogram.record(errorClass);
      return { errorClass };
    },

    "noproute.pick-model"(payload) {
      const p = payload as NopRoutePickModelPayload | null | undefined;
      const preferredModel = optionalModelString(p?.preferredModel, "preferredModel");
      const reasoningEffort = optionalReasoningEffort(p?.reasoningEffort);
      const expectedTokens = optionalExpectedTokens(p?.expectedTokens);
      const history = optionalHistory(p?.history);
      return pickModel(
        { preferredModel, reasoningEffort, expectedTokens },
        history,
        { defaultModel, fallbackModels },
        baseChain,
      );
    },

    "noproute.health"() {
      return {
        version: SERVICE_VERSION,
        defaultModel,
        fallbackChain,
        maxRetries,
        errorHistogram: histogram.snapshot(),
      };
    },

    "noproute.circuit-state"(payload) {
      const p = payload as { now?: number } | null | undefined;
      const now = typeof p?.now === "number" ? p.now : Date.now();
      const models: Record<string, NopRouteCircuitStateModel> = {};
      if (circuitBreaker !== undefined) {
        const all = circuitBreaker.getAllStates(now);
        for (const [model, s] of Object.entries(all)) {
          models[model] = enrichCircuitState(s, now);
        }
      }
      return {
        version: SERVICE_VERSION,
        defaultModel,
        paused,
        models,
        projectStats: projectStats ?? {},
        globalStats: projectStats?.["__global__"] ?? emptyStats(now),
        errorHistogram: histogram.snapshot(),
      };
    },

    "noproute.project-stats"(payload) {
      const p = payload as { projectRoot?: string } | null | undefined;
      const all = projectStats ?? {};
      if (typeof p?.projectRoot === "string" && p.projectRoot.length > 0) {
        const entry = all[p.projectRoot];
        return {
          projects: entry === undefined ? {} : { [p.projectRoot]: entry },
        };
      }
      return { projects: all };
    },

    "noproute.pause"() {
      paused = true;
      logger?.info?.("noproute paused", { defaultModel });
      return { paused: true };
    },

    "noproute.resume"() {
      paused = false;
      logger?.info?.("noproute resumed", { defaultModel });
      return { paused: false };
    },
  };
}

const emptyStats = (now: number): ProjectStats => ({
  firstSeenAt: now,
  totalCalls: 0,
  totalSuccess: 0,
  totalFailures: 0,
  totalDurationMs: 0,
  totalTokensInput: 0,
  totalTokensOutput: 0,
  byModel: {},
});

const enrichCircuitState = (s: CircuitStateRecord, now: number): NopRouteCircuitStateModel => ({
  state: s.state,
  until: s.until,
  remainingMs: Math.max(0, s.until - now),
  consecutiveFailures: s.consecutiveFailures,
  cooldownMs: s.cooldownMs,
  lastErrorClass: s.lastErrorClass,
  lastErrorAt: s.lastErrorAt,
});

// ── Service publication + HTTP dispatcher (service.ts consumes both) ─────────

/** Structural face of the host webServer this plugin uses (better-sidebar mirror). */
export interface NopRouteWebServer {
  register(route: {
    kind: "exact" | "prefix";
    path: string;
    handler: (req: { method?: string; url?: string } & AsyncIterable<Buffer | string>, res: {
      writeHead(status: number, headers?: Record<string, string>): void;
      end(body?: string): void;
    }) => void | Promise<void>;
  }): () => void;
}

const HTTP_PREFIX = "/noproute/api";

function writeJson(res: Parameters<Parameters<NopRouteWebServer["register"]>[0]["handler"]>[1], status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/**
 * Own HTTP API dispatcher (mdcontrol `/mdcontrol/api` precedent):
 * POST `<prefix>/<wire method full name>` with a JSON body →
 * `{ ok: true, value }` / `{ ok: false, error: { code, message } }`.
 * Registered only when the host provides `webServer` (resolved via
 * `ctx.get('webServer')` — a direct property read of an un-provided
 * service throws in cordis, `get` returns undefined); otherwise the routes
 * stay reachable through the cordis service publication (degradation is a
 * log line, never a mount failure).
 */
export function registerNopRouteHttpDispatcher(
  ctx: { get?(name: string): unknown },
  routes: NopRouteRoutes,
  logger?: NopRouteLogger,
): (() => void) | null {
  const webServer = (typeof ctx.get === "function" ? ctx.get("webServer") : undefined) as NopRouteWebServer | undefined;
  if (!webServer || typeof webServer.register !== "function") {
    logger?.info?.("noproute HTTP dispatcher not registered (webServer service absent)", { prefix: HTTP_PREFIX });
    return null;
  }
  return webServer.register({
    kind: "prefix",
    path: HTTP_PREFIX,
    handler: async (req, res) => {
      if (req.method !== "POST") {
        writeJson(res, 405, { ok: false, error: { code: "bad-request", message: "method not allowed (POST only)" } });
        return;
      }
      const pathname = new URL(req.url ?? "/", "http://noproute.internal").pathname;
      const method = pathname.startsWith(`${HTTP_PREFIX}/`) ? pathname.slice(HTTP_PREFIX.length + 1) : undefined;
      if (method === undefined || method.includes("/")) {
        writeJson(res, 404, { ok: false, error: { code: "not-found", message: "unknown noproute API method" } });
        return;
      }
      const handler = (routes as unknown as Record<string, ((payload: unknown) => unknown) | undefined>)[method];
      if (handler === undefined) {
        writeJson(res, 404, { ok: false, error: { code: "not-found", message: `unknown noproute API method "${method}"` } });
        return;
      }
      let payload: unknown = {};
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.from(chunk));
          if (chunks.reduce((n, c) => n + c.length, 0) > (1 << 20)) {
            throw new NopRouteError("bad-request", "request body too large");
          }
        }
        const text = Buffer.concat(chunks).toString("utf8");
        if (text.trim() !== "") payload = JSON.parse(text);
      } catch (err) {
        const code = err instanceof NopRouteError ? err.code : "bad-request";
        const message = err instanceof NopRouteError ? err.message : "request body is not valid JSON";
        writeJson(res, 400, { ok: false, error: { code, message } });
        return;
      }
      try {
        writeJson(res, 200, { ok: true, value: await handler(payload) });
      } catch (err) {
        if (err instanceof NopRouteError) {
          writeJson(res, 400, { ok: false, error: { code: err.code, message: err.message } });
          return;
        }
        writeJson(res, 500, { ok: false, error: { code: "internal", message: err instanceof Error ? err.message : String(err) } });
      }
    },
  });
}
