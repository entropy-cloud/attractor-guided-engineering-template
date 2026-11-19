/**
 * tier-selector.test.mjs — truth table for layered model selection
 * (multi-plugin-dsh M5-WI3; design owner
 * docs/design/dsh-routing-with-failover.md §5).
 *
 * Cases (≥12):
 *   - single-tier selection (returns first available model)
 *   - tier-internal rotation (skip unavailable, take next)
 *   - tier all unavailable but recovery within threshold → wait (don't escalate)
 *   - tier all unavailable and recovery beyond threshold → escalate
 *   - top tier all unavailable → wait-check with retryAtMs
 *   - defaultTier selection
 *   - escalationThresholdMs = null (top tier never escalates)
 *   - empty candidates list → wait-check
 *   - defaultTier not in tiers → throw at construction
 *   - waitCheckIntervalMs honored
 *   - bit-identical double run
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCircuitBreaker } from "../src/circuit-breaker.ts";
import { createTierSelector } from "../src/tier-selector.ts";

const TCONFIG = {
  tiers: [
    {
      name: "standard",
      candidates: ["s1", "s2"],
      escalationThresholdMs: 60_000,
    },
    {
      name: "premium",
      candidates: ["p1", "p2"],
      escalationThresholdMs: null,
    },
  ],
  defaultTier: "standard",
  waitCheckIntervalMs: 300_000,
};

test("single-tier: first available model picked", () => {
  const cb = createCircuitBreaker();
  const sel = createTierSelector(TCONFIG, cb);
  const d = sel.select(0);
  assert.equal(d.decision, "pick");
  if (d.decision === "pick") {
    assert.equal(d.model, "s1");
    assert.equal(d.tier, "standard");
  }
});

test("tier-internal rotation: skip unavailable, take next", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("s1", "transient:rate-limit", 0);
  const sel = createTierSelector(TCONFIG, cb);
  const d = sel.select(0);
  assert.equal(d.decision, "pick");
  if (d.decision === "pick") {
    assert.equal(d.model, "s2");
  }
});

test("tier all unavailable, recovery within threshold → wait (don't escalate)", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("s1", "transient:rate-limit", 0);
  cb.recordFailure("s2", "transient:network", 0);
  const sel = createTierSelector(TCONFIG, cb);
  const d = sel.select(30_000);
  assert.equal(d.decision, "wait");
  if (d.decision === "wait") {
    assert.equal(d.untilMs, 60_000);
    assert.equal(d.tier, "standard");
  }
});

test("recovery exactly at threshold → wait (don't escalate on equality)", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("s1", "transient:rate-limit", 0);
  cb.recordFailure("s2", "transient:network", 0);
  const sel = createTierSelector(TCONFIG, cb);
  const d = sel.select(0);
  assert.equal(d.decision, "wait");
  if (d.decision === "wait") {
    assert.equal(d.untilMs, 60_000);
  }
});

test("tier all unavailable, recovery beyond threshold → escalate to next tier", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("s1", "permanent:auth", 0);
  cb.recordFailure("s2", "permanent:auth", 0);
  const sel = createTierSelector(TCONFIG, cb);
  const d = sel.select(0);
  assert.equal(d.decision, "pick");
  if (d.decision === "pick") {
    assert.equal(d.model, "p1");
    assert.equal(d.tier, "premium");
  }
});

test("all tiers unavailable → wait-check with retryAtMs = now + waitCheckIntervalMs", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("s1", "permanent:auth", 0);
  cb.recordFailure("s2", "permanent:auth", 0);
  cb.recordFailure("p1", "permanent:auth", 0);
  cb.recordFailure("p2", "permanent:auth", 0);
  const sel = createTierSelector(TCONFIG, cb);
  const d = sel.select(0);
  assert.equal(d.decision, "wait-check");
  if (d.decision === "wait-check") {
    assert.equal(d.retryAtMs, 300_000);
  }
});

test("defaultTier: not the first tier", () => {
  const cb = createCircuitBreaker();
  const cfg = {
    tiers: [
      { name: "cheap", candidates: ["c1"], escalationThresholdMs: 60_000 },
      { name: "standard", candidates: ["s1", "s2"], escalationThresholdMs: 1_800_000 },
      { name: "premium", candidates: ["p1"], escalationThresholdMs: null },
    ],
    defaultTier: "standard",
    waitCheckIntervalMs: 300_000,
  };
  const sel = createTierSelector(cfg, cb);
  const d = sel.select(0);
  assert.equal(d.decision, "pick");
  if (d.decision === "pick") {
    assert.equal(d.model, "s1");
    assert.equal(d.tier, "standard");
  }
});

test("escalationThresholdMs = null (top tier, all unavailable → wait-check)", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("s1", "permanent:auth", 0);
  cb.recordFailure("s2", "permanent:auth", 0);
  cb.recordFailure("p1", "permanent:auth", 0);
  cb.recordFailure("p2", "permanent:auth", 0);
  const sel = createTierSelector(TCONFIG, cb);
  const d = sel.select(0);
  assert.equal(d.decision, "wait-check");
});

test("half-open model is treated as available for picking", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("s1", "transient:rate-limit", 0);
  const sel = createTierSelector(TCONFIG, cb);
  const d = sel.select(60_000);
  assert.equal(d.decision, "pick");
  if (d.decision === "pick") {
    assert.equal(d.model, "s1");
  }
});

test("custom waitCheckIntervalMs honored", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("s1", "permanent:auth", 0);
  cb.recordFailure("s2", "permanent:auth", 0);
  cb.recordFailure("p1", "permanent:auth", 0);
  cb.recordFailure("p2", "permanent:auth", 0);
  const cfg = { ...TCONFIG, waitCheckIntervalMs: 60_000 };
  const sel = createTierSelector(cfg, cb);
  const d = sel.select(0);
  assert.equal(d.decision, "wait-check");
  if (d.decision === "wait-check") {
    assert.equal(d.retryAtMs, 60_000);
  }
});

test("recovery boundary: cooldown just expired → model becomes available", () => {
  const cb = createCircuitBreaker();
  cb.recordFailure("s1", "transient:rate-limit", 0);
  cb.recordFailure("s2", "transient:network", 0);
  const sel = createTierSelector(TCONFIG, cb);
  assert.equal(sel.select(59_999).decision, "wait");
  const after = sel.select(60_000);
  assert.equal(after.decision, "pick", "after cooldown expires, half-open model becomes available");
});

test("defaultTier not in tiers → throw", () => {
  const cb = createCircuitBreaker();
  assert.throws(
    () => createTierSelector({ ...TCONFIG, defaultTier: "ghost" }, cb),
    /defaultTier/,
  );
});

test("bit-identical double run across full corpus", () => {
  const corpus = [
    () => {
      const cb = createCircuitBreaker();
      cb.recordFailure("s1", "transient:rate-limit", 0);
      const sel = createTierSelector(TCONFIG, cb);
      return [sel.select(0), sel.select(60_000)];
    },
    () => {
      const cb = createCircuitBreaker();
      cb.recordFailure("s1", "transient:rate-limit", 0);
      cb.recordFailure("s2", "transient:network", 0);
      cb.recordFailure("p1", "permanent:auth", 0);
      const sel = createTierSelector(TCONFIG, cb);
      return [sel.select(0), sel.select(60_000), sel.select(120_000)];
    },
    () => {
      const cb = createCircuitBreaker();
      cb.recordSuccess("s1");
      cb.recordFailure("p1", "transient:rate-limit", 1000);
      const sel = createTierSelector(TCONFIG, cb);
      return [sel.select(0), sel.select(500), sel.select(1000)];
    },
  ];
  for (const run of corpus) {
    assert.deepEqual(run(), run());
  }
});