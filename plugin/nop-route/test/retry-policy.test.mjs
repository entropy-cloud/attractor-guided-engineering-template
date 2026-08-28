/**
 * retry-policy.test.mjs — truth table for retryDecision() (multi-plugin-dsh
 * M4-WI11). ≥10 cases: maxRetries boundary (0 / mid / reached), backoff
 * curve samples, retry-after override vs absent branch, non-retryable
 * short-circuit, attempt-monotonic face with a fake clock, and the
 * bit-identical double-run determinism assertion. Time enters only through
 * the injected fake clock (now).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { retryDecision } from "../src/retry-policy.ts";

const CFG = { maxRetries: 3 };

test("maxRetries 0 boundary: every failure gives up immediately", () => {
  const decision = retryDecision({ code: "ECONNRESET" }, 0, { maxRetries: 0 }, 1000);
  assert.equal(decision.action, "give-up");
  assert.equal(decision.reason, "max-retries");
  assert.equal(decision.nextAttempt, null);
  assert.equal(decision.source, "none");
});

test("attempt 0 transient failure: retry granted, backoff 1000ms, fake clock offsets retryAt", () => {
  const decision = retryDecision({ code: "ECONNRESET" }, 0, CFG, 10000);
  assert.equal(decision.action, "retry");
  assert.equal(decision.reason, "retryable");
  assert.equal(decision.errorClass, "transient:network");
  assert.equal(decision.nextAttempt, 1);
  assert.equal(decision.delayMs, 1000);
  assert.equal(decision.retryAtMs, 11000);
  assert.equal(decision.source, "backoff");
});

test("attempt 2 (last granted retry) still retries", () => {
  const decision = retryDecision({ code: "ETIMEDOUT" }, 2, CFG, 0);
  assert.equal(decision.action, "retry");
  assert.equal(decision.nextAttempt, 3);
  assert.equal(decision.delayMs, 4000);
});

test("attempt 3 (maxRetries reached): no retry", () => {
  const decision = retryDecision({ code: "ETIMEDOUT" }, 3, CFG, 0);
  assert.equal(decision.action, "give-up");
  assert.equal(decision.reason, "max-retries");
  assert.equal(decision.nextAttempt, null);
});

test("backoff curve samples: 1000 / 2000 / 4000 / 8000ms with default base and factor", () => {
  const wide = { maxRetries: 10 };
  const delays = [0, 1, 2, 3].map((attempt) =>
    retryDecision({ status: 503 }, attempt, wide, 0).delayMs,
  );
  assert.deepEqual(delays, [1000, 2000, 4000, 8000]);
});

test("backoff curve caps at maxDelayMs default 30000", () => {
  const wide = { maxRetries: 10 };
  assert.equal(retryDecision({ status: 503 }, 5, wide, 0).delayMs, 30000);
  assert.equal(retryDecision({ status: 503 }, 9, wide, 0).delayMs, 30000);
});

test("custom base/factor curve: 500 * 3^2 = 4500ms", () => {
  const decision = retryDecision(
    { status: 429 },
    2,
    { maxRetries: 5, baseDelayMs: 500, backoffFactor: 3, maxDelayMs: 30000 },
    0,
  );
  assert.equal(decision.delayMs, 4500);
  assert.equal(decision.source, "backoff");
});

test("retry-after field overrides the curve (120s → 120000ms)", () => {
  const decision = retryDecision({ status: 429, retryAfter: 120 }, 0, CFG, 0);
  assert.equal(decision.action, "retry");
  assert.equal(decision.delayMs, 120000);
  assert.equal(decision.retryAtMs, 120000);
  assert.equal(decision.source, "retry-after");
});

test("retry-after headers row (string seconds) overrides the curve", () => {
  const decision = retryDecision({ status: 429, headers: { "retry-after": "45" } }, 1, CFG, 0);
  assert.equal(decision.delayMs, 45000);
  assert.equal(decision.source, "retry-after");
});

test("retry-after is NOT clamped by maxDelayMs (server instruction wins)", () => {
  const decision = retryDecision(
    { status: 429, retryAfter: 120 },
    0,
    { maxRetries: 3, maxDelayMs: 30000 },
    0,
  );
  assert.equal(decision.delayMs, 120000);
});

test("retry-after absent or non-numeric falls back to the curve branch", () => {
  assert.equal(retryDecision({ status: 503 }, 0, CFG, 0).source, "backoff");
  assert.equal(retryDecision({ status: 429, retryAfter: "not-a-number" }, 0, CFG, 0).source, "backoff");
  assert.equal(retryDecision({ status: 429, retryAfter: 0 }, 0, CFG, 0).source, "backoff");
});

test("non-retryable classes short-circuit to give-up even with budget left", () => {
  for (const error of [
    { status: 401 },
    { code: "invalid_request_error" },
    { code: "insufficient_quota" },
    { partial: true },
    { code: "E_SOMETHING_NOVEL" },
    null,
  ]) {
    const decision = retryDecision(error, 0, CFG, 500);
    assert.equal(decision.action, "give-up", `expected give-up for ${JSON.stringify(String(error))}`);
    assert.equal(decision.reason, "non-retryable");
    assert.equal(decision.delayMs, 0);
    assert.equal(decision.retryAtMs, 500);
    assert.equal(decision.source, "none");
  }
});

test("non-retryable short-circuit outranks a retry-after hint", () => {
  const decision = retryDecision({ status: 401, retryAfter: 30 }, 0, CFG, 0);
  assert.equal(decision.action, "give-up");
  assert.equal(decision.errorClass, "permanent:auth");
  assert.equal(decision.source, "none");
});

test("attempt-monotonic face: nextAttempt = attempt + 1, retryAtMs strictly increases", () => {
  const now = 1000;
  const decisions = [0, 1, 2].map((attempt) => retryDecision({ status: 503 }, attempt, CFG, now));
  for (const [index, decision] of decisions.entries()) {
    assert.equal(decision.nextAttempt, index + 1);
  }
  assert.ok(decisions[0].retryAtMs < decisions[1].retryAtMs);
  assert.ok(decisions[1].retryAtMs < decisions[2].retryAtMs);
  assert.deepEqual(
    decisions.map((d) => d.retryAtMs),
    [2000, 3000, 5000],
  );
});

test("give-up shape on max-retries carries the class and zero delay", () => {
  const decision = retryDecision({ status: 429 }, 3, CFG, 4242);
  assert.equal(decision.errorClass, "transient:rate-limit");
  assert.equal(decision.attempt, 3);
  assert.equal(decision.delayMs, 0);
  assert.equal(decision.retryAtMs, 4242);
  assert.equal(decision.source, "none");
});

test("bit-identical double run over the decision face", () => {
  const cases = [
    () => retryDecision({ code: "ECONNRESET" }, 0, CFG, 1000),
    () => retryDecision({ code: "ECONNRESET" }, 0, { maxRetries: 0 }, 1000),
    () => retryDecision({ status: 429, retryAfter: 120 }, 0, CFG, 0),
    () => retryDecision({ status: 429, headers: { "retry-after": "45" } }, 1, CFG, 0),
    () => retryDecision({ status: 503 }, 5, CFG, 0),
    () => retryDecision({ status: 401, retryAfter: 30 }, 0, CFG, 0),
    () => retryDecision({ code: "ETIMEDOUT" }, 3, CFG, 0),
    () => retryDecision(null, 0, CFG, 0),
  ];
  for (const run of cases) {
    assert.deepEqual(run(), run(), "double run diverged");
  }
});
