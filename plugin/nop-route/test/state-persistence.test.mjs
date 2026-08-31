/**
 * state-persistence.test.mjs — circuit-breaker state persistence round-trip
 * (multi-plugin-dsh M5-WI3; design owner
 * docs/design/dsh-routing-with-failover.md §9).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCircuitPersistence } from "../src/state-persistence.ts";
import { createCircuitBreaker } from "../src/circuit-breaker.ts";
import { writeTextAtomic, defaultFsIo } from "../src/atomic-write.ts";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const withTempDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "noproute-state-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("flush writes to ~/.nop/dsh/routing-state.json", () => {
  withTempDir((dir) => {
    const cb = createCircuitBreaker();
    cb.recordFailure("m1", "transient:rate-limit", 1000);
    const p = createCircuitPersistence(dir, defaultFsIo);
    p.flush(cb);
    const path = join(dir, "routing-state.json");
    assert.equal(existsSync(path), true);
    const content = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(content.models.m1.cooldownMs, 60_000);
    assert.equal(content.models.m1.state, "open");
  });
});

test("load restores state from previous flush", () => {
  withTempDir((dir) => {
    const cb1 = createCircuitBreaker();
    cb1.recordFailure("m1", "transient:network", 0);
    cb1.recordFailure("m1", "transient:network", 1000);
    const p = createCircuitPersistence(dir, defaultFsIo);
    p.flush(cb1);

    const cb2 = createCircuitBreaker();
    p.load(cb2);
    const s = cb2.getState("m1", 1000);
    assert.equal(s.state, "open");
    assert.equal(s.consecutiveFailures, 2);
    assert.equal(s.cooldownMs, 120_000);
  });
});

test("load on missing file → empty state (no error)", () => {
  withTempDir((dir) => {
    const cb = createCircuitBreaker();
    const p = createCircuitPersistence(dir, defaultFsIo);
    p.load(cb);
    assert.equal(cb.getState("m1", 0).state, "closed");
  });
});

test("load on corrupt file → empty state (graceful)", () => {
  withTempDir((dir) => {
    writeTextAtomic(join(dir, "routing-state.json"), "{not-valid-json", defaultFsIo);
    const cb = createCircuitBreaker();
    const p = createCircuitPersistence(dir, defaultFsIo);
    p.load(cb);
    assert.equal(cb.getState("m1", 0).state, "closed");
  });
});

test("flush when no records → writes empty models map", () => {
  withTempDir((dir) => {
    const cb = createCircuitBreaker();
    const p = createCircuitPersistence(dir, defaultFsIo);
    p.flush(cb);
    const content = JSON.parse(readFileSync(join(dir, "routing-state.json"), "utf8"));
    assert.deepEqual(content.models, {});
  });
});

test("bit-identical double run", () => {
  withTempDir((dir) => {
    const build = () => {
      const cb = createCircuitBreaker();
      cb.recordFailure("m1", "transient:network", 0);
      cb.recordFailure("m1", "transient:network", 1000);
      cb.recordFailure("m2", "permanent:budget", 500);
      cb.recordSuccess("m3");
      const p = createCircuitPersistence(dir, defaultFsIo);
      p.flush(cb);
      return JSON.parse(readFileSync(join(dir, "routing-state.json"), "utf8"));
    };
    assert.deepEqual(build(), build());
  });
});

test("load preserves half-open state at boundary (state read with now param)", () => {
  withTempDir((dir) => {
    const cb1 = createCircuitBreaker();
    cb1.recordFailure("m1", "transient:rate-limit", 0);
    const p = createCircuitPersistence(dir, defaultFsIo);
    p.flush(cb1);

    const cb2 = createCircuitBreaker();
    p.load(cb2);
    assert.equal(cb2.getState("m1", 0).state, "open");
    assert.equal(cb2.getState("m1", 60_000).state, "half-open");
    assert.equal(cb2.getState("m1", 60_001).state, "half-open");
  });
});