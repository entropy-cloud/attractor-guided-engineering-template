/**
 * circuit-breaker.ts — per-model three-state circuit breaker with
 * exponential-backoff cooldown (multi-plugin-dsh M5-WI2; design owner
 * docs/design/dsh-routing-with-failover.md §6 Circuit Breaker).
 *
 * State machine (design §6.1):
 *   closed → open: on recordFailure
 *   open → half-open: when `until <= now`
 *   half-open → closed: on recordSuccess
 *   half-open → open: on recordFailure (cooldown recomputed from scratch)
 *
 * Cooldown (design §6.2): `min(base × 2^(consecutiveFailures-1), max)`
 *   - transient:{rate-limit,network,timeout} → base=60s max=1800s
 *   - permanent:auth                       → base=1800s max=1800s (fixed)
 *   - permanent:budget                     → base=18000s max=18000s (fixed)
 *   - permanent:invalid-input / partial:marker → not tracked (no circuit entry)
 *
 * Determinism contract: zero wall clock, zero random, zero I/O; same input
 * yields bit-identical output. Time enters only through the `now` parameter.
 */

import type { ErrorClass } from "./error-classifier.ts";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitStateRecord {
  readonly state: CircuitState;
  readonly until: number;
  readonly consecutiveFailures: number;
  readonly cooldownMs: number;
  readonly lastErrorClass: ErrorClass | null;
  readonly lastErrorAt: number;
}

export interface CircuitBreakerConfig {
  readonly shortCooldownMs: number;
  readonly authCooldownMs: number;
  readonly quotaCooldownMs: number;
  readonly maxShortCooldownMs: number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  shortCooldownMs: 60_000,
  authCooldownMs: 1_800_000,
  quotaCooldownMs: 18_000_000,
  maxShortCooldownMs: 1_800_000,
};

interface CooldownClassSpec {
  readonly base: number;
  readonly max: number;
}

const COOLDOWN_BY_CLASS: Readonly<Record<ErrorClass, CooldownClassSpec | null>> = {
  "transient:rate-limit": { base: 0, max: 0 }, // overridden by config below
  "transient:network": { base: 0, max: 0 },
  "transient:timeout": { base: 0, max: 0 },
  "permanent:auth": { base: 0, max: 0 },
  "permanent:invalid-input": null,
  "permanent:budget": { base: 0, max: 0 },
  "partial:marker": null,
  unknown: { base: 0, max: 0 },
};

interface ModelState {
  state: CircuitState;
  until: number;
  consecutiveFailures: number;
  cooldownMs: number;
  lastErrorClass: ErrorClass | null;
  lastErrorAt: number;
}

const HEALTHY: ModelState = {
  state: "closed",
  until: 0,
  consecutiveFailures: 0,
  cooldownMs: 0,
  lastErrorClass: null,
  lastErrorAt: 0,
};

export interface CircuitBreaker {
  recordFailure(model: string, errorClass: ErrorClass, now: number): void;
  recordSuccess(model: string): void;
  isAvailable(model: string, now: number): boolean;
  getState(model: string, now: number): CircuitStateRecord;
  getAllStates(now: number): Record<string, CircuitStateRecord>;
  exportState(now: number): Record<string, ModelState>;
  importState(state: Record<string, ModelState>): void;
}

const computeCooldownMs = (
  errorClass: ErrorClass,
  consecutiveFailures: number,
  config: CircuitBreakerConfig,
): number => {
  const spec = COOLDOWN_BY_CLASS[errorClass];
  if (spec === null) return 0;

  let base: number;
  let max: number;
  if (errorClass === "permanent:auth") {
    base = config.authCooldownMs;
    max = config.authCooldownMs;
  } else if (errorClass === "permanent:budget") {
    base = config.quotaCooldownMs;
    max = config.quotaCooldownMs;
  } else {
    base = config.shortCooldownMs;
    max = config.maxShortCooldownMs;
  }

  const n = Math.max(1, consecutiveFailures);
  const raw = base * Math.pow(2, n - 1);
  return Math.min(Math.round(raw), max);
};

export function createCircuitBreaker(
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG,
): CircuitBreaker {
  const states = new Map<string, ModelState>();

  const getOrInit = (model: string): ModelState => {
    const existing = states.get(model);
    if (existing !== undefined) return existing;
    const fresh: ModelState = {
      state: HEALTHY.state,
      until: HEALTHY.until,
      consecutiveFailures: HEALTHY.consecutiveFailures,
      cooldownMs: HEALTHY.cooldownMs,
      lastErrorClass: HEALTHY.lastErrorClass,
      lastErrorAt: HEALTHY.lastErrorAt,
    };
    states.set(model, fresh);
    return fresh;
  };

  const refreshState = (model: string, now: number): ModelState => {
    const s = getOrInit(model);
    if (s.state === "open" && s.until <= now) {
      s.state = "half-open";
    }
    return s;
  };

  return {
    recordFailure(model, errorClass, now) {
      const spec = COOLDOWN_BY_CLASS[errorClass];
      if (spec === null) {
        const s = getOrInit(model);
        s.lastErrorClass = errorClass;
        s.lastErrorAt = now;
        return;
      }
      const s = getOrInit(model);
      s.consecutiveFailures += 1;
      const cooldown = computeCooldownMs(errorClass, s.consecutiveFailures, config);
      s.cooldownMs = cooldown;
      s.until = now + cooldown;
      s.state = "open";
      s.lastErrorClass = errorClass;
      s.lastErrorAt = now;
    },

    recordSuccess(model) {
      const s = states.get(model);
      if (s === undefined) return;
      s.state = "closed";
      s.until = 0;
      s.consecutiveFailures = 0;
      s.cooldownMs = 0;
      s.lastErrorClass = null;
      s.lastErrorAt = 0;
    },

    isAvailable(model, now) {
      const s = refreshState(model, now);
      return s.state === "closed" || s.state === "half-open";
    },

    getState(model, now) {
      const s = refreshState(model, now);
      return {
        state: s.state,
        until: s.until,
        consecutiveFailures: s.consecutiveFailures,
        cooldownMs: s.cooldownMs,
        lastErrorClass: s.lastErrorClass,
        lastErrorAt: s.lastErrorAt,
      };
    },

    getAllStates(now) {
      const out: Record<string, CircuitStateRecord> = {};
      for (const [model] of states) {
        out[model] = this.getState(model, now);
      }
      return out;
    },

    exportState(_now) {
      const out: Record<string, ModelState> = {};
      for (const [model, s] of states) {
        out[model] = {
          state: s.state,
          until: s.until,
          consecutiveFailures: s.consecutiveFailures,
          cooldownMs: s.cooldownMs,
          lastErrorClass: s.lastErrorClass,
          lastErrorAt: s.lastErrorAt,
        };
      }
      return out;
    },

    importState(state) {
      states.clear();
      for (const [model, s] of Object.entries(state)) {
        states.set(model, {
          state: s.state,
          until: s.until,
          consecutiveFailures: s.consecutiveFailures,
          cooldownMs: s.cooldownMs,
          lastErrorClass: s.lastErrorClass,
          lastErrorAt: s.lastErrorAt,
        });
      }
    },
  };
}