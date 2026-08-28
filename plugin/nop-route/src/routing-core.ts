/**
 * routing-core.ts — pure orchestration over the three decision modules
 * (multi-plugin-dsh M4-WI13; design owner
 * docs/design/multi-plugin-dsh-architecture.md §nop-route Plugin).
 *
 * Orchestration policy — synthesis and priority ONLY, no re-implementation
 * of discrimination (classify / retryDecision / pickModel each get called;
 * the class rules, retry budget math, and chain tainting stay in their
 * own modules):
 *   1. classify(error) → partial:marker short-circuits to Transform (the
 *      non-retryable-with-payload case: extract the unclosed
 *      `<AI_STEP_RESULT>` marker text into a structured transform object).
 *   2. retryDecision(error, attempt, config, now) → retry granted for the
 *      three transient classes while attempt < maxRetries:
 *        - pickModel over the prior history picks the same (untainted)
 *          model → Retry — re-issue the same call with the same model
 *          after the backoff/retry-after delay.
 *        - pickModel offers a DIFFERENT model (the failed model is
 *          tainted by an earlier failure) → Fallback — re-issue with the
 *          next untainted chain model.
 *   3. retry budget exhausted (retryable class, attempt ≥ maxRetries):
 *      a different chain model is still available → Fallback (delayMs 0 —
 *      the backoff budget belonged to the failed model); otherwise
 *      Give-up.
 *   4. permanent:* / unknown → Give-up — return the original error
 *      unchanged (the Transform/Give-up boundary for non-retryable
 *      errors: only partial:marker carries an extractable payload).
 *
 * Determinism contract: zero state, zero wall clock (time enters ONLY
 * through the `now` parameter, default 0), zero random, zero I/O; same
 * input yields bit-identical output (pinned by test/routing-core.test.mjs).
 */
import { classify } from "./error-classifier.ts";
import type { ErrorClass } from "./error-classifier.ts";
import { retryDecision } from "./retry-policy.ts";
import { pickModel } from "./model-selector.ts";
import type {
  ModelHistoryEntry,
  ModelSelectionConfig,
  ReasoningEffort,
} from "./model-selector.ts";

/** Combined routing config: retry budget face + model chain face. */
export interface RoutingConfig {
  defaultModel: string;
  maxRetries: number;
  fallbackModels?: string[];
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  baseTokenBudget?: number;
  maxTokenBudget?: number;
}

export interface RouteRequest {
  /** The upstream call's error/result to route (required key, any value). */
  error: unknown;
  /** Model used by the failed call (chain anchor; default = defaultModel). */
  model?: string;
  /** 0-based attempt index of the failed call. */
  attempt?: number;
  /** Model call history BEFORE the failed call (pickModel taint face). */
  history?: ModelHistoryEntry[];
  reasoningEffort?: ReasoningEffort;
  expectedTokens?: number;
}

/** The transformed error object for the partial-marker case (design §nop-route: Transform). */
export interface TransformErrorObject {
  code: "partial-marker";
  errorClass: "partial:marker";
  partial: true;
  /** Text after the unclosed `<AI_STEP_RESULT>` opening tag, when present. */
  extractedMarker: string | null;
  /** The carrying text field (verbatim), when present. */
  message: string;
}

export type RoutingDecision =
  | {
      decision: "retry";
      errorClass: ErrorClass;
      attempt: number;
      nextAttempt: number;
      model: string;
      delayMs: number;
      retryAtMs: number;
      source: "retry-after" | "backoff";
      historyExhausted: boolean;
    }
  | {
      decision: "fallback";
      errorClass: ErrorClass;
      attempt: number;
      fromModel: string;
      model: string;
      delayMs: number;
      retryAtMs: number;
      source: "retry-after" | "backoff" | "none";
      historyExhausted: boolean;
    }
  | {
      decision: "transform";
      errorClass: "partial:marker";
      transformed: TransformErrorObject;
    }
  | {
      decision: "give-up";
      errorClass: ErrorClass;
      reason: "non-retryable" | "max-retries";
      attempt: number;
    };

const PARTIAL_OPEN = "<AI_STEP_RESULT>";
const PARTIAL_CLOSE = "</AI_STEP_RESULT>";

const transformPartial = (error: unknown): TransformErrorObject => {
  let extractedMarker: string | null = null;
  let message = "partial output";
  if (error instanceof Object) {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "text", "raw", "rawResponse"]) {
      const value = record[key];
      if (
        typeof value === "string" &&
        value.includes(PARTIAL_OPEN) &&
        !value.includes(PARTIAL_CLOSE)
      ) {
        extractedMarker = value
          .slice(value.indexOf(PARTIAL_OPEN) + PARTIAL_OPEN.length)
          .trim();
        message = value;
        break;
      }
    }
  }
  return {
    code: "partial-marker",
    errorClass: "partial:marker",
    partial: true,
    extractedMarker,
    message,
  };
};

/**
 * Pure orchestration: one upstream call result → one RoutingDecision.
 * `history` is the call history BEFORE the failed call (a history that
 * already contained this failure would taint every model it mentions and
 * collapse Retry into Fallback).
 */
export function decide(
  request: RouteRequest,
  config: RoutingConfig,
  now = 0,
): RoutingDecision {
  const attempt =
    typeof request.attempt === "number" && Number.isInteger(request.attempt) && request.attempt >= 0
      ? request.attempt
      : 0;
  const history = Array.isArray(request.history) ? request.history : [];
  const failedModel =
    typeof request.model === "string" && request.model.length > 0
      ? request.model
      : config.defaultModel;

  const errorClass = classify(request.error);

  if (errorClass === "partial:marker") {
    return {
      decision: "transform",
      errorClass,
      transformed: transformPartial(request.error),
    };
  }

  const retry = retryDecision(
    request.error,
    attempt,
    {
      maxRetries: config.maxRetries,
      baseDelayMs: config.baseDelayMs,
      maxDelayMs: config.maxDelayMs,
      backoffFactor: config.backoffFactor,
    },
    now,
  );

  const selection = pickModel(
    {
      preferredModel: failedModel,
      reasoningEffort: request.reasoningEffort,
      expectedTokens: request.expectedTokens,
    },
    history,
    {
      defaultModel: config.defaultModel,
      fallbackModels: config.fallbackModels,
      baseTokenBudget: config.baseTokenBudget,
      maxTokenBudget: config.maxTokenBudget,
    } satisfies ModelSelectionConfig,
  );

  if (retry.action === "retry") {
    if (selection.model === failedModel) {
      return {
        decision: "retry",
        errorClass,
        attempt,
        nextAttempt: retry.nextAttempt ?? attempt + 1,
        model: selection.model,
        delayMs: retry.delayMs,
        retryAtMs: retry.retryAtMs,
        source: retry.source === "retry-after" ? "retry-after" : "backoff",
        historyExhausted: selection.historyExhausted,
      };
    }
    return {
      decision: "fallback",
      errorClass,
      attempt,
      fromModel: failedModel,
      model: selection.model,
      delayMs: retry.delayMs,
      retryAtMs: retry.retryAtMs,
      source: retry.source,
      historyExhausted: selection.historyExhausted,
    };
  }

  // Retry budget exhausted but a different chain model is available →
  // Fallback with no delay (the backoff budget belonged to the failed
  // model; the re-issue on the next model is immediate).
  if (retry.reason === "max-retries" && selection.model !== failedModel) {
    return {
      decision: "fallback",
      errorClass,
      attempt,
      fromModel: failedModel,
      model: selection.model,
      delayMs: 0,
      retryAtMs: now,
      source: "none",
      historyExhausted: selection.historyExhausted,
    };
  }

  return {
    decision: "give-up",
    errorClass,
    reason: retry.reason === "max-retries" ? "max-retries" : "non-retryable",
    attempt,
  };
}
