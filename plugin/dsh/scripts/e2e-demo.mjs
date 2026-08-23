#!/usr/bin/env node
/**
 * e2e-demo.mjs — L4 dual-leg end-to-end demo-mission run (dsh-plugin
 * M2-WI10, plan `2026-08-23-1621-2` Phase 2; P2 gate evidence producer).
 *
 * Legs (same scratch demo mission + same flow, same scripted model policy —
 * e2e-policy.mjs):
 *
 *   CLI leg    — the REAL standalone engine (`tools/mission-driver/src/main.js
 *               demo`, ProcessExecutor backend) spawned as a child process,
 *               with an executable `opencode` stub FIRST on PATH (the WI3
 *               driver whitelist pins the driver NAME, so the hermetic stub
 *               must wear it; prompt arrives as the last argv element,
 *               opencode promptMode "arg"). `opencode session list` → `[]`.
 *   native leg — a REAL cordis runtime booted IN-PROCESS
 *               (@deepseek-ai/dsh-app-boot `boot()` + the 15-row
 *               test/fixtures/e2e.cordis.yml composition incl. the real
 *               mission-control service row) over a local scripted SSE model
 *               endpoint (1621-1 keyless stub precedent); the routes are
 *               called directly through `ctx.get('mdcontrol')`:
 *               mdcontrol.run → immediate {runId, status:'started'} →
 *               mdcontrol.status polled to terminal → mdcontrol.list.
 *
 * Assertions (P2 gate):
 *   1. mdcontrol.run returns immediately; the run reaches terminal
 *      `completed` with exitCode 0.
 *   2. Dual-leg normalized run-state diff (matrix-harness normalizeRunState
 *      vocabulary) is EMPTY — shape identity; divergences allowed only in
 *      the type-only exemption fields (sessionId value semantics R3 §3,
 *      timing, error text, log/prompt basenames — ledger D1/D2/D3).
 *   3. markers parsed EXPLICITLY: every AI step in BOTH legs has a marker
 *      field with a value valid for that step's transitions (not implied by
 *      the shape diff).
 *   4. correction-retry exercised once artificially: the REVIEW step's first
 *      scripted response carries an invalid marker (`banana`); the engine's
 *      correction re-prompt is OBSERVED (native leg: stub request log;
 *      CLI leg: engine log line) and the run still completes (recovery).
 *
 * Gate posture (R3 §5 form, 1621-1 verify:native precedent): explicit local
 * invocation — `npm --prefix plugin/dsh run verify:e2e`; never wired into
 * verify-age.sh / age-ci.yml; zero credentials, zero external network (the
 * stub model endpoint is 127.0.0.1). POSIX-only (PATH separator, ps-free but
 * chmod-exec stub) like the sibling harness scripts. Node >= 23.6 (in-source
 * type stripping for the .ts service import through the loader).
 *
 * Flags: --keep (preserve the scratch root + report for manual monitor
 * inspection), --scratch <dir> (reuse an existing prepared root).
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { boot } from "@deepseek-ai/dsh-app-boot";
import {
  CORRECTION_PHRASE,
  BROKEN_MARKER,
  lastUserTextOfChatBody,
  policyForPrompt,
  stubResponseText,
} from "./e2e-policy.mjs";
import { normalizeRunState } from "../test/helpers/matrix-harness.mjs";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const ENGINE_MAIN = join(REPO_ROOT, "tools", "mission-driver", "src", "main.js");
const E2E_FIXTURE = join(PLUGIN_ROOT, "test", "fixtures", "e2e.cordis.yml");
const TERMINAL_TIMEOUT_MS = 120_000;

/* ── scratch demo mission ─────────────────────────────────────────────────── */

const FLOW_STEPS = {
  CHECK: {
    type: "agent",
    prompt: "Execute the CHECK step of the e2e demo mission.\nSTEP-TOKEN-CHECK\nReply with the step result marker only:\n<AI_STEP_RESULT>pass</AI_STEP_RESULT> or <AI_STEP_RESULT>fail</AI_STEP_RESULT>",
    transitions: { pass: { goto: "REVIEW" }, fail: { done: "failed" } },
    onError: { done: "failed" },
  },
  REVIEW: {
    type: "agent",
    prompt: "Execute the REVIEW step of the e2e demo mission.\nSTEP-TOKEN-REVIEW\nReply with the step result marker only:\n<AI_STEP_RESULT>pass</AI_STEP_RESULT> or <AI_STEP_RESULT>fail</AI_STEP_RESULT>",
    onUnknownMaxRetries: 2,
    transitions: { pass: { goto: "EXEC" }, fail: { done: "failed" } },
    onError: { done: "failed" },
  },
  EXEC: {
    type: "tool",
    command: "echo mdcontrol-e2e-exec",
    transitions: { pass: { goto: "DONE" }, fail: { done: "failed" } },
  },
  DONE: {
    type: "agent",
    prompt: "Execute the DONE step of the e2e demo mission.\nSTEP-TOKEN-DONE\nReply with the step result marker only:\n<AI_STEP_RESULT>pass</AI_STEP_RESULT> or <AI_STEP_RESULT>fail</AI_STEP_RESULT>",
    transitions: { pass: { done: "completed" }, fail: { done: "failed" } },
    onError: { done: "failed" },
  },
};

function prepareScratch(root) {
  mkdirSync(join(root, "missions", "flows"), { recursive: true });
  mkdirSync(join(root, "docs", "backlog"), { recursive: true });
  mkdirSync(join(root, "docs", "plans"), { recursive: true });
  writeFileSync(join(root, "missions", "demo.json"), JSON.stringify({
    name: "demo",
    description: "L4 e2e demo mission (dsh-plugin M2-WI10)",
    roadmapPath: "docs/backlog/demo-roadmap.md",
    plansDir: "docs/plans",
    flowName: "demo",
    // Flows through config.model into the native agentOptions (provider
    // defaults to deepseek-official → the composition's dsh-llm-deepseek row).
    model: "deepseek-v4-flash",
    commands: { test: "echo ok" },
  }, null, 2), "utf8");
  writeFileSync(join(root, "missions", "flows", "demo.json"), JSON.stringify({
    name: "demo",
    entry: "CHECK",
    steps: FLOW_STEPS,
  }, null, 2), "utf8");
  writeFileSync(join(root, "docs", "backlog", "demo-roadmap.md"), [
    "# Demo Roadmap (e2e scratch)",
    "",
    "- WI1 demo step chain: CHECK → REVIEW → EXEC → DONE",
  ].join("\n"), "utf8");
}

/** Valid marker vocabulary per step, from the flow definition. */
function validMarkersOf(stepName) {
  return Object.keys(FLOW_STEPS[stepName]?.transitions ?? {});
}

/* ── CLI leg ──────────────────────────────────────────────────────────────── */

function writeCliStub(root) {
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const stub = join(binDir, "opencode");
  const policyUrl = pathToFileURL(join(PLUGIN_ROOT, "scripts", "e2e-policy.mjs")).href;
  writeFileSync(stub, [
    "#!/usr/bin/env node",
    `import { policyForPrompt, stubResponseText } from ${JSON.stringify(policyUrl)};`,
    "const argv = process.argv.slice(2);",
    "if (argv[0] === 'session') { process.stdout.write('[]\\n'); process.exit(0); }",
    "const prompt = argv[argv.length - 1] ?? '';",
    "const policy = policyForPrompt(prompt);",
    "if (policy === null) { console.error('e2e opencode stub: no policy matched the prompt'); process.exit(1); }",
    "process.stdout.write(stubResponseText(policy) + '\\n');",
    "",
  ].join("\n"), "utf8");
  chmodSync(stub, 0o755);
  return binDir;
}

async function runCliLeg(root, report) {
  const binDir = writeCliStub(root);
  console.log("[e2e] CLI leg: spawning the real standalone engine (ProcessExecutor backend)…");
  const child = spawn(process.execPath, [
    ENGINE_MAIN, "demo",
    "--dir", root,
    "--run-dir", "cli-e2e-mission-driver",
  ], {
    cwd: REPO_ROOT,
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const exit = await new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit({ code, signal })));
  writeFileSync(join(root, "cli-leg-stdout.log"), stdout, "utf8");
  writeFileSync(join(root, "cli-leg-stderr.log"), stderr, "utf8");

  const failures = [];
  if (exit.code !== 0) failures.push(`CLI leg exit code ${exit.code} (signal ${exit.signal}) — expected 0`);
  const runStatePath = join(root, "_tmp", "cli-e2e-mission-driver", "run-state.json");
  if (!existsSync(runStatePath)) failures.push(`CLI leg wrote no run-state at ${runStatePath}`);
  if (!stdout.includes(`correction retry 1/2`)) failures.push("CLI leg: engine correction-retry log line not observed");
  if (!stdout.includes(`"${BROKEN_MARKER}" not in transitions`)) failures.push("CLI leg: artificial marker break not observed in engine log");

  const runState = existsSync(runStatePath) ? JSON.parse(readFileSync(runStatePath, "utf8")) : null;
  report.cliLeg = {
    exitCode: exit.code,
    signal: exit.signal,
    runStatePath,
    correctionRetryObserved: stdout.includes("correction retry 1/2"),
    artificialBreakObserved: stdout.includes(`"${BROKEN_MARKER}" not in transitions`),
  };
  return { failures, runState };
}

/* ── scripted SSE model endpoint (native leg) ─────────────────────────────── */

function createScriptedModelServer() {
  const requests = []; // { lastUserText, policyKind, marker, artificialBreak }
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const lastUserText = lastUserTextOfChatBody(body);
      const policy = policyForPrompt(lastUserText ?? "");
      if (policy === null) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "e2e stub model: no policy matched the last user message" } }));
        return;
      }
      requests.push({
        lastUserText: (lastUserText ?? "").slice(0, 200),
        policyKind: policy.kind,
        marker: policy.marker,
        artificialBreak: policy.artificialBreak,
      });
      const content = stubResponseText(policy);
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('data: {"choices":[{"delta":{"role":"assistant","content":null}}]}\n\n');
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      response.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n');
      response.end("data: [DONE]\n\n");
    });
  });
  return { server, requests };
}

/* ── native leg ───────────────────────────────────────────────────────────── */

async function runNativeLeg(root, report) {
  const stub = createScriptedModelServer();
  await new Promise((resolveListen) => stub.server.listen(0, "127.0.0.1", resolveListen));
  const port = stub.server.address().port;
  const sessionsDir = join(root, "dsh-sessions");
  mkdirSync(sessionsDir, { recursive: true });

  process.env.DSH_CWD = root;
  process.env.DSH_SESSION_ROOT = sessionsDir;
  process.env.DEEPSEEK_API_KEY = "e2e-stub-no-call";
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${port}`;

  console.log(`[e2e] native leg: booting the real cordis runtime (fixture e2e.cordis.yml, stub model on 127.0.0.1:${port})…`);
  const ctx = await boot("mdcontrol-e2e", E2E_FIXTURE);
  const failures = [];
  try {
    const svc = ctx.get("mdcontrol");
    if (!svc || typeof svc.routes?.["mdcontrol.run"] !== "function") {
      throw new Error("mdcontrol service not published at the root realm (ctx.get('mdcontrol') undefined)");
    }

    const t0 = Date.now();
    const started = await svc.routes["mdcontrol.run"]({
      projectRoot: root,
      args: { mission: "demo", runDir: "native-e2e-mission-driver" },
    });
    const elapsedMs = Date.now() - t0;
    console.log(`[e2e] mdcontrol.run resolved in ${elapsedMs}ms → ${JSON.stringify(started)}`);
    if (started.status !== "started" || started.runId !== "native-e2e-mission-driver") {
      failures.push(`mdcontrol.run returned ${JSON.stringify(started)} — expected { runId: 'native-e2e-mission-driver', status: 'started' }`);
    }

    const immediate = await svc.routes["mdcontrol.status"]({ projectRoot: root, runId: "native-e2e-mission-driver" });
    if (!immediate.live || immediate.terminal !== null) {
      failures.push(`run already terminal at resolve time — async contract violated: ${JSON.stringify({ live: immediate.live, terminal: immediate.terminal })}`);
    }

    const terminal = await waitForTerminal(svc, root, "native-e2e-mission-driver");
    console.log(`[e2e] mdcontrol.status terminal: ${JSON.stringify(terminal.terminal)}`);
    if (terminal.terminal.exitCode !== 0 || terminal.terminal.status !== "completed") {
      failures.push(`native leg terminal ${JSON.stringify(terminal.terminal)} — expected exitCode 0 / completed`);
    }

    const list = await svc.routes["mdcontrol.list"]({ projectRoot: root });
    const listed = new Set(list.runs.map((r) => r.runId));
    for (const id of ["cli-e2e-mission-driver", "native-e2e-mission-driver"]) {
      if (!listed.has(id)) failures.push(`mdcontrol.list missing runId ${id} (got ${[...listed].join(", ")})`);
    }

    const runStatePath = join(root, "_tmp", "native-e2e-mission-driver", "run-state.json");
    const runState = existsSync(runStatePath) ? JSON.parse(readFileSync(runStatePath, "utf8")) : null;
    if (!runState) failures.push(`native leg wrote no run-state at ${runStatePath}`);

    const kinds = stub.requests.map((r) => r.policyKind);
    console.log(`[e2e] stub model served ${stub.requests.length} request(s): ${kinds.join(" → ")}`);
    if (stub.requests.length !== 4) {
      failures.push(`stub model served ${stub.requests.length} requests (${kinds.join(",")}) — expected exactly 4 (CHECK, REVIEW-break, correction, DONE)`);
    }
    const breaks = stub.requests.filter((r) => r.artificialBreak);
    const corrections = stub.requests.filter((r) => r.policyKind === "correction");
    if (breaks.length !== 1) failures.push(`artificial marker break fired ${breaks.length} times — expected exactly 1`);
    if (corrections.length !== 1) failures.push(`correction re-prompt observed ${corrections.length} times — expected exactly 1`);

    report.nativeLeg = {
      elapsedMs,
      runStatePath,
      stubRequests: stub.requests,
      listRunIds: [...listed],
    };
    return { failures, runState };
  } finally {
    await ctx.fiber.dispose().catch(() => {});
    await new Promise((resolveClose) => stub.server.close(() => resolveClose()));
  }
}

async function waitForTerminal(svc, root, runId) {
  const deadline = Date.now() + TERMINAL_TIMEOUT_MS;
  for (;;) {
    const status = await svc.routes["mdcontrol.status"]({ projectRoot: root, runId });
    if (status.terminal !== null) return status;
    if (Date.now() > deadline) throw new Error(`native run ${runId} did not reach terminal within ${TERMINAL_TIMEOUT_MS}ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/* ── dual-leg assertions ──────────────────────────────────────────────────── */

function assertMarkersParsed(legName, runState, failures) {
  if (!runState) return;
  for (const step of runState.steps ?? []) {
    const valid = validMarkersOf(step.name);
    if (step.type === "agent" || step.type === "tool") {
      if (typeof step.marker !== "string" || step.marker === "") {
        failures.push(`${legName}: step ${step.name} has no marker field — markers-parsed gate`);
      } else if (valid.length > 0 && !valid.includes(step.marker)) {
        failures.push(`${legName}: step ${step.name} marker "${step.marker}" not valid for its transitions (${valid.join("|")})`);
      }
    }
  }
  const review = (runState.steps ?? []).find((s) => s.name === "REVIEW");
  if (!review || review.marker !== "pass") {
    failures.push(`${legName}: REVIEW step did not recover to marker "pass" after the artificial break (got ${JSON.stringify(review?.marker)})`);
  }
}

function diffNormalized(legName, a, b, path = "", out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    out.push(`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    diffNormalized(legName, a[key], b[key], path === "" ? key : `${path}.${key}`, out);
  }
  return out;
}

/* ── main ─────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const args = { keep: false, scratch: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--keep") args.keep = true;
    else if (argv[i] === "--scratch") args.scratch = resolve(argv[++i]);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = args.scratch ?? mkdtempSync(join(tmpdir(), "mdcontrol-e2e-"));
  prepareScratch(root);
  console.log(`[e2e] scratch project root: ${root}`);

  const report = { scratchRoot: root, startedAt: new Date().toISOString() };
  const failures = [];

  const cli = await runCliLeg(root, report);
  failures.push(...cli.failures);

  const native = await runNativeLeg(root, report);
  failures.push(...native.failures);

  // P2 gate: markers parsed explicitly, per leg, per AI step.
  assertMarkersParsed("cli", cli.runState, failures);
  assertMarkersParsed("native", native.runState, failures);

  // P2 gate: normalized dual-leg run-state shape identity.
  const normCli = normalizeRunState(cli.runState);
  const normNative = normalizeRunState(native.runState);
  report.normalized = { cli: normCli, native: normNative };
  const shapeDiffs = diffNormalized("run-state", normCli, normNative);
  if (shapeDiffs.length > 0) {
    failures.push(`normalized run-state shape diff (${shapeDiffs.length} field(s)):\n    ${shapeDiffs.slice(0, 20).join("\n    ")}`);
  } else {
    console.log("[e2e] normalized run-state diff: EMPTY (dual-leg shape identity)");
  }

  report.finishedAt = new Date().toISOString();
  report.failures = failures;
  writeFileSync(join(root, "e2e-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("");
  if (failures.length === 0) {
    console.log(`[e2e] SUMMARY: PASS — dual-leg demo mission green, shape identity, markers parsed, correction-retry observed once and recovered`);
    console.log(`[e2e] report: ${join(root, "e2e-report.json")}`);
  } else {
    console.error(`[e2e] SUMMARY: FAIL — ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`[e2e] report: ${join(root, "e2e-report.json")}`);
  }
  if (args.keep) {
    console.log(`[e2e] scratch kept at ${root} (manual monitor inspection: node ${ENGINE_MAIN} --monitor --dir ${root})`);
  } else if (failures.length === 0) {
    rmSync(root, { recursive: true, force: true });
  }
  return failures.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1];
const isDirectRun = typeof invokedPath === "string" && existsSync(invokedPath) &&
  resolve(invokedPath) === fileURLToPath(new URL(import.meta.url));
if (isDirectRun) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[e2e] FATAL: ${err?.stack ?? err}`);
      process.exit(1);
    },
  );
}
