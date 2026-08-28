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
import { apply, NopRouteService } from "../src/service.ts";

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
    effect: (fn, label) => effects.push({ fn, label }),
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
  apply(ctx, CONFIG);
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
  apply(ctx, CONFIG);
  const service = publications[0].instance;
  assert.deepEqual(service.routes["noproute.classify"]({ error: { status: 429 } }), {
    errorClass: "transient:rate-limit",
  });
  assert.equal(service.routes["noproute.health"]().defaultModel, "model-a");
});

// ── Mount log ────────────────────────────────────────────────────────────────

test("mount log carries the nop-route package name and nopRoute realm", () => {
  const { ctx, logs } = makeCtx();
  apply(ctx, CONFIG);
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
  apply(ctx, CONFIG);
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
  apply(ctx, CONFIG);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].kind, "prefix");
  assert.equal(registered[0].path, "/noproute/api");
  assert.equal(effects.length, 1, "route disposer parked via ctx.effect");
  assert.match(effects[0].label, /noproute: \/noproute\/api routes/);
});

// ── Histogram accumulate / reset (three faces: accumulate, read, reset) ──────

test("histogram accumulates at route/classify call sites and reads through health", () => {
  const { ctx, publications } = makeCtx();
  apply(ctx, CONFIG);
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
  apply(ctx, CONFIG);
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
  apply(ctx, CONFIG);
  const service = publications[0].instance;
  service.histogram.record("unknown");
  assert.deepEqual(service.routes["noproute.health"]().errorHistogram, { unknown: 1 });
});

// ── Zero-dispatch discipline ─────────────────────────────────────────────────

test("apply never injects the agents service (zero host-call discipline)", () => {
  const { ctx, injects } = makeCtx();
  apply(ctx, CONFIG);
  assert.ok(injects.every(({ deps }) => !deps.includes("agents")), "agents inject must not appear");
});
