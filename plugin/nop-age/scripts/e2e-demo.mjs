#!/usr/bin/env node
/**
 * e2e-demo.mjs — L4 dual-leg end-to-end runs (dsh-plugin M2-WI10 + M3-WI11 +
 * M3-WI12, plans `2026-08-23-1621-2` Phase 2 / `2026-08-23-1852-1` Phase 3 /
 * `2026-08-23-1852-2` Phase 4; P2/P3 gate evidence producer).
 *
 * Leg pairs (same scratch project, same scripted model policy — e2e-policy.mjs):
 *
 *   demo mission (WI10, unchanged contract)
 *     CLI leg    — the REAL standalone engine (`tools/mission-driver/src/main.js
 *                 demo`, ProcessExecutor backend) spawned as a child process,
 *                 with an executable `opencode` stub FIRST on PATH (the WI3
 *                 driver whitelist pins the driver NAME, so the hermetic stub
 *                 must wear it; prompt arrives as the last argv element,
 *                 opencode promptMode "arg"). `opencode session list` → `[]`.
 *     native leg — a REAL cordis runtime booted IN-PROCESS
 *                 (@deepseek-ai/dsh-app-boot `boot()` + the 15-row
 *                 test/fixtures/e2e.cordis.yml composition incl. the real
 *                 nop-age service row) over a local scripted SSE model
 *                 endpoint (1621-1 keyless stub precedent); the routes are
 *                 called directly through `ctx.get('mdcontrol')`.
 *
 *   onboarding mission (WI11, dual-form parity — P3 gate first sentence)
 *     Same two forms over the REAL built-in mission-driver flow
 *     (CHECK → REVIEW_PLANS → EXEC_PLANS → DRAFT_PLANS → DEEP_AUDIT loop).
 *     Scratch basis (Phase 3 Decision 1): a committed-fixture replica of the
 *     minimal install SHAPE — mission files copied VERBATIM from
 *     template/install/missions/ at runtime (coupling to the real install
 *     artifact) + a minimal docs skeleton. install-age.sh itself is not
 *     exercised (its copy correctness is the installer's own verification,
 *     not the dual-FORM parity claim).
 *     Deterministic script (Decision 2): empty plans/audits skeleton keeps
 *     REVIEW_PLANS (forEach draftPlans()) / EXEC_PLANS (forEach activePlans())
 *     / DEEP_AUDIT (all `when` false) at ZERO agent turns; the stub answers
 *     CHECK → pass and DRAFT_PLANS → nothing twice; the second `nothing` hits
 *     the audit-quota completion gate (auditRound 1 ≥ 1, no active plans, no
 *     open audits) — bounded: exactly 3 stub turns, one loop round.
 *     Assertion surface (Decision 3): MECHANISM plane only — step sequence,
 *     per-step markers valid for the real flow's transitions, artifact
 *     existence, normalized run-state shape diff (normalizeRunState). The
 *     stub driver does not write docs: "fills copied docs" semantic quality
 *     is out of the deterministic gate (verification scope limited — a real
 *     -model leg, if ever taken, is an env-gated manual item per the
 *     verify:native posture).
 *
 *   WI12 legs (M3-WI12, in the native boot — skills + draft/analyze routes)
 *     - skills: agent-spine `skills: enabled` mounts SkillRegistry +
 *       SkillFileSystem + toolSkill (base-bundle form); the mdcontrol
 *       service registers the three mission-control skills via reactive
 *       ctx.inject. Gate: ctx.skills.list() carries all three names
 *       (membership plane; true-model natural-language invocation is an
 *       env-manual item, NOT in this deterministic gate). DSH_HOME points
 *       at the scratch root — hermetic skill discovery.
 *     - analyze (synchronous route): explicit-runId + latest-run legs over
 *       the demo/onboarding runs; stub answers the postmortem turn with the
 *       <POSTMORTEM_FILE>/<MEMORY_UPDATED> return tags; gate = verbatim tag
 *       parse + target resolution + exactly one dispatch per call.
 *     - draft (async route): mdcontrol.draft returns immediately; stub
 *       answers the brief (gate pass + brief file tag) then the draft
 *       (MISSION_FILE tag pointing at a pre-created mission — the stub
 *       cannot write files; parse mechanism is what is gated); draft-state
 *       terminal completed/completed with briefGate/missionName parsed.
 *
 * Assertions (gates):
 *   1. mdcontrol.run returns immediately; each run reaches terminal
 *      `completed` with exitCode 0.
 *   2. Per-mission dual-leg normalized run-state diff (matrix-harness
 *      normalizeRunState vocabulary) is EMPTY — shape identity; divergences
 *      allowed only in the type-only exemption fields (sessionId value
 *      semantics R3 §3, timing, error text, log/prompt basenames — D1/D2/D3).
 *   3. markers parsed EXPLICITLY: every AI step in BOTH legs has a marker
 *      field valid for that step's transitions (demo: inline flow; onboarding:
 *      the real flows/mission-driver.json transitions).
 *   4. correction-retry exercised once artificially (demo only): the REVIEW
 *      step's first scripted response carries an invalid marker (`banana`);
 *      the engine's correction re-prompt is OBSERVED (native leg: stub request
 *      log; CLI leg: engine log line) and the run still completes (recovery).
 *   5. Monitor render (WI11 Phase 1 fix machine-pinned + Phase 3 render
 *      check): an in-process engine monitor (startMonitor) serves all four
 *      runs — `GET /api/runs/:id` stepLogs non-empty for BOTH naming labels,
 *      `/logs/:step` 200, node-detail `/api/runs/:id/nodes/:step` logFile +
 *      logTail non-null.
 *   6. Descriptor health (WI11 Phase 2): the native legs' persisted child
 *      session logs (DSH_SESSION_ROOT) each contain a `subagent/descriptor`
 *      event with provider 'mdcontrol', mode 'continuable', version 2, and a
 *      `Mission: <mission>` label (child session events = the deterministic
 *      assertion plane; the host list plane is parent-scoped and unreachable
 *      for parentless mdcontrol children — plan Decision Record).
 *
 * Gate posture (R3 §5 form, 1621-1 verify:native precedent): explicit local
 * invocation — `npm --prefix plugin/nop-age run verify:e2e`; never wired into
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
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { boot } from "@deepseek-ai/dsh-app-boot";
import {
  CORRECTION_PHRASE,
  BROKEN_MARKER,
  ONBOARDING_PHRASES,
  lastNonReminderUserTextOfChatBody,
  policyForPrompt,
  stubResponseText,
} from "./e2e-policy.mjs";
import { normalizeRunState } from "../test/helpers/matrix-harness.mjs";
import { startMonitor } from "../../../tools/mission-driver/src/monitor.js";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const ENGINE_MAIN = join(REPO_ROOT, "tools", "mission-driver", "src", "main.js");
const E2E_FIXTURE = join(PLUGIN_ROOT, "test", "fixtures", "e2e.cordis.yml");
const TEMPLATE_MISSIONS = join(REPO_ROOT, "template", "install", "missions");
const TERMINAL_TIMEOUT_MS = 120_000;

const RUNS = {
  cliDemo: "cli-e2e-mission-driver",
  nativeDemo: "native-e2e-mission-driver",
  cliOnboarding: "cli-onboarding-mission-driver",
  nativeOnboarding: "native-onboarding-mission-driver",
};

/* ── scratch project: demo mission + onboarding install shape ─────────────── */

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

/** Real mission-driver flow transitions — onboarding marker vocabulary. */
const MD_FLOW = JSON.parse(readFileSync(join(REPO_ROOT, "tools", "mission-driver", "flows", "mission-driver.json"), "utf8"));

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
  prepareOnboarding(root);
}

/**
 * Minimal install-shape replica for the onboarding mission (Phase 3 Decision
 * 1): mission files verbatim from template/install/missions (runtime copy —
 * the fixture tracks the real install artifact), plus the empty docs
 * skeleton the mission's relative paths point at.
 */
function prepareOnboarding(root) {
  copyFileSync(join(TEMPLATE_MISSIONS, "base.json"), join(root, "missions", "base.json"));
  const onboarding = JSON.parse(readFileSync(join(TEMPLATE_MISSIONS, "onboarding.json"), "utf8"));
  writeFileSync(join(root, "missions", "onboarding.json"), JSON.stringify(onboarding, null, 2), "utf8");
  mkdirSync(join(root, onboarding.plansDir), { recursive: true });
  mkdirSync(join(root, onboarding.auditsDir ?? "docs/audits"), { recursive: true });
  mkdirSync(join(root, onboarding.contextDir ?? "docs/context"), { recursive: true });
  mkdirSync(dirname(join(root, onboarding.roadmapPath)), { recursive: true });
  // Post-onboarding-shaped roadmap: one done item — consistent with the
  // scripted DRAFT_PLANS → nothing (no remaining work).
  writeFileSync(join(root, onboarding.roadmapPath), [
    "# Onboarding Roadmap (e2e scratch)",
    "",
    "- [x] WI1 fill the copied AGE docs with the actual stack (scripted stub domain: mechanism plane only)",
  ].join("\n"), "utf8");
}

/** Valid marker vocabulary per step, from a flow definition. */
function validMarkersOf(flowSteps, stepName) {
  return Object.keys(flowSteps[stepName]?.transitions ?? {});
}

/* ── CLI legs ─────────────────────────────────────────────────────────────── */

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

async function runCliMission(root, mission, runId) {
  const binDir = writeCliStub(root);
  console.log(`[e2e] CLI leg (${mission}): spawning the real standalone engine (ProcessExecutor backend)…`);
  const child = spawn(process.execPath, [
    ENGINE_MAIN, mission,
    "--dir", root,
    "--run-dir", runId,
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
  writeFileSync(join(root, `${runId}-stdout.log`), stdout, "utf8");
  writeFileSync(join(root, `${runId}-stderr.log`), stderr, "utf8");

  const runStatePath = join(root, "_tmp", runId, "run-state.json");
  const runState = existsSync(runStatePath) ? JSON.parse(readFileSync(runStatePath, "utf8")) : null;
  return { exit, runState, runStatePath, stdout };
}

/* ── scripted SSE model endpoint (native legs) ────────────────────────────── */

function createScriptedModelServer() {
  const requests = []; // { lastUserText, policyKind, marker, artificialBreak }
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      // WI12: skip the skills-enabled composition's appended <system-reminder>
      // catalog message — the material to act on is the last REAL user text.
      const lastUserText = lastNonReminderUserTextOfChatBody(body);
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

/* ── native legs (one real cordis boot, two missions) ─────────────────────── */

async function runNativeLegs(root, report, failures) {
  const stub = createScriptedModelServer();
  await new Promise((resolveListen) => stub.server.listen(0, "127.0.0.1", resolveListen));
  const port = stub.server.address().port;
  const sessionsDir = join(root, "dsh-sessions");
  mkdirSync(sessionsDir, { recursive: true });

  process.env.DSH_CWD = root;
  process.env.DSH_SESSION_ROOT = sessionsDir;
  // WI12: hermetic dsh-home for the skills filesystem (agent-spine mounts
  // SkillRegistry + SkillFileSystem when skills are enabled) — no host-user
  // skill discovery leaks into the gate.
  const dshHome = join(root, "dsh-home");
  mkdirSync(dshHome, { recursive: true });
  process.env.DSH_HOME = dshHome;
  process.env.DEEPSEEK_API_KEY = "e2e-stub-no-call";
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${port}`;

  console.log(`[e2e] native legs: booting the real cordis runtime (fixture e2e.cordis.yml, stub model on 127.0.0.1:${port})…`);
  const ctx = await boot("mdcontrol-e2e", E2E_FIXTURE);
  try {
    const svc = ctx.get("mdcontrol");
    if (!svc || typeof svc.routes?.["mdcontrol.run"] !== "function") {
      throw new Error("mdcontrol service not published at the root realm (ctx.get('mdcontrol') undefined)");
    }

    /* demo mission (WI10 contract, unchanged) */
    const t0 = Date.now();
    const started = await svc.routes["mdcontrol.run"]({
      projectRoot: root,
      args: { mission: "demo", runDir: RUNS.nativeDemo },
    });
    const elapsedMs = Date.now() - t0;
    console.log(`[e2e] mdcontrol.run (demo) resolved in ${elapsedMs}ms → ${JSON.stringify(started)}`);
    if (started.status !== "started" || started.runId !== RUNS.nativeDemo) {
      failures.push(`mdcontrol.run (demo) returned ${JSON.stringify(started)} — expected { runId: '${RUNS.nativeDemo}', status: 'started' }`);
    }

    const immediate = await svc.routes["mdcontrol.status"]({ projectRoot: root, runId: RUNS.nativeDemo });
    if (!immediate.live || immediate.terminal !== null) {
      failures.push(`demo run already terminal at resolve time — async contract violated: ${JSON.stringify({ live: immediate.live, terminal: immediate.terminal })}`);
    }

    const terminal = await waitForTerminal(svc, root, RUNS.nativeDemo);
    console.log(`[e2e] mdcontrol.status (demo) terminal: ${JSON.stringify(terminal.terminal)}`);
    if (terminal.terminal.exitCode !== 0 || terminal.terminal.status !== "completed") {
      failures.push(`native demo terminal ${JSON.stringify(terminal.terminal)} — expected exitCode 0 / completed`);
    }

    const list = await svc.routes["mdcontrol.list"]({ projectRoot: root });
    const listed = new Set(list.runs.map((r) => r.runId));
    for (const id of [RUNS.cliDemo, RUNS.nativeDemo]) {
      if (!listed.has(id)) failures.push(`mdcontrol.list missing runId ${id} (got ${[...listed].join(", ")})`);
    }

    const demoStatePath = join(root, "_tmp", RUNS.nativeDemo, "run-state.json");
    const demoState = existsSync(demoStatePath) ? JSON.parse(readFileSync(demoStatePath, "utf8")) : null;
    if (!demoState) failures.push(`native demo leg wrote no run-state at ${demoStatePath}`);

    const demoRequests = stub.requests.slice();
    const kinds = demoRequests.map((r) => r.policyKind);
    console.log(`[e2e] stub model served ${demoRequests.length} demo request(s): ${kinds.join(" → ")}`);
    if (demoRequests.length !== 4) {
      failures.push(`stub model served ${demoRequests.length} demo requests (${kinds.join(",")}) — expected exactly 4 (CHECK, REVIEW-break, correction, DONE)`);
    }
    const breaks = demoRequests.filter((r) => r.artificialBreak);
    const corrections = demoRequests.filter((r) => r.policyKind === "correction");
    if (breaks.length !== 1) failures.push(`artificial marker break fired ${breaks.length} times — expected exactly 1`);
    if (corrections.length !== 1) failures.push(`correction re-prompt observed ${corrections.length} times — expected exactly 1`);

    report.nativeLeg = {
      elapsedMs,
      runStatePath: demoStatePath,
      stubRequests: demoRequests,
      listRunIds: [...listed],
    };

    /* onboarding mission (WI11 dual-form parity) — same boot, same stub */
    await new Promise((r) => setTimeout(r, 50)); // active-run guard settles after terminal
    const obStarted = await svc.routes["mdcontrol.run"]({
      projectRoot: root,
      args: { mission: "onboarding", runDir: RUNS.nativeOnboarding },
    });
    console.log(`[e2e] mdcontrol.run (onboarding) → ${JSON.stringify(obStarted)}`);
    if (obStarted.status !== "started" || obStarted.runId !== RUNS.nativeOnboarding) {
      failures.push(`mdcontrol.run (onboarding) returned ${JSON.stringify(obStarted)}`);
    }
    const obTerminal = await waitForTerminal(svc, root, RUNS.nativeOnboarding);
    console.log(`[e2e] mdcontrol.status (onboarding) terminal: ${JSON.stringify(obTerminal.terminal)}`);
    if (obTerminal.terminal.exitCode !== 0 || obTerminal.terminal.status !== "completed") {
      failures.push(`native onboarding terminal ${JSON.stringify(obTerminal.terminal)} — expected exitCode 0 / completed`);
    }
    const obStatePath = join(root, "_tmp", RUNS.nativeOnboarding, "run-state.json");
    const obState = existsSync(obStatePath) ? JSON.parse(readFileSync(obStatePath, "utf8")) : null;
    if (!obState) failures.push(`native onboarding leg wrote no run-state at ${obStatePath}`);

    const obRequests = stub.requests.slice(demoRequests.length);
    const obKinds = obRequests.map((r) => r.policyKind);
    console.log(`[e2e] stub model served ${obRequests.length} onboarding request(s): ${obKinds.join(" → ")}`);
    const expectedObKinds = ["ONBOARDING-CHECK", "ONBOARDING-DRAFT_PLANS", "ONBOARDING-DRAFT_PLANS"];
    if (obKinds.join(",") !== expectedObKinds.join(",")) {
      failures.push(`onboarding stub sequence ${obKinds.join(",")} — expected exactly ${expectedObKinds.join(",")} (bounded one-loop script)`);
    }

    report.nativeOnboardingLeg = {
      runStatePath: obStatePath,
      stubRequests: obRequests,
    };

    /* ── WI12 legs: skills registration + analyze (sync) + draft (async) ── */

    // 1. skills registration face: ctx.skills.list() shows the three
    //    mission-control rows (reactive ctx.inject — poll until mounted).
    const wi12SkillNames = await waitForSkills(ctx, failures);
    report.wi12Skills = wi12SkillNames;

    // 2. analyze (synchronous single dispatch) — explicit runId leg.
    const wi12Start = stub.requests.length;
    const anExplicit = await svc.routes["mdcontrol.analyze"]({ projectRoot: root, runId: RUNS.nativeDemo });
    console.log(`[e2e] mdcontrol.analyze (explicit ${RUNS.nativeDemo}) → postmortemFile=${anExplicit.postmortemFile} memoryUpdated=${anExplicit.memoryUpdated}`);
    if (anExplicit.targetRunId !== RUNS.nativeDemo) {
      failures.push(`analyze explicit: targetRunId ${anExplicit.targetRunId} ≠ ${RUNS.nativeDemo}`);
    }
    if (anExplicit.postmortemFile !== "docs/postmortems/e2e-postmortem.md" || anExplicit.memoryUpdated !== "no") {
      failures.push(`analyze explicit: return tags not parsed verbatim (${JSON.stringify({ postmortemFile: anExplicit.postmortemFile, memoryUpdated: anExplicit.memoryUpdated })})`);
    }
    if (!anExplicit.text.includes("<POSTMORTEM_FILE>")) {
      failures.push("analyze explicit: result text does not carry the postmortem report");
    }

    // 3. analyze — latest-run leg (disk mtime scan reuse; nativeOnboarding
    //    settled last, so it is deterministically the most recent run).
    const anLatest = await svc.routes["mdcontrol.analyze"]({ projectRoot: root });
    console.log(`[e2e] mdcontrol.analyze (latest) → targetRunId=${anLatest.targetRunId}`);
    if (anLatest.targetRunId !== RUNS.nativeOnboarding) {
      failures.push(`analyze latest: targetRunId ${anLatest.targetRunId} ≠ ${RUNS.nativeOnboarding} (expected most-recent by mtime)`);
    }

    // 4. draft — async two-stage job over the executor seam. The generated
    //    mission file is pre-created as the MISSION_FILE tag target
    //    (mechanism plane: the stub cannot write files; the engine's
    //    parseDraftArtifact reads the tag target / falls back to the
    //    missionsDir scan, which finds this file as the newest with a
    //    roadmapPath).
    writeFileSync(join(root, "missions", "e2e-generated-mission.json"), JSON.stringify({
      name: "e2e-generated-mission",
      description: "WI12 draft-leg generated mission (stub domain)",
      roadmapPath: "docs/backlog/e2e-generated-roadmap.md",
      plansDir: "docs/plans/e2e/e2e-generated-mission",
    }, null, 2), "utf8");
    const draftT0 = Date.now();
    const draftStarted = await svc.routes["mdcontrol.draft"]({
      projectRoot: root,
      desc: "generate the e2e WI12 draft-leg mission",
    });
    const draftElapsedMs = Date.now() - draftT0;
    console.log(`[e2e] mdcontrol.draft resolved in ${draftElapsedMs}ms → ${JSON.stringify(draftStarted)}`);
    if (draftStarted.status !== "started" || !/^draft-\d{8}-\d{6}-\d{3}/.test(draftStarted.jobId)) {
      failures.push(`mdcontrol.draft returned ${JSON.stringify(draftStarted)} — expected { jobId: 'draft-…', status: 'started' }`);
    }
    if (draftElapsedMs > 500) {
      failures.push(`mdcontrol.draft took ${draftElapsedMs}ms — async contract violated`);
    }
    const draftStatePath = join(draftStarted.jobDir, "draft-state.json");
    const draftState = await waitForJsonField(draftStatePath, "status", (v) => v !== "running", "draft terminal");
    console.log(`[e2e] draft-state terminal: ${JSON.stringify(draftState)}`);
    if (draftState.status !== "completed" || draftState.phase !== "completed") {
      failures.push(`draft terminal ${draftState.status}/${draftState.phase} — expected completed/completed`);
    }
    if (draftState.briefGate !== "pass" || draftState.briefPath !== "docs/backlog/e2e-generated-brief.md") {
      failures.push(`draft brief stage not reflected in state (${JSON.stringify({ briefGate: draftState.briefGate, briefPath: draftState.briefPath })})`);
    }
    if (draftState.missionName !== "e2e-generated-mission") {
      failures.push(`draft missionName ${JSON.stringify(draftState.missionName)} — expected the pre-created tag target via parse fallback`);
    }

    // Stub sequence for the WI12 legs: analyze ×2, brief, draft.
    const wi12Requests = stub.requests.slice(wi12Start);
    const wi12Kinds = wi12Requests.map((r) => r.policyKind);
    console.log(`[e2e] stub model served ${wi12Requests.length} WI12 request(s): ${wi12Kinds.join(" → ")}`);
    const expectedW12Kinds = ["WI12-ANALYZE", "WI12-ANALYZE", "WI12-BRIEF", "WI12-DRAFT"];
    if (wi12Kinds.join(",") !== expectedW12Kinds.join(",")) {
      failures.push(`WI12 stub sequence ${wi12Kinds.join(",")} — expected exactly ${expectedW12Kinds.join(",")}`);
    }
    report.wi12Leg = { analyzeExplicit: anExplicit, analyzeLatestTarget: anLatest.targetRunId, stubRequests: wi12Requests };

    return { failures, demoState, obState, sessionsDir };
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

/**
 * WI12: poll the driver-level ctx until ctx.skills.list() contains all three
 * mission-control rows (registration runs in a reactive ctx.inject fiber, so
 * it may land shortly after boot settles).
 */
async function waitForSkills(ctx, failures) {
  const wanted = ["mission-control-run", "mission-control-draft", "mission-control-analyze"];
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const skills = ctx.get("skills");
      if (skills && typeof skills.list === "function") {
        const names = (await skills.list()).map((s) => s.name);
        if (wanted.every((n) => names.includes(n))) {
          console.log(`[e2e] ctx.skills.list() carries all three mission-control skills (${names.filter((n) => n.startsWith("mission-control")).join(", ")})`);
          return names;
        }
      }
    } catch { /* service not yet published */ }
    if (Date.now() > deadline) {
      failures.push(`ctx.skills did not surface the three mission-control skills within 15s (wanted ${wanted.join(", ")})`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** WI12: poll a JSON file until one field passes a predicate (draft-state terminal). */
async function waitForJsonField(file, field, accept, label) {
  const deadline = Date.now() + TERMINAL_TIMEOUT_MS;
  for (;;) {
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(file, "utf8")); } catch { /* not written yet */ }
    if (parsed && accept(parsed[field])) return parsed;
    if (Date.now() > deadline) throw new Error(`waitForJsonField(${label}) timed out at ${file}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/* ── descriptor health (WI11 Phase 2 — child session events plane) ────────── */

function scanDescriptorRows(sessionsDir) {
  // Layout: <root>/<sanitized-cwd-namespace>/<sessionId>/session.jsonl
  const rows = [];
  let namespaces = [];
  try {
    namespaces = readdirSync(sessionsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return rows;
  }
  for (const ns of namespaces) {
    let sessions = [];
    try {
      sessions = readdirSync(join(sessionsDir, ns.name), { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      continue;
    }
    for (const sess of sessions) {
      const f = join(sessionsDir, ns.name, sess.name, "session.jsonl");
      if (!existsSync(f)) continue;
      for (const line of readFileSync(f, "utf8").split("\n")) {
        if (!line.includes("subagent/descriptor")) continue;
        try {
          const ev = JSON.parse(line);
          if (ev && ev.type === "subagent/descriptor") rows.push({ session: sess.name, data: ev.data });
        } catch { /* malformed non-descriptor line */ }
      }
    }
  }
  return rows;
}

function assertDescriptorHealth(sessionsDir, report, failures) {
  const rows = scanDescriptorRows(sessionsDir);
  report.descriptorRows = rows.map((r) => ({ session: r.session, ...r.data }));
  const labels = new Set(rows.map((r) => r.data?.label));
  for (const mission of ["demo", "onboarding"]) {
    if (!labels.has(`Mission: ${mission}`)) {
      failures.push(`no durable subagent/descriptor row with label "Mission: ${mission}" under ${sessionsDir} (got ${[...labels].join(", ") || "none"})`);
    }
  }
  for (const row of rows) {
    const d = row.data ?? {};
    if (d.provider !== "mdcontrol") failures.push(`descriptor ${row.session}: provider "${d.provider}" ≠ "mdcontrol"`);
    if (d.mode !== "continuable") failures.push(`descriptor ${row.session}: mode "${d.mode}" ≠ "continuable"`);
    if (d.version !== 2) failures.push(`descriptor ${row.session}: version ${d.version} ≠ 2`);
  }
  console.log(`[e2e] descriptor rows: ${rows.length} (labels: ${[...labels].join(", ")})`);
}

/* ── monitor render assertions (WI11 Phase 1 fix + Phase 3 render check) ──── */

async function assertMonitorRender(root, report, failures) {
  mkdirSync(join(root, "web"), { recursive: true });
  const monitor = await startMonitor({ projectRoot: root, port: 0, webDir: join(root, "web") });
  report.monitor = { checks: [] };
  try {
    const base = `http://localhost:${monitor.port}`;
    const getJson = async (path) => {
      const res = await fetch(`${base}${path}`);
      let body = null;
      try { body = await res.json(); } catch { /* non-JSON */ }
      return { status: res.status, body };
    };
    for (const [key, runId] of Object.entries(RUNS)) {
      const label = key.startsWith("native") ? "native-" : "oc-";
      const detail = await getJson(`/api/runs/${runId}`);
      if (detail.status !== 200) {
        failures.push(`monitor ${runId}: GET /api/runs → ${detail.status}`);
        continue;
      }
      const stepLogs = detail.body.stepLogs ?? [];
      if (stepLogs.length === 0) {
        failures.push(`monitor ${runId}: stepLogs empty — step-log panel blind`);
      }
      const labeled = stepLogs.filter((s) => s.fileName.startsWith(label)).length;
      if (labeled === 0) {
        failures.push(`monitor ${runId}: no ${label} prefixed step-log listed`);
      }
      const logRes = await getJson(`/api/runs/${runId}/logs/CHECK`);
      if (logRes.status !== 200) {
        failures.push(`monitor ${runId}: /logs/CHECK → ${logRes.status} (expected 200)`);
      }
      const nodeRes = await getJson(`/api/runs/${runId}/nodes/CHECK`);
      if (nodeRes.status !== 200 || !nodeRes.body.logFile || typeof nodeRes.body.logTail !== "string" || nodeRes.body.logTail === "") {
        failures.push(`monitor ${runId}: node-detail CHECK logFile/logTail missing (status ${nodeRes.status}, logFile ${nodeRes.body?.logFile ?? null})`);
      }
      report.monitor.checks.push({
        runId,
        stepLogs: stepLogs.length,
        labeled,
        logsCheckStatus: logRes.status,
        nodeLogTailOk: Boolean(nodeRes.body?.logFile && nodeRes.body?.logTail),
      });
      console.log(`[e2e] monitor ${runId}: stepLogs=${stepLogs.length} (${label}: ${labeled}), /logs/CHECK=${logRes.status}, node-detail logTail ok=${Boolean(nodeRes.body?.logTail)}`);
    }
  } finally {
    await monitor.close();
  }
}

/* ── dual-leg assertions ──────────────────────────────────────────────────── */

function assertMarkersParsed(legName, runState, failures, flowSteps) {
  if (!runState) return;
  for (const step of runState.steps ?? []) {
    const valid = validMarkersOf(flowSteps, step.name);
    if (step.type === "agent" || step.type === "tool") {
      if (typeof step.marker !== "string" || step.marker === "") {
        failures.push(`${legName}: step ${step.name} has no marker field — markers-parsed gate`);
      } else if (valid.length > 0 && !valid.includes(step.marker)) {
        failures.push(`${legName}: step ${step.name} marker "${step.marker}" not valid for its transitions (${valid.join("|")})`);
      }
    }
  }
  const review = (runState.steps ?? []).find((s) => s.name === "REVIEW");
  if (validMarkersOf(flowSteps, "REVIEW").length > 0) {
    if (!review || review.marker !== "pass") {
      failures.push(`${legName}: REVIEW step did not recover to marker "pass" after the artificial break (got ${JSON.stringify(review?.marker)})`);
    }
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

function assertDualLegShape(missionName, cliState, nativeState, failures) {
  const normCli = normalizeRunState(cliState);
  const normNative = normalizeRunState(nativeState);
  const shapeDiffs = diffNormalized("run-state", normCli, normNative);
  if (shapeDiffs.length > 0) {
    failures.push(`[${missionName}] normalized run-state shape diff (${shapeDiffs.length} field(s)):\n    ${shapeDiffs.slice(0, 20).join("\n    ")}`);
  } else {
    console.log(`[e2e] [${missionName}] normalized run-state diff: EMPTY (dual-leg shape identity)`);
  }
  return { cli: normCli, native: normNative };
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

  /* CLI legs (demo + onboarding) */
  const cliDemo = await runCliMission(root, "demo", RUNS.cliDemo);
  if (cliDemo.exit.code !== 0) failures.push(`CLI demo leg exit code ${cliDemo.exit.code} (signal ${cliDemo.exit.signal}) — expected 0`);
  if (!cliDemo.runState) failures.push(`CLI demo leg wrote no run-state at ${cliDemo.runStatePath}`);
  if (!cliDemo.stdout.includes(`correction retry 1/2`)) failures.push("CLI demo leg: engine correction-retry log line not observed");
  if (!cliDemo.stdout.includes(`"${BROKEN_MARKER}" not in transitions`)) failures.push("CLI demo leg: artificial marker break not observed in engine log");
  report.cliLeg = {
    exitCode: cliDemo.exit.code,
    signal: cliDemo.exit.signal,
    runStatePath: cliDemo.runStatePath,
    correctionRetryObserved: cliDemo.stdout.includes("correction retry 1/2"),
    artificialBreakObserved: cliDemo.stdout.includes(`"${BROKEN_MARKER}" not in transitions`),
  };

  const cliOb = await runCliMission(root, "onboarding", RUNS.cliOnboarding);
  if (cliOb.exit.code !== 0) failures.push(`CLI onboarding leg exit code ${cliOb.exit.code} (signal ${cliOb.exit.signal}) — expected 0`);
  if (!cliOb.runState) failures.push(`CLI onboarding leg wrote no run-state at ${cliOb.runStatePath}`);
  if (cliOb.stdout.includes("correction retry")) failures.push("CLI onboarding leg: unexpected correction retry (script must stay on the happy bounded path)");
  report.cliOnboardingLeg = {
    exitCode: cliOb.exit.code,
    signal: cliOb.exit.signal,
    runStatePath: cliOb.runStatePath,
  };

  /* native legs (one boot: demo + onboarding) */
  const native = await runNativeLegs(root, report, failures);

  /* markers parsed explicitly, per leg, per AI step */
  assertMarkersParsed("cli", cliDemo.runState, failures, FLOW_STEPS);
  assertMarkersParsed("native", native.demoState, failures, FLOW_STEPS);
  assertMarkersParsed("cli-onboarding", cliOb.runState, failures, MD_FLOW.steps);
  assertMarkersParsed("native-onboarding", native.obState, failures, MD_FLOW.steps);

  /* per-mission normalized dual-leg run-state shape identity */
  report.normalized = {
    demo: assertDualLegShape("demo", cliDemo.runState, native.demoState, failures),
    onboarding: assertDualLegShape("onboarding", cliOb.runState, native.obState, failures),
  };

  /* descriptor health (native legs, child session events plane) */
  assertDescriptorHealth(native.sessionsDir, report, failures);

  /* monitor render: all four runs, both naming labels, three endpoints */
  await assertMonitorRender(root, report, failures);

  report.finishedAt = new Date().toISOString();
  report.failures = failures;
  writeFileSync(join(root, "e2e-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("");
  if (failures.length === 0) {
    console.log(`[e2e] SUMMARY: PASS — demo dual-leg green (shape identity, markers parsed, correction-retry recovered once) + onboarding dual-form parity (shape identity, bounded 3-turn script, markers valid for the real flow) + descriptor rows healthy (mdcontrol/continuable) + monitor render green (stepLogs/logs/node-detail, oc- & native-) + WI12 legs green (3 skills in ctx.skills.list(), analyze explicit+latest tag-parse verbatim, draft async two-stage terminal completed with briefGate/missionName parsed)`);
    console.log(`[e2e] report: ${join(root, "e2e-report.json")}`);
  } else {
    console.error(`[e2e] SUMMARY: FAIL — ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`[e2e] report: ${join(root, "e2e-report.json")}`);
  }
  if (args.keep) {
    console.log(`[e2e] scratch kept at ${root} (manual monitor inspection: node ${ENGINE_MAIN} monitor --dir ${root})`);
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
