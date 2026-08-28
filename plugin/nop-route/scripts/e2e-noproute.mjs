#!/usr/bin/env node
/**
 * e2e-noproute.mjs — M4-WI16 nop-route end-to-end gate (plan
 * docs/plans/multi-plugin-dsh/2026-08-28-1312-3-m4-wi16-nop-route-e2e.md;
 * design owner docs/design/multi-plugin-dsh-architecture.md §nop-route
 * Plugin Success Criterion 3).
 *
 * One real cordis runtime booted IN-PROCESS (@deepseek-ai/dsh-app-boot
 * `boot()` + the single-row test/fixtures/e2e-noproute.cordis.yml
 * composition — the real service module, non-isolated root realm so the
 * driver's `ctx.get('noproute')` resolves), then the four routes are
 * called for real with REAL-SHAPE upstream error samples:
 *
 *   noproute.classify   — every ErrorClass gets ≥1 real-shape sample
 *                         (7 classes + the `unknown` fallback = the design
 *                         routing table's 8-value set): network ECONNRESET
 *                         with code/errno/syscall, timeout ETIMEDOUT, HTTP
 *                         429 with a Retry-After header row, 401 invalid
 *                         key (redacted placeholder — zero credentials),
 *                         400 invalid_request, 402 insufficient quota, a
 *                         partial response cut mid `<AI_STEP_RESULT>` tag,
 *                         and a generic shape with no known marker.
 *   noproute.route      — the full sample set → all four RoutingDecision
 *                         kinds (retry / fallback / transform / give-up)
 *                         each hit ≥1, nextModel non-empty whenever the
 *                         decision carries one, plus the parameterized
 *                         legs (history-tainted fallback, budget-exhausted
 *                         give-up) the bare samples cannot reach.
 *   noproute.pick-model — three faces: default, fallback chain (default
 *                         model tainted), history-aware (chain-tail
 *                         exhaustion + most-recent-outcome recovery).
 *   noproute.health     — version + configured fallback chain + the error
 *                         histogram tallied EXACTLY from the classify/route
 *                         calls this run made, then resetHistogram() →
 *                         pre-reset snapshot returned, counters zeroed.
 *
 * Decision replay (determinism contract at the runtime face): every sample
 * and route payload is serialized to disk (JSON), read back, and re-called
 * — every decision must be bit-identical to the first pass.
 *
 * Headless degradation: the fixture has no webServer row, so the mount-log
 * line "nop-route mounted" AND the absent-webServer degrade line are
 * asserted through a cordis logger exporter installed at boot prepare
 * time, while the service stays resolvable to the end.
 *
 * Gate posture (Phase 1 Decision 2, nop-age verify:e2e family symmetry):
 * explicit local invocation — `npm --prefix plugin/nop-route run
 * verify:e2e`; NEVER wired into verify-age.sh L2 / age-ci.yml. Rationale:
 * WI18's closure definition is L1+L2+L2.5 (engine + plugin tests + truth
 * tables) — a real runtime boot leg is too heavy/flaky a face for the
 * deterministic CI chain, and determinism is already covered by the truth
 * tables. Residual risk (e2e regressions escape CI) is compensated by the
 * roadmap WI16 evidence pointer + the log record; M5-WI18 re-runs this
 * gate explicitly at closure.
 *
 * Environment-independent: zero model calls, zero credentials, zero
 * network, zero env gates. POSIX-only. Node >= 23.6 (in-source type
 * stripping for the .ts service import through the loader).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boot } from "@deepseek-ai/dsh-app-boot";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(PLUGIN_ROOT, "test", "fixtures", "e2e-noproute.cordis.yml");
const PKG = JSON.parse(readFileSync(join(PLUGIN_ROOT, "package.json"), "utf8"));

/** Must mirror the fixture service-row config (the health assertions pin against both). */
const CHAIN = {
  defaultModel: "zhipuai-coding-plan/glm-5.2",
  fallbackModels: ["zhipuai-coding-plan/glm-4.6"],
  maxRetries: 3,
};

/*
 * Real-shape upstream error samples — one per ErrorClass (7 classes + the
 * `unknown` fallback). Shapes are recorded from real upstream error forms
 * (Node socket errors carry code/errno/syscall; HTTP API errors carry
 * status + a machine code + message; the 429 carries its Retry-After
 * header row). ZERO live calls, ZERO credentials (the 401 message carries
 * a redacted placeholder, never a real key).
 */
const SAMPLES = [
  {
    id: "conn-reset",
    errorClass: "transient:network",
    error: { code: "ECONNRESET", errno: -54, syscall: "read", message: "read ECONNRESET" },
  },
  {
    id: "conn-timeout",
    errorClass: "transient:timeout",
    error: { code: "ETIMEDOUT", errno: -60, syscall: "connect", message: "connect ETIMEDOUT" },
  },
  {
    id: "http-429",
    errorClass: "transient:rate-limit",
    error: {
      status: 429,
      code: "too_many_requests",
      headers: { "retry-after": "7" },
      message: "Too many requests. Please retry after 7 seconds.",
    },
  },
  {
    id: "http-401",
    errorClass: "permanent:auth",
    error: {
      status: 401,
      code: "invalid_api_key",
      message: "Incorrect API key provided: sk-REDACTED.",
    },
  },
  {
    id: "http-400",
    errorClass: "permanent:invalid-input",
    error: {
      status: 400,
      code: "invalid_request_error",
      message: "Invalid request: max_tokens must be a positive integer.",
    },
  },
  {
    id: "http-402",
    errorClass: "permanent:budget",
    error: {
      status: 402,
      code: "insufficient_quota",
      message: "You exceeded your current quota; please review your plan and billing details.",
    },
  },
  {
    id: "partial-marker",
    errorClass: "partial:marker",
    error: {
      partial: true,
      message: "stream closed before the closing tag — step finished, marker still open <AI_STEP_RESULT>pass",
    },
  },
  {
    id: "generic-unknown",
    errorClass: "unknown",
    error: { message: "an unexpected internal condition occurred in the gateway" },
  },
];

const byId = (id) => SAMPLES.find((s) => s.id === id);

/** Base route payloads: the full classify sample set at attempt 0. */
const routeBasePayloads = () => SAMPLES.map((s) => ({ error: s.error, attempt: 0 }));

/** Parameterized route legs the bare samples cannot reach (history taint, exhausted budget). */
const routeExtraPayloads = () => [
  {
    label: "history-taint→fallback",
    payload: {
      error: byId("conn-reset").error,
      attempt: 0,
      history: [{ model: CHAIN.defaultModel, outcome: "failure" }],
    },
  },
  {
    label: "budget-exhausted→give-up",
    payload: {
      error: byId("conn-reset").error,
      attempt: CHAIN.maxRetries,
      history: [
        { model: CHAIN.defaultModel, outcome: "failure" },
        { model: CHAIN.fallbackModels[0], outcome: "failure" },
      ],
    },
  },
];

/* ── assertion helpers ─────────────────────────────────────────────────────── */

/** Canonical JSON (recursively sorted keys) — order-insensitive deep compare. */
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
};

function equal(failures, actual, expected, label) {
  const a = canonical(actual);
  const b = canonical(expected);
  if (a !== b) failures.push(`${label}: ${JSON.stringify(actual)} ≠ expected ${JSON.stringify(expected)}`);
}

function ok(failures, condition, label) {
  if (!condition) failures.push(label);
}

/* ── main ──────────────────────────────────────────────────────────────────── */

async function main() {
  const failures = [];
  const counts = {};
  const bump = (face) => { counts[face] = (counts[face] ?? 0) + 1; };

  const scratch = mkdtempSync(join(tmpdir(), "noproute-e2e-"));
  const logRows = []; // cordis logger exporter capture (mount + headless lines)

  console.log(`[e2e] booting the real cordis runtime (fixture ${FIXTURE})…`);
  const ctx = await boot("noproute-e2e", FIXTURE, [], (root) => {
    root.logger.exporter({
      export: (message) => { if (message?.name === "noproute") logRows.push(message); },
    });
  });
  let shutdownClean = false;
  try {
    /* ── service resolution ─────────────────────────────────────────────── */
    const svc = ctx.get("noproute");
    ok(failures, svc !== undefined && svc !== null, "ctx.get('noproute') did not resolve (root realm publication)");
    ok(failures, typeof svc?.routes?.["noproute.route"] === "function", "noproute.route not exposed");
    ok(failures, typeof svc?.routes?.["noproute.classify"] === "function", "noproute.classify not exposed");
    ok(failures, typeof svc?.routes?.["noproute.pick-model"] === "function", "noproute.pick-model not exposed");
    ok(failures, typeof svc?.routes?.["noproute.health"] === "function", "noproute.health not exposed");
    ok(failures, typeof svc?.resetHistogram === "function", "service resetHistogram not exposed");
    bump("resolution");

    /* ── noproute.classify — every ErrorClass ≥1 real-shape sample ──────── */
    const classifyResults = [];
    const classifiedClasses = new Set();
    for (const sample of SAMPLES) {
      const result = svc.routes["noproute.classify"]({ error: sample.error });
      equal(failures, result, { errorClass: sample.errorClass }, `classify(${sample.id})`);
      classifyResults.push(result);
      classifiedClasses.add(result.errorClass);
      bump("classify");
    }
    const expectedClasses = ["transient:network", "transient:rate-limit", "transient:timeout", "permanent:auth", "permanent:invalid-input", "permanent:budget", "partial:marker", "unknown"];
    for (const errorClass of expectedClasses) {
      ok(failures, classifiedClasses.has(errorClass), `classify coverage: no real-shape sample classified as ${errorClass}`);
    }
    console.log(`[e2e] classify: ${SAMPLES.length} real-shape samples, ${classifiedClasses.size}/8 ErrorClass values covered`);

    /* ── noproute.route — full sample set + parameterized legs ──────────── */
    const routeCalls = []; // { payload, decision } — replay re-uses the payloads
    for (const payload of routeBasePayloads()) {
      const decision = svc.routes["noproute.route"](payload);
      routeCalls.push({ payload, decision });
      bump("route");
    }
    for (const extra of routeExtraPayloads()) {
      const decision = svc.routes["noproute.route"](extra.payload);
      routeCalls.push({ payload: extra.payload, decision });
      bump("route");
    }

    // pinned discrimination details (sample literals → expected decisions)
    const decisionOf = (index) => routeCalls[index].decision;
    const dReset = decisionOf(SAMPLES.findIndex((s) => s.id === "conn-reset"));
    ok(failures, dReset.decision === "retry", `conn-reset base leg: decision ${dReset.decision} ≠ retry`);
    equal(failures, { model: dReset.model, source: dReset.source, delayMs: dReset.delayMs, nextAttempt: dReset.nextAttempt, historyExhausted: dReset.historyExhausted }, { model: CHAIN.defaultModel, source: "backoff", delayMs: 1000, nextAttempt: 1, historyExhausted: false }, "conn-reset base leg fields");
    const d429 = decisionOf(SAMPLES.findIndex((s) => s.id === "http-429"));
    ok(failures, d429.decision === "retry" && d429.source === "retry-after" && d429.delayMs === 7000, `http-429 leg: ${JSON.stringify({ decision: d429.decision, source: d429.source, delayMs: d429.delayMs })} ≠ retry/retry-after/7000 (Retry-After header wins over the backoff curve)`);
    const dPartial = decisionOf(SAMPLES.findIndex((s) => s.id === "partial-marker"));
    ok(failures, dPartial.decision === "transform" && dPartial.transformed?.extractedMarker === "pass", `partial-marker leg: ${JSON.stringify(dPartial)} ≠ transform with extractedMarker "pass"`);
    const dAuth = decisionOf(SAMPLES.findIndex((s) => s.id === "http-401"));
    ok(failures, dAuth.decision === "give-up" && dAuth.reason === "non-retryable", `http-401 leg: ${JSON.stringify({ decision: dAuth.decision, reason: dAuth.reason })} ≠ give-up/non-retryable`);

    // parameterized legs
    const dFallback = decisionOf(SAMPLES.length);
    ok(failures, dFallback.decision === "fallback" && dFallback.fromModel === CHAIN.defaultModel && dFallback.model === CHAIN.fallbackModels[0] && dFallback.errorClass === "transient:network", `history-taint leg: ${JSON.stringify(dFallback)} ≠ fallback ${CHAIN.defaultModel}→${CHAIN.fallbackModels[0]}`);
    const dExhausted = decisionOf(SAMPLES.length + 1);
    ok(failures, dExhausted.decision === "give-up" && dExhausted.reason === "max-retries" && dExhausted.attempt === CHAIN.maxRetries, `budget-exhausted leg: ${JSON.stringify(dExhausted)} ≠ give-up/max-retries@${CHAIN.maxRetries}`);

    // aggregate: all four RoutingDecision kinds ≥1 + nextModel non-empty when carried
    const kinds = new Set(routeCalls.map((c) => c.decision?.decision));
    for (const kind of ["retry", "fallback", "transform", "give-up"]) {
      ok(failures, kinds.has(kind), `route coverage: no sample reached RoutingDecision "${kind}"`);
    }
    for (const call of routeCalls) {
      if (call.decision?.decision === "retry" || call.decision?.decision === "fallback") {
        ok(failures, typeof call.decision.model === "string" && call.decision.model.length > 0, `route ${call.decision.decision} decision carries no next model (${JSON.stringify(call.decision)})`);
      }
    }
    console.log(`[e2e] route: ${routeCalls.length} calls, RoutingDecision kinds hit: ${[...kinds].sort().join(", ")}`);

    /* ── noproute.pick-model — default / fallback chain / history-aware ─── */
    const pmDefault = svc.routes["noproute.pick-model"]({});
    equal(failures, pmDefault, { model: CHAIN.defaultModel, reasoningEffort: null, expectedTokenBudget: 8192, source: "default", fallbackIndex: -1, historyExhausted: false }, "pick-model default face");
    const pmFallback = svc.routes["noproute.pick-model"]({ history: [{ model: CHAIN.defaultModel, outcome: "failure" }] });
    equal(failures, pmFallback, { model: CHAIN.fallbackModels[0], reasoningEffort: null, expectedTokenBudget: 8192, source: "fallback", fallbackIndex: 0, historyExhausted: false }, "pick-model fallback-chain face (default tainted)");
    const pmExhausted = svc.routes["noproute.pick-model"]({ history: [...CHAIN.fallbackModels, CHAIN.defaultModel].map((model) => ({ model, outcome: "failure" })) });
    equal(failures, pmExhausted, { model: CHAIN.defaultModel, reasoningEffort: null, expectedTokenBudget: 8192, source: "default", fallbackIndex: -1, historyExhausted: true }, "pick-model history-aware face (chain-tail exhaustion → chain head)");
    const pmRecovered = svc.routes["noproute.pick-model"]({ history: [{ model: CHAIN.defaultModel, outcome: "failure" }, { model: CHAIN.defaultModel, outcome: "success" }] });
    equal(failures, pmRecovered, { model: CHAIN.defaultModel, reasoningEffort: null, expectedTokenBudget: 8192, source: "default", fallbackIndex: -1, historyExhausted: false }, "pick-model history-aware face (most-recent outcome untaints)");
    counts["pick-model"] = 4;
    console.log("[e2e] pick-model: default / fallback-chain / history-aware (exhaustion + recovery) faces pinned");

    /* ── decision replay — serialize to disk, reload, bit-identical ─────── */
    const replayFile = join(scratch, "replay-input.json");
    const replayInput = {
      classify: SAMPLES.map((s) => ({ error: s.error })),
      route: routeCalls.map((c) => c.payload),
    };
    writeFileSync(replayFile, JSON.stringify(replayInput, null, 2), "utf8");
    const reloaded = JSON.parse(readFileSync(replayFile, "utf8"));
    let replayIdentical = 0;
    reloaded.classify.forEach((payload, i) => {
      const again = svc.routes["noproute.classify"](payload);
      if (JSON.stringify(again) !== JSON.stringify(classifyResults[i])) {
        failures.push(`replay classify #${i}: ${JSON.stringify(again)} ≠ first pass ${JSON.stringify(classifyResults[i])}`);
      } else {
        replayIdentical += 1;
      }
      bump("classify-replay");
    });
    reloaded.route.forEach((payload, i) => {
      const again = svc.routes["noproute.route"](payload);
      if (JSON.stringify(again) !== JSON.stringify(routeCalls[i].decision)) {
        failures.push(`replay route #${i}: ${JSON.stringify(again)} ≠ first pass ${JSON.stringify(routeCalls[i].decision)}`);
      } else {
        replayIdentical += 1;
      }
      bump("route-replay");
    });
    console.log(`[e2e] replay: ${replayIdentical}/${reloaded.classify.length + reloaded.route.length} serialized-then-reloaded decisions bit-identical`);

    /* ── noproute.health — version + chain + histogram tally + reset ────── */
    const expectedTally = {};
    const record = (errorClass) => { expectedTally[errorClass] = (expectedTally[errorClass] ?? 0) + 1; };
    for (const sample of SAMPLES) record(sample.errorClass); // classify pass 1
    for (const call of routeCalls) record(call.decision.errorClass); // route pass 1
    const expectedHistogram = {}; // replay doubles every record
    for (const [errorClass, n] of Object.entries(expectedTally)) expectedHistogram[errorClass] = n * 2;

    const health = svc.routes["noproute.health"]();
    equal(failures, health.version, PKG.version, "health version ≠ package.json version");
    equal(failures, health.defaultModel, CHAIN.defaultModel, "health defaultModel ≠ fixture config");
    equal(failures, health.fallbackChain, [CHAIN.defaultModel, ...CHAIN.fallbackModels], "health fallbackChain ≠ configured chain");
    equal(failures, health.maxRetries, CHAIN.maxRetries, "health maxRetries ≠ fixture config");
    equal(failures, health.errorHistogram, expectedHistogram, "health errorHistogram ≠ tally of the classify/route calls this run made (incl. replay)");
    console.log(`[e2e] health: version ${health.version}, chain ${health.fallbackChain.join(" → ")}, histogram ${JSON.stringify(health.errorHistogram)}`);

    const preReset = svc.resetHistogram();
    equal(failures, preReset, expectedHistogram, "resetHistogram pre-reset snapshot ≠ live tally");
    equal(failures, svc.routes["noproute.health"]().errorHistogram, {}, "histogram not zeroed after reset");
    svc.routes["noproute.classify"]({ error: byId("http-429").error });
    equal(failures, svc.routes["noproute.health"]().errorHistogram, { "transient:rate-limit": 1 }, "histogram does not accumulate after reset");
    counts["health"] = 3;
    console.log("[e2e] health reset: pre-reset snapshot returned, counters zeroed, accumulation resumes");

    /* ── headless degradation — mount log + degrade line + service alive ── */
    const mountRow = logRows.find((m) => m.args?.[0] === "nop-route mounted");
    ok(failures, mountRow !== undefined, "no 'nop-route mounted' log row captured (webServer-less composition)");
    if (mountRow) {
      const fields = mountRow.args[1] ?? {};
      equal(failures, { package: fields.package, realm: fields.realm, service: fields.service }, { package: "nop-route", realm: "nopRoute", service: "noproute" }, "mount log fields");
    }
    const degradeRow = logRows.find((m) => /webServer service absent/.test(String(m.args?.[0] ?? "")));
    ok(failures, degradeRow !== undefined, "no headless degrade log row captured (expected 'webServer service absent' posture line)");
    ok(failures, ctx.get("noproute") !== undefined, "noproute service stopped resolving after the headless run");
    counts["headless"] = 2;
    console.log(`[e2e] headless: mount log + degrade line captured (${logRows.length} noproute log rows), service still resolvable`);

    /* ── clean shutdown ─────────────────────────────────────────────────── */
    await ctx.fiber.dispose();
    shutdownClean = true;
    console.log("[e2e] cordis runtime disposed cleanly");
  } catch (err) {
    failures.push(`fatal: ${err?.stack ?? err}`);
  } finally {
    if (!shutdownClean) {
      try { await ctx.fiber.dispose(); } catch { /* shutdown after a fatal is best-effort */ }
    }
  }

  console.log("");
  const faceSummary = Object.entries(counts).map(([face, n]) => `${face}=${n}`).join(" ");
  if (failures.length === 0) {
    console.log(`[e2e] SUMMARY: PASS — four-route real calls green (${faceSummary}) + replay bit-identical + headless degradation asserted + health tally/reset pinned + clean shutdown`);
    rmSync(scratch, { recursive: true, force: true });
    return 0;
  }
  console.error(`[e2e] SUMMARY: FAIL — ${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`[e2e] scratch kept at ${scratch}`);
  return 1;
}

const invokedPath = process.argv[1];
const isDirectRun = typeof invokedPath === "string" && resolve(invokedPath) === fileURLToPath(new URL(import.meta.url));
if (isDirectRun) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[e2e] FATAL: ${err?.stack ?? err}`);
      process.exit(1);
    },
  );
}
