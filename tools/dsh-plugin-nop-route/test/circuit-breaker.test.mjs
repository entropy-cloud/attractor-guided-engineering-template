/**
 * circuit-breaker.test.mjs — truth table for the per-model circuit breaker
 * (multi-plugin-dsh M5-WI2; design owner
 * docs/design/dsh-routing-with-failover.md §6).
 *
 * Cases (≥15):
 *   - three-state transitions (closed → open → half-open → closed/open)
 *   - cooldown escalation by consecutiveFailures (60s → 120s → 240s → … → 1800s cap)
 *   - per-errorClass base/max correctness (rate-limit/network/timeout vs auth vs budget)
 *   - recordSuccess resets consecutiveFailures and clears state
 *   - isAvailable time boundary (open before until, available after)
 *   - getAllStates snapshot shape
 *   - bit-identical double-run determinism
 *   - non-tracked classes (invalid-input / marker) update lastErrorClass without
 *     entering circuit state
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCircuitBreaker } from "../src/circuit-breaker.ts";

test("initial state is closed", () => {
  const cb = createCircuitBreaker();
  const s = cb.getState("m1", 0);
  assert.equal(s.state, "closed");
  assert.equal(s.consecutiveFailures, 0);
  assert.equal(s.cooldownMs, 0);
  assert.equal(s.lastErrorClass, null);
});

test("closed → open on first transient failure", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "transient:rate-limit", 1000);
  const s = cb.getState("m1", 1000);
  assert.equal(s.state, "open");
  assert.equal(s.consecutiveFailures, 1);
  assert.equal(s.cooldownMs, 60_000);
  assert.equal(s.until, 61_000);
  assert.equal(s.lastErrorClass, "transient:rate-limit");
});

test("cooldown escalates with consecutive failures (60s → 120s → 240s → … → 1800s cap)", () => {
  const cb = createCircuitBreaker();
  const expected = [60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000];
  for (let i = 0; i < expected.length; i++) {
    cb.recordFailure("m1", "transient:network", i * 1000);
    const s = cb.getState("m1", i * 1000);
    assert.equal(s.consecutiveFailures, i + 1, `n=${i + 1}`);
    assert.equal(s.cooldownMs, expected[i], `n=${i + 1}`);
  }
});

test("isAvailable returns false during cooldown, true after cooldown expires", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "transient:timeout", 0);
  assert.equal(cb.isAvailable("m1", 0), false);
  assert.equal(cb.isAvailable("m1", 30_000), false);
  assert.equal(cb.isAvailable("m1", 60_000), true);
});

test("open → half-open transition at until boundary", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "transient:rate-limit", 0);
  assert.equal(cb.getState("m1", 0).state, "open");
  assert.equal(cb.getState("m1", 59_999).state, "open");
  assert.equal(cb.getState("m1", 60_000).state, "half-open");
});

test("half-open + success → closed; consecutiveFailures reset", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "transient:network", 0);
  const s1 = cb.getState("m1", 60_000);
  assert.equal(s1.state, "half-open", "should transition to half-open after first cooldown expires");
  cb.recordSuccess("m1");
  const s2 = cb.getState("m1", 60_000);
  assert.equal(s2.state, "closed");
  assert.equal(s2.consecutiveFailures, 0);
  assert.equal(s2.cooldownMs, 0);
});

test("half-open + failure → open with fresh cooldown (consecutiveFailures continues)", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "transient:rate-limit", 0);
  cb.recordFailure("m1", "transient:rate-limit", 1000);
  cb.recordFailure("m1", "transient:rate-limit", 60_000);
  const s = cb.getState("m1", 60_000);
  assert.equal(s.state, "open");
  assert.equal(s.consecutiveFailures, 3);
  assert.equal(s.cooldownMs, 240_000);
  assert.equal(s.until, 300_000);
});

test("permanent:auth uses fixed 1800s cooldown (no escalation)", () => {
  const cb = createCircuitBreaker();
  for (let i = 0; i < 5; i++) {
    cb.recordFailure("m1", "permanent:auth", i * 1000);
  }
  const s = cb.getState("m1", 0);
  assert.equal(s.cooldownMs, 1_800_000);
  assert.equal(s.consecutiveFailures, 5);
});

test("permanent:budget uses fixed 18000s cooldown", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "permanent:budget", 0);
  const s = cb.getState("m1", 0);
  assert.equal(s.state, "open");
  assert.equal(s.cooldownMs, 18_000_000);
  assert.equal(s.until, 18_000_000);
});

test("permanent:invalid-input updates lastErrorClass but does NOT enter circuit", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "permanent:invalid-input", 1000);
  const s = cb.getState("m1", 1000);
  assert.equal(s.state, "closed", "invalid-input does not enter circuit");
  assert.equal(s.consecutiveFailures, 0);
  assert.equal(s.cooldownMs, 0);
  assert.equal(s.lastErrorClass, "permanent:invalid-input");
});

test("partial:marker updates lastErrorClass but does NOT enter circuit", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "partial:marker", 1000);
  const s = cb.getState("m1", 1000);
  assert.equal(s.state, "closed");
  assert.equal(s.lastErrorClass, "partial:marker");
});

test("unknown class follows short cooldown (conservative)", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "unknown", 0);
  const s = cb.getState("m1", 0);
  assert.equal(s.cooldownMs, 60_000);
});

test("independent state per model", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "transient:rate-limit", 0);
  cb.recordFailure("m2", "transient:network", 0);
  assert.equal(cb.getState("m1", 0).cooldownMs, 60_000);
  assert.equal(cb.getState("m2", 0).cooldownMs, 60_000);
  assert.equal(cb.getState("m3", 0).state, "closed");
});

test("getAllStates returns a snapshot of every tracked model", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("m1", "transient:rate-limit", 0);
  cb.recordFailure("m2", "permanent:auth", 0);
  const all = cb.getAllStates(0);
  assert.deepEqual(Object.keys(all).sort(), ["m1", "m2"]);
  assert.equal(all["m1"].cooldownMs, 60_000);
  assert.equal(all["m2"].cooldownMs, 1_800_000);
});

test("exportState / importState round-trip", () => {
  const cb1 = createCircuitBreaker();
  cb1.recordFailure("m1", "transient:network", 0);
  cb1.recordFailure("m2", "permanent:budget", 0);
  const snapshot = cb1.exportState(0);

  const cb2 = createCircuitBreaker();
  cb2.importState(snapshot);
  assert.equal(cb2.getState("m1", 0).cooldownMs, 60_000);
  assert.equal(cb2.getState("m2", 0).cooldownMs, 18_000_000);
});

test("bit-identical double run across full fixture corpus", () => {
  const corpus = [
    () => createCircuitBreaker(),
    (cb) => { cb.recordFailure("m1", "transient:rate-limit", 1000); cb.recordFailure("m1", "transient:network", 2000); cb.getState("m1", 60_000); },
    (cb) => { cb.recordFailure("auth-fail", "permanent:auth", 0); cb.recordSuccess("auth-fail"); cb.getState("auth-fail", 0); },
    (cb) => { cb.recordFailure("quota", "permanent:budget", 0); cb.getState("quota", 18_000_000); },
    (cb) => { cb.importState({ m1: { state: "open", until: 60_000, consecutiveFailures: 1, cooldownMs: 60_000, lastErrorClass: "transient:rate-limit", lastErrorAt: 0 } }); cb.getAllStates(0); },
  ];
  for (const fn of corpus) {
    const cb1 = fn.length > 0 ? (() => { const c = createCircuitBreaker(); fn(c); return c; })() : fn();
    const cb2 = fn.length > 0 ? (() => { const c = createCircuitBreaker(); fn(c); return c; })() : fn();
    assert.deepEqual(cb1.exportState(0), cb2.exportState(0), `corpus entry diverged`);
  }
});

test("custom cooldown config (override defaults)", () => {
  const cb = createCircuitBreaker({
    shortCooldownMs: 5_000,
    authCooldownMs: 60_000,
    quotaCooldownMs: 600_000,
    maxShortCooldownMs: 60_000,
  });
  cb.recordFailure("m1", "transient:rate-limit", 0);
  cb.recordFailure("m1", "transient:rate-limit", 1000);
  cb.recordFailure("m1", "transient:rate-limit", 2000);
  const s = cb.getState("m1", 2000);
  assert.equal(s.cooldownMs, 20_000);
  assert.equal(s.until, 22_000);
  cb.recordFailure("m1", "transient:rate-limit", 3000);
  assert.equal(cb.getState("m1", 3000).cooldownMs, 40_000);
  cb.recordFailure("m1", "transient:rate-limit", 4000);
  assert.equal(cb.getState("m1", 4000).cooldownMs, 60_000, "cap applied");
});