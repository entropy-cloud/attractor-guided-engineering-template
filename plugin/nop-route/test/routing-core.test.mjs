/**
 * routing-core.test.mjs — orchestration truth table for decide()
 * (multi-plugin-dsh M4-WI13).
 *
 * Pins the four decision classes (≥2 cases each) plus the composition
 * boundaries the plan requires:
 *   - retryable class but attempt reached maxRetries → NOT Retry (the
 *     fallback-when-alternative / give-up-when-none split);
 *   - partial:marker → Transform (marker extraction);
 *   - permanent:* → Give-up (the Transform/Give-up boundary for
 *     non-retryable errors: only partial:marker transforms);
 *   - transient class × fallback chain available / exhausted (both
 *     branches);
 *   - same-input double run → bit-identical decisions (fake clock only,
 *     time enters through the `now` parameter).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../src/routing-core.ts";

const CONFIG = {
  defaultModel: "model-a",
  maxRetries: 2,
  fallbackModels: ["model-b", "model-c"],
};

// ── Retry (same model, backoff / retry-after) ────────────────────────────────

test("Retry: first transient network failure with empty history retries the same model on the backoff curve", () => {
  const d = decide({ error: { code: "ECONNRESET" }, model: "model-a", attempt: 0 }, CONFIG, 10_000);
  assert.equal(d.decision, "retry");
  assert.equal(d.errorClass, "transient:network");
  assert.equal(d.model, "model-a");
  assert.equal(d.nextAttempt, 1);
  assert.equal(d.delayMs, 1000);
  assert.equal(d.retryAtMs, 11_000);
  assert.equal(d.source, "backoff");
  assert.equal(d.historyExhausted, false);
});

test("Retry: transient rate-limit with a numeric retry-after hint takes the hint, not the curve", () => {
  const d = decide(
    { error: { status: 429, retryAfter: 7 }, model: "model-a", attempt: 1 },
    CONFIG,
    100,
  );
  assert.equal(d.decision, "retry");
  assert.equal(d.errorClass, "transient:rate-limit");
  assert.equal(d.model, "model-a");
  assert.equal(d.delayMs, 7000);
  assert.equal(d.retryAtMs, 7100);
  assert.equal(d.source, "retry-after");
});

test("Retry: fully-tainted chain retries the chain head with historyExhausted", () => {
  const d = decide(
    {
      error: { status: 503 },
      model: "model-a",
      attempt: 1,
      history: [
        { model: "model-a", outcome: "failure" },
        { model: "model-b", outcome: "failure" },
        { model: "model-c", outcome: "failure" },
      ],
    },
    CONFIG,
    0,
  );
  assert.equal(d.decision, "retry");
  assert.equal(d.model, "model-a", "retry the primary rather than inventing an off-chain model");
  assert.equal(d.historyExhausted, true);
});

// ── Fallback (different model) ───────────────────────────────────────────────

test("Fallback: transient failure of a history-tainted model switches to the next untainted chain model", () => {
  const d = decide(
    {
      error: { code: "ETIMEDOUT" },
      model: "model-a",
      attempt: 0,
      history: [{ model: "model-a", outcome: "failure" }],
    },
    CONFIG,
    0,
  );
  assert.equal(d.decision, "fallback");
  assert.equal(d.errorClass, "transient:timeout");
  assert.equal(d.fromModel, "model-a");
  assert.equal(d.model, "model-b");
  assert.equal(d.delayMs, 1000, "backoff delay still applies to the re-issue");
  assert.equal(d.source, "backoff");
});

test("Fallback: retryable class at maxRetries with an available alternative falls back with no delay", () => {
  const d = decide(
    {
      error: { status: 429 },
      model: "model-a",
      attempt: 2,
      history: [{ model: "model-a", outcome: "failure" }],
    },
    CONFIG,
    500,
  );
  assert.equal(d.decision, "fallback");
  assert.equal(d.errorClass, "transient:rate-limit");
  assert.equal(d.fromModel, "model-a");
  assert.equal(d.model, "model-b");
  assert.equal(d.delayMs, 0);
  assert.equal(d.retryAtMs, 500);
  assert.equal(d.source, "none");
});

test("Fallback: tainted default falls back to the first fallback entry (chain order)", () => {
  const d = decide(
    {
      error: { message: "connection reset by peer" },
      model: "model-a",
      attempt: 1,
      history: [
        { model: "model-a", outcome: "failure" },
        { model: "model-a", outcome: "failure" },
      ],
    },
    CONFIG,
    0,
  );
  assert.equal(d.decision, "fallback");
  assert.equal(d.fromModel, "model-a");
  assert.equal(d.model, "model-b");
  assert.equal(d.nextAttempt, undefined);
});

// ── Transform (partial:marker) ───────────────────────────────────────────────

test("Transform: partial flag without marker text transforms into a structured partial-marker object", () => {
  const d = decide({ error: { partial: true, status: 429 } }, CONFIG, 0);
  assert.equal(d.decision, "transform");
  assert.equal(d.errorClass, "partial:marker");
  assert.equal(d.transformed.code, "partial-marker");
  assert.equal(d.transformed.partial, true);
  assert.equal(d.transformed.extractedMarker, null);
});

test("Transform: unclosed <AI_STEP_RESULT> tag extracts the marker payload", () => {
  const d = decide(
    { error: { message: "stream cut mid-output <AI_STEP_RESULT>pass" }, attempt: 0 },
    CONFIG,
    0,
  );
  assert.equal(d.decision, "transform");
  assert.equal(d.transformed.extractedMarker, "pass");
  assert.equal(d.transformed.message, "stream cut mid-output <AI_STEP_RESULT>pass");
  assert.equal(d.transformed.errorClass, "partial:marker");
});

// ── Give-up (original error unchanged posture) ───────────────────────────────

test("Give-up: permanent auth error is non-retryable regardless of remaining budget", () => {
  const d = decide({ error: { status: 401 }, model: "model-a", attempt: 0 }, CONFIG, 0);
  assert.equal(d.decision, "give-up");
  assert.equal(d.errorClass, "permanent:auth");
  assert.equal(d.reason, "non-retryable");
  assert.equal(d.attempt, 0);
});

test("Give-up: unknown class (no retry-after hint — a bare hint is rate-limit) gives up", () => {
  const d = decide(
    { error: { code: "E_NOVEL" }, model: "model-a", attempt: 0 },
    CONFIG,
    0,
  );
  assert.equal(d.decision, "give-up");
  assert.equal(d.errorClass, "unknown");
  assert.equal(d.reason, "non-retryable");
});

test("Give-up: retryable at maxRetries with no alternative model gives up with max-retries reason", () => {
  const single = { defaultModel: "model-a", maxRetries: 1 };
  const d = decide({ error: { status: 502 }, model: "model-a", attempt: 1 }, single, 0);
  assert.equal(d.decision, "give-up");
  assert.equal(d.errorClass, "transient:network");
  assert.equal(d.reason, "max-retries");
});

// ── Composition boundaries ───────────────────────────────────────────────────

test("boundary: retryable at maxRetries over a fully-tainted chain gives up (head = failed model)", () => {
  const d = decide(
    {
      error: { status: 503 },
      model: "model-a",
      attempt: 2,
      history: [
        { model: "model-a", outcome: "failure" },
        { model: "model-b", outcome: "failure" },
        { model: "model-c", outcome: "failure" },
      ],
    },
    CONFIG,
    0,
  );
  assert.equal(d.decision, "give-up");
  assert.equal(d.reason, "max-retries");
});

test("boundary: transient × exhausted chain retries the failed model itself (preferred anchor = chain head)", () => {
  // Every configured model is tainted; pickModel returns the chain head,
  // which — with the failed model passed as the preferred anchor — IS the
  // failed model. The chain-tail-exhaustion branch therefore degrades to
  // a same-model Retry with historyExhausted (never an off-chain model).
  const d = decide(
    {
      error: { code: "ECONNREFUSED" },
      model: "model-c",
      attempt: 0,
      history: [
        { model: "model-a", outcome: "failure" },
        { model: "model-b", outcome: "failure" },
        { model: "model-c", outcome: "failure" },
      ],
    },
    CONFIG,
    0,
  );
  assert.equal(d.decision, "retry");
  assert.equal(d.model, "model-c");
  assert.equal(d.historyExhausted, true);
});

test("boundary: default attempt 0 and omitted model anchor on defaultModel", () => {
  const d = decide({ error: { status: 408 } }, CONFIG, 0);
  assert.equal(d.decision, "retry");
  assert.equal(d.model, "model-a");
  assert.equal(d.attempt, 0);
  assert.equal(d.nextAttempt, 1);
});

test("boundary: closed marker pair is NOT partial (falls through to class rules)", () => {
  const d = decide(
    { error: { text: "<AI_STEP_RESULT>pass</AI_STEP_RESULT>" }, attempt: 0 },
    CONFIG,
    0,
  );
  assert.equal(d.decision, "give-up");
  assert.equal(d.errorClass, "unknown");
  assert.equal(d.reason, "non-retryable");
});

// ── Determinism (same input → bit-identical decision) ───────────────────────

test("determinism: same input twice → bit-identical decisions across all four classes", () => {
  const cases = [
    { error: { code: "ECONNRESET" }, model: "model-a", attempt: 0 },
    { error: { status: 429 }, model: "model-a", attempt: 0, history: [{ model: "model-a", outcome: "failure" }] },
    { error: { partial: true } },
    { error: { status: 401 } },
    { error: { status: 503 }, model: "model-a", attempt: 2 },
  ];
  for (const [index, input] of cases.entries()) {
    const first = decide(input, CONFIG, 12345);
    const second = decide(input, CONFIG, 12345);
    assert.deepEqual(first, second, `case ${index} bit-identical`);
  }
});
