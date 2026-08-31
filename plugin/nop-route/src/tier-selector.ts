/**
 * tier-selector.ts — layered model selection with escalation policy
 * (multi-plugin-dsh M5-WI3; design owner
 * docs/design/dsh-routing-with-failover.md §5).
 *
 * Selection policy:
 *   - Start from `defaultTier`. Within the tier, pick the first model whose
 *     circuit-breaker reports available (closed or half-open).
 *   - If every model in the current tier is unavailable, compute the
 *     earliest recovery time across the tier.
 *       - If the earliest recovery is within `escalationThresholdMs` of
 *         `now`, return `{ decision: "wait", untilMs: earliestUntil }`
 *         (don't escalate — wait for the cheaper tier to recover).
 *       - Otherwise, if a higher tier exists, switch to it and try again.
 *   - When every tier is unavailable, return `{ decision: "wait-check",
 *     retryAtMs }` where retryAtMs = now + waitCheckIntervalMs.
 *
 * Determinism contract: zero wall clock, zero random, zero I/O; same input
 * yields bit-identical output. Time enters only through the `now` parameter.
 */

import type { CircuitBreaker } from "./circuit-breaker.ts";

export interface TierSpec {
  readonly name: string;
  readonly candidates: readonly string[];
  /** When non-null, escalate if the earliest recovery exceeds this many ms past `now`. */
  readonly escalationThresholdMs: number | null;
}

export interface TierSelectorConfig {
  readonly tiers: readonly TierSpec[];
  readonly defaultTier: string;
  readonly waitCheckIntervalMs: number;
}

export type TierDecision =
  | { decision: "pick"; model: string; tier: string }
  | { decision: "wait"; untilMs: number; tier: string }
  | { decision: "wait-check"; retryAtMs: number };

export interface TierSelector {
  select(now: number): TierDecision;
  currentTier(): string;
}

const DEFAULT_WAIT_CHECK_INTERVAL_MS = 300_000;

export function createTierSelector(
  config: TierSelectorConfig,
  breaker: CircuitBreaker,
): TierSelector {
  const tierByName = new Map<string, TierSpec>();
  for (const t of config.tiers) {
    tierByName.set(t.name, t);
  }

  const initial = tierByName.get(config.defaultTier);
  if (initial === undefined) {
    throw new Error(`tier-selector: defaultTier "${config.defaultTier}" not in tiers`);
  }
  let tierIdx = config.tiers.findIndex((t) => t.name === config.defaultTier);
  if (tierIdx < 0) tierIdx = 0;

  const waitCheckIntervalMs =
    typeof config.waitCheckIntervalMs === "number" && config.waitCheckIntervalMs >= 0
      ? config.waitCheckIntervalMs
      : DEFAULT_WAIT_CHECK_INTERVAL_MS;

  const tryTier = (idx: number, now: number): { model?: string; earliestUntil?: number } => {
    const tier = config.tiers[idx];
    if (tier === undefined) return {};
    let earliestUntil: number | undefined;
    for (const model of tier.candidates) {
      if (breaker.isAvailable(model, now)) {
        return { model, earliestUntil };
      }
      const s = breaker.getState(model, now);
      if (s.state === "open" || s.state === "half-open") {
        if (earliestUntil === undefined || s.until < earliestUntil) {
          earliestUntil = s.until;
        }
      }
    }
    return earliestUntil === undefined ? {} : { earliestUntil };
  };

  const escalate = (idx: number): boolean => idx + 1 < config.tiers.length;

  return {
    select(now) {
      let idx = tierIdx;
      while (true) {
        const result = tryTier(idx, now);
        if (result.model !== undefined) {
          const tier = config.tiers[idx]!;
          return { decision: "pick", model: result.model, tier: tier.name };
        }
        if (result.earliestUntil === undefined) {
          break;
        }
        const tier = config.tiers[idx]!;
        const threshold = tier.escalationThresholdMs;
        const isLastTier = !escalate(idx);
        const waitTime = result.earliestUntil - now;

        if (isLastTier) {
          break;
        }

        const exceedsThreshold =
          threshold !== null && waitTime > threshold;

        if (!exceedsThreshold) {
          return { decision: "wait", untilMs: result.earliestUntil, tier: tier.name };
        }
        idx += 1;
      }
      return { decision: "wait-check", retryAtMs: now + waitCheckIntervalMs };
    },

    currentTier() {
      return config.tiers[tierIdx]?.name ?? config.defaultTier;
    },
  };
}