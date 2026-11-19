/**
 * retry-policy.ts — pure retry decision over a classified upstream error
 * (multi-plugin-dsh M4-WI11; design owner
 * docs/design/multi-plugin-dsh-architecture.md §nop-route Plugin).
 *
 * Decision rules (pinned by test/retry-policy.test.mjs):
 *   - The error is classified via classify(); only the three transient
 *     classes (network / rate-limit / timeout) are retryable — permanent
 *     classes, partial:marker, and unknown short-circuit to give-up even
 *     when a retry-after hint is present.
 *   - maxRetries boundary: `attempt` is the 0-based index of the failed
 *     attempt; a retry is granted only while attempt < maxRetries
 *     (maxRetries = 0 → every failure gives up immediately).
 *   - Delay: a numeric retry-after hint (seconds — `retryAfter` field or a
 *     `headers` row; HTTP-date form is out of the deterministic contract)
 *     takes precedence over the backoff curve and is NOT clamped by
 *     maxDelayMs (server instruction wins). Without a hint:
 *     delayMs = min(baseDelayMs * backoffFactor^attempt, maxDelayMs)
 *     with defaults base 1000ms / factor 2 / cap 30000ms.
 *   - retryAtMs = now + delayMs; time enters ONLY through the `now`
 *     parameter (default 0, never the wall clock — fake clocks live on the
 *     test side).
 *
 * Determinism contract: zero wall clock, zero random, zero I/O; same input
 * yields bit-identical output.
 */
import { classify } from "./error-classifier.ts";
import type { ErrorClass } from "./error-classifier.ts";

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export interface RetryAction {
  action: "retry" | "give-up";
  reason: "retryable" | "non-retryable" | "max-retries";
  errorClass: ErrorClass;
  attempt: number;
  nextAttempt: number | null;
  delayMs: number;
  retryAtMs: number;
  source: "retry-after" | "backoff" | "none";
}

const RETRYABLE_CLASSES: readonly ErrorClass[] = [
  "transient:network",
  "transient:rate-limit",
  "transient:timeout",
];

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;
const DEFAULT_BACKOFF_FACTOR = 2;

const retryAfterMsFrom = (error: unknown): number | null => {
  if (!(error instanceof Object)) return null;
  const record = error as Record<string, unknown>;
  const raw =
    typeof record.retryAfter === "number" || typeof record.retryAfter === "string"
      ? record.retryAfter
      : retryAfterHeader(record.headers);
  const seconds = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds * 1000);
};

const retryAfterHeader = (headers: unknown): string | number | undefined => {
  if (headers === null || headers === undefined) return undefined;
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get: (key: string) => unknown }).get("retry-after") as
      | string
      | number
      | undefined;
  }
  if (headers instanceof Object && !Array.isArray(headers)) {
    const entry = Object.entries(headers as Record<string, unknown>).find(
      ([key]) => key.toLowerCase() === "retry-after",
    );
    return entry?.[1] as string | number | undefined;
  }
  return undefined;
};

export function retryDecision(
  error: unknown,
  attempt: number,
  config: RetryConfig,
  now = 0,
): RetryAction {
  const errorClass = classify(error);
  const retryable = RETRYABLE_CLASSES.includes(errorClass);

  if (!retryable) {
    return {
      action: "give-up",
      reason: "non-retryable",
      errorClass,
      attempt,
      nextAttempt: null,
      delayMs: 0,
      retryAtMs: now,
      source: "none",
    };
  }

  if (attempt >= config.maxRetries) {
    return {
      action: "give-up",
      reason: "max-retries",
      errorClass,
      attempt,
      nextAttempt: null,
      delayMs: 0,
      retryAtMs: now,
      source: "none",
    };
  }

  const retryAfterMs = retryAfterMsFrom(error);
  if (retryAfterMs !== null) {
    return {
      action: "retry",
      reason: "retryable",
      errorClass,
      attempt,
      nextAttempt: attempt + 1,
      delayMs: retryAfterMs,
      retryAtMs: now + retryAfterMs,
      source: "retry-after",
    };
  }

  const base = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const factor = config.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
  const cap = config.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const curveRaw = base * Math.pow(factor, attempt);
  const delayMs = Math.round(Math.min(curveRaw, cap));
  return {
    action: "retry",
    reason: "retryable",
    errorClass,
    attempt,
    nextAttempt: attempt + 1,
    delayMs,
    retryAtMs: now + delayMs,
    source: "backoff",
  };
}
