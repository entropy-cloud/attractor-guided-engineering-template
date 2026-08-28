/**
 * error-classifier.test.mjs — truth table for classify() (multi-plugin-dsh
 * M4-WI10). ≥10 cases: one positive per ErrorClass value, boundary inputs
 * (non-object / empty / missing fields / unknown code), same-shape conflict
 * precedence, and the bit-identical double-run determinism assertion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/error-classifier.ts";

test("non-object inputs fall through to unknown", () => {
  for (const input of [null, undefined, 42, "rate limit", true]) {
    assert.equal(classify(input), "unknown", `classify(${String(input)})`);
  }
});

test("empty object and missing fields fall through to unknown", () => {
  assert.equal(classify({}), "unknown");
  assert.equal(classify({ message: "" }), "unknown");
  assert.equal(classify({ unrelated: true }), "unknown");
});

test("transient:network — socket-level code", () => {
  assert.equal(classify({ code: "ECONNRESET" }), "transient:network");
  assert.equal(classify({ code: "ENOTFOUND" }), "transient:network");
  assert.equal(classify({ status: 502 }), "transient:network");
});

test("transient:rate-limit — 429 status", () => {
  assert.equal(classify({ status: 429 }), "transient:rate-limit");
  assert.equal(classify({ statusCode: 429 }), "transient:rate-limit");
});

test("transient:timeout — ETIMEDOUT code and TimeoutError name", () => {
  assert.equal(classify({ code: "ETIMEDOUT" }), "transient:timeout");
  assert.equal(classify({ name: "TimeoutError" }), "transient:timeout");
  assert.equal(classify({ status: 408 }), "transient:timeout");
});

test("permanent:auth — 401/403 status", () => {
  assert.equal(classify({ status: 401 }), "permanent:auth");
  assert.equal(classify({ status: 403 }), "permanent:auth");
  assert.equal(classify({ code: "invalid_api_key" }), "permanent:auth");
});

test("permanent:invalid-input — 400 status and request-error code", () => {
  assert.equal(classify({ status: 400 }), "permanent:invalid-input");
  assert.equal(classify({ code: "invalid_request_error" }), "permanent:invalid-input");
});

test("permanent:budget — quota code and 402 status", () => {
  assert.equal(classify({ code: "insufficient_quota" }), "permanent:budget");
  assert.equal(classify({ status: 402 }), "permanent:budget");
});

test("partial:marker — partial flag and unclosed marker tag", () => {
  assert.equal(classify({ partial: true }), "partial:marker");
  assert.equal(
    classify({ message: "stream cut mid-output <AI_STEP_RESULT>pass" }),
    "partial:marker",
  );
  assert.equal(
    classify({ text: "<AI_STEP_RESULT>pass</AI_STEP_RESULT>" }),
    "unknown",
    "closed marker pair is complete output, not a partial error",
  );
});

test("partial:marker outranks structural transient fields", () => {
  assert.equal(
    classify({ partial: true, status: 429, code: "ECONNRESET" }),
    "partial:marker",
  );
});

test("unknown code value falls through to unknown", () => {
  assert.equal(classify({ code: "E_SOMETHING_NOVEL" }), "unknown");
  assert.equal(classify({ code: 12345 }), "unknown");
});

test("same-shape conflict: class precedence, status 429 + code ECONNRESET → rate-limit", () => {
  assert.equal(classify({ status: 429, code: "ECONNRESET" }), "transient:rate-limit");
});

test("same-shape conflict: status 401 + invalid-input code → auth precedes invalid-input", () => {
  assert.equal(classify({ status: 401, code: "invalid_request_error" }), "permanent:auth");
});

test("same-shape conflict: status 408 + ECONNREFUSED → timeout precedes network", () => {
  assert.equal(classify({ status: 408, code: "ECONNREFUSED" }), "transient:timeout");
});

test("message-shape positives per class", () => {
  assert.equal(classify({ message: "Rate limit exceeded, retry later" }), "transient:rate-limit");
  assert.equal(classify({ message: "Request timed out after 30000ms" }), "transient:timeout");
  assert.equal(classify({ message: "dial tcp: connection refused" }), "transient:network");
  assert.equal(classify({ message: "Invalid API key provided" }), "permanent:auth");
  assert.equal(classify({ message: "request exceeded your usage limit" }), "permanent:budget");
  assert.equal(classify({ message: "context length of this request is too large" }), "permanent:invalid-input");
});

test("code normalization: case and separator folding", () => {
  assert.equal(classify({ code: "RATE-LIMITED" }), "transient:rate-limit");
  assert.equal(classify({ code: "Rate Limit" }), "transient:rate-limit");
});

test("bare retry-after hint classifies as rate-limit; status outranks the bare hint", () => {
  assert.equal(classify({ headers: { "Retry-After": "120" } }), "transient:rate-limit");
  assert.equal(classify({ retryAfter: 30 }), "transient:rate-limit");
  assert.equal(
    classify({ status: 503, retryAfter: 30 }),
    "transient:network",
    "503 status wins before the bare retry-after fallback",
  );
});

test("Headers-like retry-after face (get method)", () => {
  const headers = { get: (key) => (key === "retry-after" ? "60" : null) };
  assert.equal(classify({ headers }), "transient:rate-limit");
});

test("Error instances classify through their message field", () => {
  assert.equal(classify(new Error("upstream quota exceeded for this account")), "permanent:budget");
});

test("bit-identical double run across the full fixture corpus", () => {
  const corpus = [
    () => null, () => undefined, () => 42, () => "rate limit",
    () => ({}), () => ({ message: "" }),
    () => ({ code: "ECONNRESET" }), () => ({ status: 429 }), () => ({ statusCode: 429 }),
    () => ({ code: "ETIMEDOUT" }), () => ({ name: "TimeoutError" }), () => ({ status: 408 }),
    () => ({ status: 401 }), () => ({ status: 403 }), () => ({ code: "invalid_api_key" }),
    () => ({ status: 400 }), () => ({ code: "invalid_request_error" }),
    () => ({ code: "insufficient_quota" }), () => ({ status: 402 }),
    () => ({ partial: true }), () => ({ partial: false, status: 429 }),
    () => ({ message: "stream cut mid-output <AI_STEP_RESULT>pass" }),
    () => ({ text: "<AI_STEP_RESULT>pass</AI_STEP_RESULT>" }),
    () => ({ code: "E_SOMETHING_NOVEL" }), () => ({ code: 12345 }),
    () => ({ status: 429, code: "ECONNRESET" }),
    () => ({ status: 401, code: "invalid_request_error" }),
    () => ({ status: 408, code: "ECONNREFUSED" }),
    () => ({ message: "Rate limit exceeded, retry later" }),
    () => ({ message: "Request timed out after 30000ms" }),
    () => ({ message: "dial tcp: connection refused" }),
    () => ({ message: "Invalid API key provided" }),
    () => ({ message: "request exceeded your usage limit" }),
    () => ({ message: "context length of this request is too large" }),
    () => ({ code: "RATE-LIMITED" }), () => ({ code: "Rate Limit" }),
    () => ({ headers: { "Retry-After": "120" } }), () => ({ retryAfter: 30 }),
    () => ({ status: 503, retryAfter: 30 }),
    () => ({ headers: { get: (key) => (key === "retry-after" ? "60" : null) } }),
    () => new Error("upstream quota exceeded for this account"),
  ];
  for (const makeFixture of corpus) {
    const first = classify(makeFixture());
    const second = classify(makeFixture());
    assert.deepEqual(first, second, `double run diverged for ${makeFixture?.name ?? "fixture"}`);
    const reference = makeFixture();
    assert.deepEqual(classify(reference), first, "re-run on the same reference is stable");
  }
});
