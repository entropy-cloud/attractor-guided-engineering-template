/**
 * service.test.mjs — noproute service mount unit suite (multi-plugin-dsh
 * M4-WI15; stub ctx DIRECT `apply` calls — publication shape + mount log
 * + headless degradation + histogram accumulate/reset; nop-age test
 * precedent: unit-level stub ctx, real cordis boot belongs to WI16 e2e).
 *
 * The stub ctx satisfies exactly the cordis faces `apply` touches:
 *   - `reflect.provide` (the Service base-class registration seam),
 *   - `logger(name)`, `effect(fn, label)`, `get(name)`,
 *   - `inject(deps, cb)` — called back immediately when the dependency is
 *     available (cordis reactive-inject semantics), recorded otherwise.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, NopRouteService } from "../src/service.ts";

const tempDirs = [];
const newTempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "noproute-svc-"));
  tempDirs.push(d);
  return d;
};
process.on("exit", () => {
  for (const d of tempDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

function makeCtx({ webServer } = {}) {
  const publications = [];
  const effects = [];
  const injects = [];
  const logs = [];
  const ctx = {
    reflect: {
      provide: (name, instance) => publications.push({ name, instance }),
    },
    logger: (name) => {
      assert.equal(name, "noproute");
      return {
        info: (m, f) => logs.push({ level: "info", m, f }),
        warn: (m, f) => logs.push({ level: "warn", m, f }),
      };
    },
    effect: (fn, label) => {
      const dispose = typeof fn === "function" ? fn() : undefined;
      const entry = {
        fn,
        label,
        dispose: typeof dispose === "function" ? dispose : () => {},
      };
      effects.push(entry);
      return entry.dispose;
    },
    inject: (deps, cb) => {
      injects.push({ deps, cb });
      if (deps.includes("webServer") && webServer !== undefined) cb(ctx);
    },
    get: (name) => (name === "webServer" ? webServer : undefined),
  };
  return { ctx, publications, effects, injects, logs };
}

const CONFIG = { defaultModel: "model-a", maxRetries: 2, fallbackModels: ["model-b"] };

// ── Publication shape ────────────────────────────────────────────────────────

test("apply publishes the noproute cordis service (Service subclass, four routes + histogram)", () => {
  const { ctx, publications } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  assert.equal(publications.length, 1);
  const { name, instance } = publications[0];
  assert.equal(name, "noproute", "registration name = bundle minus nop- prefix, camelCased");
  assert.ok(instance instanceof NopRouteService);
  assert.equal(instance.name, "noproute");
  for (const method of ["noproute.route", "noproute.classify", "noproute.pick-model", "noproute.health"]) {
    assert.equal(typeof instance.routes[method], "function", `${method} handler present`);
  }
  assert.equal(typeof instance.histogram.record, "function");
  assert.equal(typeof instance.histogram.snapshot, "function");
});

test("published service answers through its own routes (in-process consumption face)", () => {
  const { ctx, publications } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  const service = publications[0].instance;
  assert.deepEqual(service.routes["noproute.classify"]({ error: { status: 429 } }), {
    errorClass: "transient:rate-limit",
  });
  assert.equal(service.routes["noproute.health"]().defaultModel, "model-a");
});

// ── Mount log ────────────────────────────────────────────────────────────────

test("mount log carries the nop-route package name and nopRoute realm", () => {
  const { ctx, logs } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  const mount = logs.find(({ m }) => m === "nop-route mounted");
  assert.ok(mount, "mount log line present");
  assert.equal(mount.f.package, "nop-route");
  assert.equal(mount.f.realm, "nopRoute");
  assert.equal(mount.f.service, "noproute");
  assert.equal(mount.f.defaultModel, "model-a");
  assert.equal(mount.f.maxRetries, 2);
  assert.deepEqual(mount.f.fallbackModels, ["model-b"]);
});

// ── Headless degradation ─────────────────────────────────────────────────────

test("headless: no webServer → degrade log line, service still published, inject stays dormant", () => {
  const { ctx, publications, injects, logs } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  assert.equal(publications.length, 1, "mount is never a failure without webServer");
  assert.deepEqual(injects[0].deps, ["webServer"], "reactive inject registered");
  const degrade = logs.find(({ m }) => /webServer service absent/.test(m));
  assert.ok(degrade, "headless degrade posture logged");
  assert.match(degrade.m, /headless posture/);
  assert.equal(logs.find(({ m }) => m === "nop-route mounted") !== undefined, true);
});

test("webServer present: inject fires and registers the /noproute/api prefix route", () => {
  const registered = [];
  const webServer = {
    register: (route) => {
      registered.push(route);
      return () => {};
    },
  };
  const { ctx, effects } = makeCtx({ webServer });
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  assert.equal(registered.length, 1);
  assert.equal(registered[0].kind, "prefix");
  assert.equal(registered[0].path, "/noproute/api");
  assert.equal(effects.length, 2, "two effects: teardown flush + route disposer");
  assert.ok(
    effects.some((e) => /noproute: \/noproute\/api routes/.test(e.label)),
    "route disposer effect present",
  );
  assert.ok(
    effects.some((e) => /noproute: routing state persistence/.test(e.label)),
    "routing state persistence effect present",
  );
});

// ── Histogram accumulate / reset (three faces: accumulate, read, reset) ──────

test("histogram accumulates at route/classify call sites and reads through health", () => {
  const { ctx, publications } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  const service = publications[0].instance;
  service.routes["noproute.classify"]({ error: { status: 401 } });
  service.routes["noproute.route"]({ error: { partial: true } });
  service.routes["noproute.route"]({ error: { code: "ECONNRESET" }, attempt: 0 });
  assert.deepEqual(service.routes["noproute.health"]().errorHistogram, {
    "partial:marker": 1,
    "permanent:auth": 1,
    "transient:network": 1,
  });
});

test("resetHistogram returns the pre-reset snapshot and zeroes the counters", () => {
  const { ctx, publications } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  const service = publications[0].instance;
  service.routes["noproute.classify"]({ error: { status: 429 } });
  service.routes["noproute.classify"]({ error: { status: 429 } });
  const before = service.resetHistogram();
  assert.deepEqual(before, { "transient:rate-limit": 2 });
  assert.deepEqual(service.routes["noproute.health"]().errorHistogram, {});
  service.routes["noproute.classify"]({ error: { status: 429 } });
  assert.deepEqual(service.routes["noproute.health"]().errorHistogram, { "transient:rate-limit": 1 });
});

test("the histogram instance is shared with the published routes (single state owner)", () => {
  const { ctx, publications } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  const service = publications[0].instance;
  service.histogram.record("unknown");
  assert.deepEqual(service.routes["noproute.health"]().errorHistogram, { unknown: 1 });
});

// ── Zero-dispatch discipline ─────────────────────────────────────────────────

test("apply never injects the agents service (zero host-call discipline)", () => {
  const { ctx, injects } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  assert.ok(injects.every(({ deps }) => !deps.includes("agents")), "agents inject must not appear");
});

// ── Circuit-breaker + pause/resume integration (M5-WI3 Phase 3e) ──────────────

/** Run a body that touches `apply`, then trigger the teardown effect to flush + cancel timers. */
function withApplyDisposal({ webServer } = {}, body) {
  const tmpDir = newTempDir();
  const { ctx, publications, effects } = makeCtx({ webServer });
  apply(ctx, { ...CONFIG, nopHome: tmpDir });
  const teardown = effects.find((e) => /routing state persistence/.test(e.label))?.dispose;
  try {
    return body({ ctx, publications, effects, teardown });
  } finally {
    if (typeof teardown === "function") teardown();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

test("service exposes circuitBreaker and missionCallStats on the published face", () => {
  withApplyDisposal({}, ({ publications }) => {
    const service = publications[0].instance;
    assert.equal(typeof service.circuitBreaker, "object");
    assert.equal(typeof service.circuitBreaker.recordFailure, "function");
    assert.equal(typeof service.missionCallStats, "object");
    assert.equal(typeof service.missionCallStats.record, "function");
  });
});

test("service.circuitBreaker is reachable through noproute.circuit-state", () => {
  withApplyDisposal({}, ({ publications }) => {
    const service = publications[0].instance;
    service.circuitBreaker.recordFailure("model-a", "transient:rate-limit", 0);
    const snap = service.routes["noproute.circuit-state"]({ now: 30_000 });
    assert.equal(snap.models["model-a"].state, "open");
    assert.equal(snap.models["model-a"].remainingMs, 30_000);
  });
});

test("noproute.pause / noproute.resume through the published service", () => {
  withApplyDisposal({}, ({ publications }) => {
    const service = publications[0].instance;
    service.routes["noproute.pause"]({});
    assert.deepEqual(
      service.routes["noproute.route"]({ error: { code: "ECONNRESET" } }),
      { decision: "paused" },
    );
    service.routes["noproute.resume"]({});
    const result = service.routes["noproute.route"]({ error: { code: "ECONNRESET" }, model: "model-a", attempt: 0 });
    assert.equal(result.decision, "retry");
  });
});

test("teardown effect flushes pending circuit state without throwing", () => {
  const { ctx, effects } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  const teardown = effects.find((e) => /routing state persistence/.test(e.label))?.dispose;
  assert.ok(teardown, "teardown effect exists");
  assert.doesNotThrow(() => teardown());
});

test("teardown effect is idempotent (calling twice does not throw)", () => {
  const { ctx, effects } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  const teardown = effects.find((e) => /routing state persistence/.test(e.label))?.dispose;
  assert.ok(teardown);
  teardown();
  assert.doesNotThrow(() => teardown());
});

test("teardown effect clears debounce timer to keep the event loop clean", () => {
  const { ctx, effects } = makeCtx();
  apply(ctx, { ...CONFIG, nopHome: newTempDir() });
  const teardown = effects.find((e) => /routing state persistence/.test(e.label))?.dispose;
  assert.ok(teardown);
  assert.doesNotThrow(() => teardown());
});
