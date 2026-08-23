#!/usr/bin/env node
/**
 * e2e-preset.mjs — M4-WI14 preset-composition verification leg (dsh-plugin,
 * plan `docs/plans/dsh-plugin/2026-08-23-2202-1-*` Phase 3, Phase 1 D4
 * verification domain ②: composition domain, in-process boot).
 *
 * ONE real cordis runtime (dsh-app-boot `boot()` + the preset.cordis.yml
 * fixture) carrying BOTH the mission-control service row AND the host preset
 * roster whose roots point at the in-repo AGE preset — the P4 gate's literal
 * claim surface ("preset + plugin compose without realm collision") — over a
 * local scripted SSE model endpoint (keyless stub precedent).
 *
 * Legs (one boot, one stub):
 *
 *   A. roster + interactive mount face
 *      - ctx.get('agentPresets').list() contains `age` and reports it NOT
 *        broken (discovery health);
 *      - agents.create with `setup: mount(agentCtx, 'age')` resolves — a
 *        rejected composition would roll the creation back, so a live handle
 *        IS the "mount not rejected" assertion (root-realm leak guard,
 *        inactive-row guard, resolveMountable);
 *      - that agent's single model request is MODEL-VISIBLY composed:
 *          * the `age:mode` section text (route-injection leg 1),
 *          * the AGENTS.md digest marker (agent-instructions row — the
 *            complement-not-conflict posture, machine-checked),
 *          * preset-layer tools `grep`/`glob` (dsh-tool-fs-search — preset-
 *            only in this composition; catalog sufficiency, model-visible).
 *
 *   B. mission child leg (executor setup mount — Phase 1 D1 Refinement 1 +
 *      D2 route-injection leg 2): mdcontrol.run drives the demo mission in a
 *      scratch project whose missions/base.json carries `agent: "age"`. The
 *      child has NO parent session to composeFrom — the executor's create
 *      setup is the only composition source, so AGE-section presence in the
 *      child's requests proves the wiring. Assertions: run completes
 *      exitCode 0; every stub request for the child carries the AGE section
 *      text; every AI step's marker is valid for the demo flow transitions
 *      (N3: mission-child marker legality under the AGE composition).
 *
 *   C. realm-collision face: ctx.get('mdcontrol') resolves BEFORE and AFTER
 *      the standing mount + mission; mdcontrol.list answers (the single
 *      bundle-patch-owned instance keeps serving beside the preset).
 *
 *   D. skills face: ctx.skills.list() still carries the three
 *      mission-control rows after the preset standing mount (global
 *      registration unaffected — the reuse-no-re-registration adjudication).
 *
 * Gate posture (R3 §5 form, verify:e2e / verify:native precedents): explicit
 * local invocation — `npm --prefix plugin/dsh run verify:e2e:preset`; never
 * wired into verify-age.sh / age-ci.yml; zero credentials, zero external
 * network (stub model on 127.0.0.1). POSIX-only. Node >= 23.6 (in-source
 * type stripping for the .ts service import through the loader).
 *
 * verification scope limited: this is the deterministic composition domain —
 * real-host roster registration (profile config / user-root copy / restart)
 * is the documented manual env leg in the dev guide; natural-language AGE
 * session quality is the plan's Deferred watch-only residual.
 *
 * Flags: --keep (preserve the scratch root for manual inspection).
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boot } from "@deepseek-ai/dsh-app-boot";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import {
  policyForPrompt,
  stubResponseText,
  lastNonReminderUserTextOfChatBody,
} from "./e2e-policy.mjs";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(PLUGIN_ROOT, "test", "fixtures", "preset.cordis.yml");
const PRESET_ROOT_DIR = join(PLUGIN_ROOT, "preset");
const TERMINAL_TIMEOUT_MS = 120_000;
const RUN_ID = "native-preset-e2e";
const SESSION_PROBE_TOKEN = "PRESET-E2E-SESSION";
const AGE_SECTION_NEEDLE = "AGE Mode (Attractor-Guided Engineering)";
const AGENTS_MD_NEEDLE = "SCRATCH-AGENTS-MD-MARKER";
const MISSION_CONTROL_SKILLS = ["mission-control-run", "mission-control-draft", "mission-control-analyze"];

const FLOW_STEPS = {
  CHECK: {
    type: "agent",
    prompt: "Execute the CHECK step of the preset e2e demo mission.\nSTEP-TOKEN-CHECK\nReply with the step result marker only:\n<AI_STEP_RESULT>pass</AI_STEP_RESULT> or <AI_STEP_RESULT>fail</AI_STEP_RESULT>",
    transitions: { pass: { goto: "DONE" }, fail: { done: "failed" } },
    onError: { done: "failed" },
  },
  DONE: {
    type: "agent",
    prompt: "Execute the DONE step of the preset e2e demo mission.\nSTEP-TOKEN-DONE\nReply with the step result marker only:\n<AI_STEP_RESULT>pass</AI_STEP_RESULT> or <AI_STEP_RESULT>fail</AI_STEP_RESULT>",
    transitions: { pass: { done: "completed" }, fail: { done: "failed" } },
    onError: { done: "failed" },
  },
};

/* ── scratch project: demo mission + base.json { agent: "age" } + AGENTS.md ─ */

function prepareScratch(root) {
  mkdirSync(join(root, "missions", "flows"), { recursive: true });
  mkdirSync(join(root, "docs", "backlog"), { recursive: true });
  mkdirSync(join(root, "docs", "plans"), { recursive: true });
  // The composition-selecting knob under test: base.json `agent` flows to the
  // native run config (plugin-layer defaulting in bootstrapNativeConfig — the
  // engine's run path alone never consults base.agent), into NativeExecutor's
  // meta.agentPreset AND its create setup (which mounts it through the roster).
  writeFileSync(join(root, "missions", "base.json"), JSON.stringify({
    model: "deepseek-v4-flash",
    agent: "age",
    commands: { test: "echo ok" },
  }, null, 2), "utf8");
  writeFileSync(join(root, "missions", "demo.json"), JSON.stringify({
    name: "demo",
    description: "M4-WI14 preset-composition e2e demo mission",
    roadmapPath: "docs/backlog/demo-roadmap.md",
    plansDir: "docs/plans",
    flowName: "demo",
    model: "deepseek-v4-flash",
    commands: { test: "echo ok" },
  }, null, 2), "utf8");
  writeFileSync(join(root, "missions", "flows", "demo.json"), JSON.stringify({
    name: "demo",
    entry: "CHECK",
    steps: FLOW_STEPS,
  }, null, 2), "utf8");
  writeFileSync(join(root, "docs", "backlog", "demo-roadmap.md"), [
    "# Demo Roadmap (preset e2e scratch)",
    "",
    "- WI1 demo step chain: CHECK → DONE",
  ].join("\n"), "utf8");
  // The agent-instructions digest source: presence of its marker in the
  // session's model request proves the AGENTS.md digest row mounted beside
  // (not instead of) the age:mode section.
  writeFileSync(join(root, "AGENTS.md"), [
    "# Scratch AGENTS.md (preset e2e)",
    "",
    "SCRATCH-AGENTS-MD-MARKER — if you can read this line through the model",
    "request, the dsh-agent-instructions digest row is composed.",
  ].join("\n"), "utf8");
}

/* ── scripted model endpoint (records the model-visible composition) ─────── */

function createScriptedModelServer() {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const lastUserText = lastNonReminderUserTextOfChatBody(body);
      let content = null;
      let kind = null;
      if (typeof lastUserText === "string" && lastUserText.includes(SESSION_PROBE_TOKEN)) {
        kind = "SESSION-PROBE";
        content = "preset session probe acknowledged.";
      } else {
        const policy = policyForPrompt(lastUserText ?? "");
        if (policy === null) {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { message: "preset e2e stub model: no policy matched the last user message" } }));
          return;
        }
        kind = policy.kind;
        content = stubResponseText(policy);
      }
      let toolNames = [];
      try {
        const parsed = JSON.parse(body);
        toolNames = (parsed.tools ?? []).map((tool) => tool?.function?.name ?? tool?.name).filter((name) => typeof name === "string");
      } catch { /* non-JSON body — tools stay empty, substring assertions still apply */ }
      requests.push({
        kind,
        lastUserText: (lastUserText ?? "").slice(0, 200),
        hasAgeSection: body.includes(AGE_SECTION_NEEDLE),
        hasAgentsMd: body.includes(AGENTS_MD_NEEDLE),
        toolNames,
        rawBodyHead: body.slice(0, 1500),
      });
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('data: {"choices":[{"delta":{"role":"assistant","content":null}}]}\n\n');
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      response.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n');
      response.end("data: [DONE]\n\n");
    });
  });
  return { server, requests };
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

async function waitForTerminal(svc, root, runId) {
  const deadline = Date.now() + TERMINAL_TIMEOUT_MS;
  for (;;) {
    const status = await svc.routes["mdcontrol.status"]({ projectRoot: root, runId });
    if (status.terminal !== null) return status;
    if (Date.now() > deadline) throw new Error(`native run ${runId} did not reach terminal within ${TERMINAL_TIMEOUT_MS}ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

function assertMarkersValid(runState, failures) {
  const steps = (runState?.steps ?? []).filter((step) => step?.type === "agent" || FLOW_STEPS[step?.name]?.type === "agent");
  if (steps.length === 0) {
    failures.push("no agent steps found in run-state — marker assertion cannot run");
    return;
  }
  for (const step of steps) {
    const valid = Object.keys(FLOW_STEPS[step.name]?.transitions ?? {});
    if (valid.length === 0) continue;
    if (typeof step.marker !== "string" || step.marker === "" ) {
      failures.push(`agent step ${step.name} has no parsed marker`);
    } else if (!valid.includes(step.marker)) {
      failures.push(`agent step ${step.name} marker "${step.marker}" not in transitions ${valid.join("|")}`);
    }
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

const keep = process.argv.includes("--keep");
const root = mkdtempSync(join(tmpdir(), "dsh-preset-e2e-"));
const report = { scratch: root };
const failures = [];
let stub = null;

try {
  prepareScratch(root);
  stub = createScriptedModelServer();
  await new Promise((resolveListen) => stub.server.listen(0, "127.0.0.1", resolveListen));
  const port = stub.server.address().port;

  const sessionsDir = join(root, "dsh-sessions");
  mkdirSync(sessionsDir, { recursive: true });
  const dshHome = join(root, "dsh-home");
  mkdirSync(dshHome, { recursive: true });
  process.env.DSH_CWD = root;
  process.env.DSH_SESSION_ROOT = sessionsDir;
  process.env.DSH_HOME = dshHome;
  process.env.DEEPSEEK_API_KEY = "preset-e2e-stub-no-call";
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.DSH_PRESET_ROOT = PRESET_ROOT_DIR;

  console.log("[preset-e2e] booting the real cordis runtime (fixture preset.cordis.yml, stub model on 127.0.0.1:" + port + ")…");
  const ctx = await boot("mdcontrol-preset-e2e", FIXTURE);
  try {
    /* Leg C (pre): the service resolves BEFORE any preset mount. */
    const svcBefore = ctx.get("mdcontrol");
    if (!svcBefore || typeof svcBefore.routes?.["mdcontrol.run"] !== "function") {
      failures.push("mdcontrol service not published at the root realm before the preset mount (ctx.get('mdcontrol') unusable)");
    }

    /* Leg A: roster + interactive mount face. */
    const presets = ctx.get("agentPresets");
    if (!presets || typeof presets.list !== "function" || typeof presets.mount !== "function") {
      throw new Error("agentPresets roster service not published (ctx.get('agentPresets') unusable)");
    }
    const roster = await presets.list();
    const ageRow = roster.find((preset) => preset.id === "age");
    console.log(`[preset-e2e] roster: ${roster.map((preset) => `${preset.id}${preset.broken ? " (broken)" : ""}`).join(", ")}`);
    if (!ageRow) {
      failures.push(`roster does not list the 'age' preset (got ${roster.map((p) => p.id).join(", ")})`);
    }
    if (ageRow && ageRow.broken !== undefined) {
      failures.push(`'age' preset reported broken by discovery: ${ageRow.broken}`);
    }

    const agents = ctx.get("agents");
    if (!agents || typeof agents.create !== "function") {
      throw new Error("agents service not published (ctx.get('agents') unusable)");
    }
    const sessionRequestsBefore = stub.requests.length;
    const handle = await agents.create({
      sessionId: "preset-e2e-session-1",
      meta: { cwd: root },
      agentOptions: { provider: "deepseek-official", model: "deepseek-v4-flash" },
      // The real host's session-creation shape: the roster mounts the named
      // preset inside the agent factory's unpublished setup window.
      setup: async (agentCtx) => { await presets.mount(agentCtx, "age"); },
    });
    try {
      await handle.agent.followup(createUserMessage({
        content: [{ type: "text", text: `Preset e2e session probe. ${SESSION_PROBE_TOKEN} Reply with a single line.` }],
        source: { kind: "user" },
      }));
      await handle.agent.whenIdle();
    } finally {
      await handle.dispose();
    }
    const sessionRequests = stub.requests.slice(sessionRequestsBefore);
    const sessionProbe = sessionRequests.find((request) => request.kind === "SESSION-PROBE");
    if (!sessionProbe) {
      failures.push(`no SESSION-PROBE request reached the stub (kinds: ${sessionRequests.map((r) => r.kind).join(", ") || "none"})`);
    } else {
      if (!sessionProbe.hasAgeSection) failures.push("interactive AGE session request does NOT carry the age:mode section text");
      if (!sessionProbe.hasAgentsMd) failures.push("interactive AGE session request does NOT carry the AGENTS.md digest (complement posture broken)");
      for (const tool of ["grep", "glob"]) {
        if (!sessionProbe.toolNames.includes(tool)) {
          failures.push(`interactive AGE session tool catalog lacks "${tool}" (preset layer not composed; tools: ${sessionProbe.toolNames.join(", ")})`);
        }
      }
      console.log(`[preset-e2e] session probe composed: age:mode=${sessionProbe.hasAgeSection} agentsMd=${sessionProbe.hasAgentsMd} tools=${sessionProbe.toolNames.length}`);
    }

    /* Leg D: skills face — the global mission-control rows survived the standing mount. */
    const skills = ctx.get("skills");
    if (!skills || typeof skills.list !== "function") {
      failures.push("skills service not published (ctx.get('skills') unusable)");
    } else {
      const names = (await skills.list()).map((skill) => skill.name);
      for (const wanted of MISSION_CONTROL_SKILLS) {
        if (!names.includes(wanted)) failures.push(`ctx.skills.list() missing "${wanted}" after the preset standing mount`);
      }
      console.log(`[preset-e2e] skills face: ${MISSION_CONTROL_SKILLS.filter((n) => names.includes(n)).length}/3 mission-control rows present`);
    }

    /* Leg B: mission child via mdcontrol.run — executor setup mount. */
    const missionRequestsBefore = stub.requests.length;
    const started = await svcBefore.routes["mdcontrol.run"]({
      projectRoot: root,
      args: { mission: "demo", runDir: RUN_ID },
    });
    console.log(`[preset-e2e] mdcontrol.run → ${JSON.stringify(started)}`);
    if (started.status !== "started" || started.runId !== RUN_ID) {
      failures.push(`mdcontrol.run returned ${JSON.stringify(started)} — expected { runId: '${RUN_ID}', status: 'started' }`);
    }
    const terminal = await waitForTerminal(svcBefore, root, RUN_ID);
    console.log(`[preset-e2e] mdcontrol.status terminal: ${JSON.stringify(terminal.terminal)}`);
    if (terminal.terminal.exitCode !== 0 || terminal.terminal.status !== "completed") {
      failures.push(`preset-leg mission terminal ${JSON.stringify(terminal.terminal)} — expected exitCode 0 / completed`);
    }

    const runStatePath = join(root, "_tmp", RUN_ID, "run-state.json");
    const runState = existsSync(runStatePath) ? JSON.parse(readFileSync(runStatePath, "utf8")) : null;
    if (!runState) {
      failures.push(`no run-state at ${runStatePath}`);
    } else {
      assertMarkersValid(runState, failures);
    }

    const missionRequests = stub.requests.slice(missionRequestsBefore);
    const kinds = missionRequests.map((request) => request.kind);
    console.log(`[preset-e2e] stub model served ${missionRequests.length} mission request(s): ${kinds.join(" → ")}`);
    if (kinds.join(",") !== ["CHECK", "DONE"].join(",")) {
      failures.push(`mission stub sequence ${kinds.join(",")} — expected exactly CHECK, DONE`);
    }
    const uncomposed = missionRequests.filter((request) => !request.hasAgeSection);
    if (missionRequests.length > 0 && uncomposed.length > 0) {
      failures.push(`${uncomposed.length}/${missionRequests.length} mission-child request(s) lack the age:mode section — executor setup mount did not compose the child (D1 Refinement 1 wiring)`);
    }
    const childToolFace = missionRequests[0];
    if (childToolFace) {
      for (const tool of ["grep", "glob"]) {
        if (!childToolFace.toolNames.includes(tool)) {
          failures.push(`mission-child tool catalog lacks "${tool}" (AGE worker preset catalog; tools: ${childToolFace.toolNames.join(", ")})`);
        }
      }
    }
    report.missionRequests = missionRequests;
    report.sessionProbe = sessionProbe ?? null;

    /* Leg C (post): the single service instance kept serving beside the preset. */
    const svcAfter = ctx.get("mdcontrol");
    if (!svcAfter || typeof svcAfter.routes?.["mdcontrol.list"] !== "function") {
      failures.push("mdcontrol service stopped resolving after the preset standing mount + mission (realm collision!)");
    } else {
      const list = await svcAfter.routes["mdcontrol.list"]({ projectRoot: root });
      const listed = new Set(list.runs.map((row) => row.runId));
      if (!listed.has(RUN_ID)) failures.push(`mdcontrol.list missing ${RUN_ID} after the mission (got ${[...listed].join(", ")})`);
      console.log(`[preset-e2e] mdcontrol still resolves + lists ${RUN_ID} beside the standing preset mount`);
    }
  } finally {
    await ctx.fiber.dispose().catch(() => {});
  }

  report.failures = failures;
  if (failures.length > 0) {
    console.error(`\npreset-e2e: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("\npreset-e2e: SUMMARY PASS (roster healthy · interactive mount model-visible · mission child composed · markers valid · mdcontrol collision-free · skills intact)");
  }
} catch (error) {
  console.error(`preset-e2e: driver error — ${error && error.stack ? error.stack : String(error)}`);
  process.exitCode = 1;
} finally {
  stub?.server.close();
  if (keep) {
    console.log(`[preset-e2e] --keep: scratch preserved at ${root}`);
  } else if (!process.exitCode) {
    rmSync(root, { recursive: true, force: true });
  } else {
    console.log(`[preset-e2e] scratch preserved for inspection at ${root}`);
  }
}
if (keep || process.exitCode !== 0) {
  // keep the report discoverable next to the preserved scratch
  try { writeFileSync(join(root, "preset-e2e-report.json"), JSON.stringify(report, null, 2)); } catch { /* best effort */ }
}
