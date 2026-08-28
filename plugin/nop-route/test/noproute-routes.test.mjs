/**
 * noproute-routes.test.mjs — wire routes + HTTP dispatcher unit suite
 * (multi-plugin-dsh M4-WI14; stub ctx / logger / webServer — direct record
 * calls + fake HTTP dispatcher, zero network, zero credentials, zero real
 * host; mdcontrol-routes.test.mjs precedent).
 *
 * Branches pinned (plan Phase 2 items):
 *   1. the four methods, one positive each (sync contract);
 *   2. parameter missing/malformed deny shapes (structured wire errors);
 *   3. HTTP dispatcher registration branch (webServer present — prefix
 *      registration shape) and the absent-webServer degrade log branch;
 *      envelope shapes incl. 405/404/400 over the fake req/res face;
 *   4. the health histogram read/write face through the injected state
 *      object (route/classify accumulate, health reads, reset travels
 *      with the owner).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createErrorHistogram,
  createNopRouteRoutes,
  NopRouteError,
  registerNopRouteHttpDispatcher,
} from "../src/noproute-routes.ts";

const CONFIG = { defaultModel: "model-a", maxRetries: 2, fallbackModels: ["model-b"] };

function makeRoutes(options = {}) {
  const logs = [];
  const logger = {
    info: (m, f) => logs.push({ level: "info", m, f }),
    warn: (m, f) => logs.push({ level: "warn", m, f }),
  };
  const histogram = options.histogram ?? createErrorHistogram();
  const routes = createNopRouteRoutes({ config: CONFIG, histogram, logger, ...options });
  return { routes, logs, histogram };
}

// ── 1. The four routes (sync contract) ───────────────────────────────────────

test("noproute.route: transient first failure → sync Retry decision (no promise)", () => {
  const { routes } = makeRoutes();
  const result = routes["noproute.route"]({ error: { code: "ECONNRESET" }, model: "model-a", attempt: 0 });
  assert.equal(result instanceof Promise, false, "sync contract");
  assert.equal(result.decision, "retry");
  assert.equal(result.model, "model-a");
  assert.equal(result.delayMs, 1000);
});

test("noproute.route: tainted model → Fallback carrying the next model", () => {
  const { routes } = makeRoutes();
  const result = routes["noproute.route"]({
    error: { status: 503 },
    model: "model-a",
    attempt: 0,
    history: [{ model: "model-a", outcome: "failure" }],
  });
  assert.equal(result.decision, "fallback");
  assert.equal(result.model, "model-b");
  assert.equal(result.fromModel, "model-a");
});

test("noproute.classify: error → ErrorClass (sync)", () => {
  const { routes } = makeRoutes();
  const result = routes["noproute.classify"]({ error: { status: 429 } });
  assert.deepEqual(result, { errorClass: "transient:rate-limit" });
  assert.equal(result instanceof Promise, false, "sync contract");
});

test("noproute.pick-model: request descriptor → ModelSelection (sync)", () => {
  const { routes } = makeRoutes();
  const result = routes["noproute.pick-model"]({
    preferredModel: "model-b",
    history: [{ model: "model-b", outcome: "failure" }],
  });
  assert.equal(result.model, "model-a");
  assert.equal(result.source, "default");
  assert.equal(result.reasoningEffort, null);
  assert.equal(result instanceof Promise, false, "sync contract");
});

test("noproute.health: version + fallback chain + maxRetries", () => {
  const { routes } = makeRoutes();
  const health = routes["noproute.health"]();
  assert.equal(health.version, "0.1.0");
  assert.equal(health.defaultModel, "model-a");
  assert.deepEqual(health.fallbackChain, ["model-a", "model-b"]);
  assert.equal(health.maxRetries, 2);
  assert.deepEqual(health.errorHistogram, {});
});

// ── 2. Parameter validation deny shapes ─────────────────────────────────────

test("noproute.route: missing error key → bad-request wire error", () => {
  const { routes } = makeRoutes();
  assert.throws(() => routes["noproute.route"]({ model: "model-a" }), (err) => {
    assert.ok(err instanceof NopRouteError);
    assert.equal(err.code, "bad-request");
    assert.match(err.message, /missing "error"/);
    return true;
  });
});

test("noproute.route: malformed attempt / model / history / effort → bad-request", () => {
  const { routes } = makeRoutes();
  assert.throws(() => routes["noproute.route"]({ error: {}, attempt: -1 }), /"attempt".*non-negative/);
  assert.throws(() => routes["noproute.route"]({ error: {}, attempt: 1.5 }), /"attempt".*non-negative/);
  assert.throws(() => routes["noproute.route"]({ error: {}, model: "" }), /"model".*non-empty/);
  assert.throws(() => routes["noproute.route"]({ error: {}, model: 42 }), /"model".*non-empty/);
  assert.throws(() => routes["noproute.route"]({ error: {}, history: "nope" }), /"history".*array/);
  assert.throws(
    () => routes["noproute.route"]({ error: {}, history: [{ model: "m", outcome: "maybe" }] }),
    /history\[0\]/,
  );
  assert.throws(() => routes["noproute.route"]({ error: {}, reasoningEffort: "extreme" }), /reasoningEffort/);
  assert.throws(() => routes["noproute.route"]({ error: {}, expectedTokens: 0 }), /expectedTokens/);
});

test("noproute.classify: missing error key → bad-request; null error value is accepted", () => {
  const { routes } = makeRoutes();
  assert.throws(() => routes["noproute.classify"]({}), /missing "error"/);
  assert.deepEqual(routes["noproute.classify"]({ error: null }), { errorClass: "unknown" });
});

test("noproute.pick-model: malformed history entries → bad-request", () => {
  const { routes } = makeRoutes();
  assert.throws(
    () => routes["noproute.pick-model"]({ history: [{ outcome: "success" }] }),
    /history\[0\]/,
  );
  assert.throws(
    () => routes["noproute.pick-model"]({ preferredModel: "" }),
    /"preferredModel".*non-empty/,
  );
});

test("factory: config without defaultModel throws (mount-time fail-fast)", () => {
  assert.throws(() => createNopRouteRoutes({ config: { maxRetries: 3 } }), /defaultModel/);
  assert.throws(() => createNopRouteRoutes({ config: { defaultModel: "" } }), /defaultModel/);
});

// ── 3. HTTP dispatcher branches ─────────────────────────────────────────────

function fakeReq(method, url, body) {
  const chunks = body === undefined ? [] : [body];
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  };
}

function fakeRes() {
  const out = { status: null, headers: null, body: "" };
  return {
    out,
    writeHead(status, headers) {
      out.status = status;
      out.headers = headers;
    },
    end(body) {
      out.body = body ?? "";
    },
  };
}

function makeHttp(routes) {
  const registered = [];
  const webServer = {
    register(route) {
      registered.push(route);
      return () => {};
    },
  };
  const dispose = registerNopRouteHttpDispatcher(
    { get: (name) => (name === "webServer" ? webServer : undefined) },
    routes,
  );
  assert.ok(dispose);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].kind, "prefix");
  assert.equal(registered[0].path, "/noproute/api");
  return registered[0].handler;
}

test("HTTP dispatcher: registration shape + success envelope over all four methods", async () => {
  const { routes } = makeRoutes();
  const handler = makeHttp(routes);

  const routeRes = fakeRes();
  await handler(fakeReq("POST", "/noproute/api/noproute.route", JSON.stringify({ error: { status: 429 } })), routeRes);
  assert.equal(routeRes.out.status, 200);
  assert.equal(routeRes.out.headers["content-type"], "application/json; charset=utf-8");
  const routeBody = JSON.parse(routeRes.out.body);
  assert.equal(routeBody.ok, true);
  assert.equal(routeBody.value.decision, "retry");
  assert.equal(routeBody.value.errorClass, "transient:rate-limit");

  const classifyRes = fakeRes();
  await handler(fakeReq("POST", "/noproute/api/noproute.classify", JSON.stringify({ error: { status: 401 } })), classifyRes);
  assert.equal(JSON.parse(classifyRes.out.body).value.errorClass, "permanent:auth");

  const pickRes = fakeRes();
  await handler(fakeReq("POST", "/noproute/api/noproute.pick-model", JSON.stringify({})), pickRes);
  assert.equal(JSON.parse(pickRes.out.body).value.model, "model-a");

  const healthRes = fakeRes();
  await handler(fakeReq("POST", "/noproute/api/noproute.health"), healthRes);
  const healthValue = JSON.parse(healthRes.out.body).value;
  assert.equal(healthValue.version, "0.1.0");
  assert.deepEqual(healthValue.errorHistogram, {
    "permanent:auth": 1,
    "transient:rate-limit": 1,
  }, "dispatcher-mediated calls accumulate the histogram");
});

test("HTTP dispatcher: 405 GET, 404 unknown method, 400 wire error and bad JSON", async () => {
  const { routes } = makeRoutes();
  const handler = makeHttp(routes);

  const getRes = fakeRes();
  await handler(fakeReq("GET", "/noproute/api/noproute.health"), getRes);
  assert.equal(getRes.out.status, 405);
  assert.equal(JSON.parse(getRes.out.body).error.code, "bad-request");

  const notFoundRes = fakeRes();
  await handler(fakeReq("POST", "/noproute/api/noproute.nope", "{}"), notFoundRes);
  assert.equal(notFoundRes.out.status, 404);
  assert.equal(JSON.parse(notFoundRes.out.body).error.code, "not-found");

  const badShapeRes = fakeRes();
  await handler(fakeReq("POST", "/noproute/api/noproute.route", JSON.stringify({})), badShapeRes);
  assert.equal(badShapeRes.out.status, 400);
  const badShapeBody = JSON.parse(badShapeRes.out.body);
  assert.equal(badShapeBody.ok, false);
  assert.equal(badShapeBody.error.code, "bad-request");
  assert.match(badShapeBody.error.message, /missing "error"/);

  const badJsonRes = fakeRes();
  await handler(fakeReq("POST", "/noproute/api/noproute.classify", "{not json"), badJsonRes);
  assert.equal(badJsonRes.out.status, 400);
  assert.equal(JSON.parse(badJsonRes.out.body).error.code, "bad-request");
});

test("HTTP dispatcher: absent webServer → null + degrade log line, never a throw", () => {
  const logs = [];
  const { routes } = makeRoutes();
  const dispose = registerNopRouteHttpDispatcher({ get: () => undefined }, routes, {
    info: (m, f) => logs.push({ m, f }),
  });
  assert.equal(dispose, null);
  assert.ok(logs.some(({ m, f }) => /webServer service absent/.test(m) && f?.prefix === "/noproute/api"));
});

// ── 4. Histogram read/write face (injected state object) ────────────────────

test("histogram: route/classify call sites accumulate; health reads the same state", () => {
  const { routes } = makeRoutes();
  routes["noproute.classify"]({ error: { status: 429 } });
  routes["noproute.classify"]({ error: { status: 429 } });
  routes["noproute.classify"]({ error: { status: 401 } });
  routes["noproute.route"]({ error: { code: "ETIMEDOUT" }, attempt: 0 });
  assert.deepEqual(routes["noproute.health"]().errorHistogram, {
    "permanent:auth": 1,
    "transient:rate-limit": 2,
    "transient:timeout": 1,
  });
});

test("histogram: pick-model records nothing (no error face)", () => {
  const { routes } = makeRoutes();
  routes["noproute.pick-model"]({ history: [] });
  routes["noproute.pick-model"]({});
  assert.deepEqual(routes["noproute.health"]().errorHistogram, {});
});

test("histogram: injected instance is the one mutated (service ownership boundary)", () => {
  const histogram = createErrorHistogram();
  const { routes } = makeRoutes({ histogram });
  routes["noproute.classify"]({ error: { partial: true } });
  assert.deepEqual(histogram.snapshot(), { "partial:marker": 1 });
  const before = histogram.reset();
  assert.deepEqual(before, { "partial:marker": 1 });
  assert.deepEqual(routes["noproute.health"]().errorHistogram, {});
});

test("histogram: snapshot keys are sorted (stable dump face)", () => {
  const histogram = createErrorHistogram();
  histogram.record("transient:timeout");
  histogram.record("permanent:auth");
  histogram.record("transient:rate-limit");
  assert.deepEqual(Object.keys(histogram.snapshot()), [
    "permanent:auth",
    "transient:rate-limit",
    "transient:timeout",
  ]);
});
