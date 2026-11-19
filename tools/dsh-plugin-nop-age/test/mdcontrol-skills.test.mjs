/**
 * mdcontrol-skills.test.mjs — Mission Control skills registration unit suite
 * (dsh-plugin M3-WI12, plan `2026-08-23-1852-2` Phase 3 Proof).
 *
 * Branches pinned:
 *   1. registration shape — three runtime rows (design doc §Feature Name
 *      names), explicit invocation policy, whenToUse + content present.
 *   2. route wiring — each skill's instruction body names its target
 *      `mdcontrol.*` wire method, and the documented JSON call example is
 *      ACCEPTED by the real route's payload validation (mission name →
 *      mdcontrol.run, description → mdcontrol.draft, run selection →
 *      mdcontrol.analyze). run/draft are proven via validation-order: with
 *      no agents service on the ctx, a payload that passes validation fails
 *      with the agents wire error (NOT bad-request); analyze runs the full
 *      synchronous pass-through against a fake agents service.
 *   3. dispose — the composite disposer unregisters every row.
 *   4. absent registry — null + warn log, never a throw.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MdControlError, createMdControlRoutes } from "../src/mdcontrol-routes.ts";
import {
  MISSION_CONTROL_SKILLS,
  firstJsonExampleOf,
  registerMissionControlSkills,
} from "../src/mdcontrol-skills.ts";
import { createFakeAgentsService } from "./helpers/fake-agents.mjs";

function makeFakeRegistry() {
  const active = new Map();
  const registered = [];
  const registry = {
    register(skill) {
      registered.push(skill);
      const dispose = () => active.delete(skill.name);
      active.set(skill.name, skill);
      return dispose;
    },
  };
  return { registry, registered, active };
}

function makeLogger() {
  const logs = [];
  return {
    logs,
    info: (m, f) => logs.push({ level: "info", m, f }),
    warn: (m, f) => logs.push({ level: "warn", m, f }),
  };
}

// ── 1. Registration shape ────────────────────────────────────────────────────

test("skills: three rows registered with design-doc names + explicit invocation policy", () => {
  const { registry, registered, active } = makeFakeRegistry();
  const logger = makeLogger();
  const dispose = registerMissionControlSkills(registry, logger);

  assert.ok(dispose);
  assert.deepEqual(
    MISSION_CONTROL_SKILLS.map((s) => s.name),
    ["mission-control-run", "mission-control-draft", "mission-control-analyze"],
  );
  assert.equal(registered.length, 3);
  for (const skill of registered) {
    assert.match(skill.name, /^mission-control-(run|draft|analyze)$/);
    assert.ok(typeof skill.description === "string" && skill.description.length > 20, "routing description present");
    assert.ok(typeof skill.whenToUse === "string" && skill.whenToUse.length > 0);
    assert.ok(typeof skill.content === "string" && skill.content.length > 100, "instruction body present");
    assert.deepEqual(skill.invocation, { modelInvocable: true, userInvocable: true }, "explicit all-invocable policy");
  }
  for (const name of ["mission-control-run", "mission-control-draft", "mission-control-analyze"]) {
    assert.ok(active.has(name), `${name} active after registration`);
  }
  assert.ok(logger.logs.some((l) => l.level === "info" && /skills registered/.test(l.m)));

  // ── 3. dispose unregisters every row ──
  dispose();
  assert.equal(active.size, 0, "composite disposer unregisters all three rows");
});

test("skills: absent registry → null + warn log, never a throw", () => {
  const logger = makeLogger();
  assert.equal(registerMissionControlSkills(undefined, logger), null);
  assert.ok(logger.logs.some((l) => l.level === "warn" && /ctx.skills service absent/.test(l.m)));
  assert.equal(registerMissionControlSkills(null, logger), null);
});

// ── 2. Route wiring (skill body → mdcontrol.* route → payload contract) ─────

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "mdcontrol-skills-"));
}

const ROUTE_OF = {
  "mission-control-run": "mdcontrol.run",
  "mission-control-draft": "mdcontrol.draft",
  "mission-control-analyze": "mdcontrol.analyze",
};

test("skills: each body names its target wire method and carries a parseable JSON call example", () => {
  for (const skill of MISSION_CONTROL_SKILLS) {
    assert.ok(
      skill.content.includes(`/mdcontrol/api/${ROUTE_OF[skill.name]}`),
      `${skill.name} content references its route`,
    );
    const example = firstJsonExampleOf(skill.content);
    assert.ok(example, `${skill.name} has a fenced json example`);
    assert.equal(typeof example.projectRoot, "string", `${skill.name} example carries projectRoot`);
  }
  const runExample = firstJsonExampleOf(MISSION_CONTROL_SKILLS[0].content);
  assert.equal(typeof runExample.args.mission, "string", "run example: mission name → args.mission");
  const draftExample = firstJsonExampleOf(MISSION_CONTROL_SKILLS[1].content);
  assert.equal(typeof draftExample.desc, "string", "draft example: description → desc");
  const analyzeExample = firstJsonExampleOf(MISSION_CONTROL_SKILLS[2].content);
  assert.ok("runId" in analyzeExample, "analyze example: run selection → runId (optional)");
});

test("skills wiring: run/draft JSON examples pass the REAL route payload validation (validation-order proof)", async () => {
  const root = tmpProject();
  // Mission tree so mdcontrol.run survives config bootstrap (validation is
  // what is under test; the failure must come LATER, at executor selection).
  const missionsDir = join(root, "missions");
  mkdirSync(join(missionsDir, "flows"), { recursive: true });
  writeFileSync(join(missionsDir, "demo.json"), JSON.stringify({
    name: "demo",
    roadmapPath: "docs/roadmap",
    plansDir: "docs/plans/demo",
    flowName: "native-smoke",
    commands: { test: "echo ok" },
  }), "utf8");
  writeFileSync(join(missionsDir, "flows", "native-smoke.json"), JSON.stringify({
    name: "native-smoke",
    entry: "PING",
    steps: {
      PING: {
        type: "agent",
        prompt: "Reply with the pass marker.",
        transitions: { pass: { done: "completed" }, fail: { done: "failed" } },
        onError: { done: "failed" },
      },
    },
  }), "utf8");
  mkdirSync(join(root, "docs", "roadmap"), { recursive: true });
  mkdirSync(join(root, "docs", "plans", "demo"), { recursive: true });
  // No agents on the ctx: a payload that survives validation fails LATER
  // with the agents wire error — proving the documented example is valid.
  const routes = createMdControlRoutes({ ctx: {} });

  const runExample = firstJsonExampleOf(MISSION_CONTROL_SKILLS[0].content);
  await assert.rejects(
    () => routes["mdcontrol.run"]({ ...runExample, projectRoot: root, args: { ...runExample.args, mission: "demo" } }),
    (err) => err.message.includes("agents service unavailable"),
  );

  const draftExample = firstJsonExampleOf(MISSION_CONTROL_SKILLS[1].content);
  await assert.rejects(
    () => routes["mdcontrol.draft"]({ ...draftExample, projectRoot: root, desc: "wire the mission control skills to the routes" }),
    (err) => err.message.includes("agents service unavailable"),
  );
  assert.equal(routes.guard.current(root), null, "example payload never leaves the guard occupied");
  rmSync(root, { recursive: true, force: true });
});

test("skills wiring: analyze JSON example runs the full synchronous pass-through to mdcontrol.analyze", async () => {
  const root = tmpProject();
  const runDir = join(root, "_tmp", "skill-an-target-mission-driver");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "run-state.json"), JSON.stringify({
    runId: "skill-an-target-mission-driver",
    status: "completed",
    missionName: "demo",
  }), "utf8");

  const fake = createFakeAgentsService({
    script: ["<POSTMORTEM_FILE>docs/postmortems/skill-an.md</POSTMORTEM_FILE>\n<MEMORY_UPDATED>no</MEMORY_UPDATED>"],
  });
  const routes = createMdControlRoutes({ ctx: { agents: fake.service } });

  const example = firstJsonExampleOf(MISSION_CONTROL_SKILLS[2].content);
  const result = await routes["mdcontrol.analyze"]({ ...example, projectRoot: root, runId: "skill-an-target-mission-driver" });
  assert.equal(result.targetRunId, "skill-an-target-mission-driver");
  assert.equal(result.postmortemFile, "docs/postmortems/skill-an.md");
  assert.equal(fake.state.followups.length, 1, "one native dispatch through the wired route");
  assert.ok(existsSync(result.jobDir));
  rmSync(root, { recursive: true, force: true });
});

test("skills wiring: a payload violating the documented contract is rejected as bad-request (not routed)", async () => {
  const root = tmpProject();
  const routes = createMdControlRoutes({ ctx: {} });
  await assert.rejects(
    () => routes["mdcontrol.draft"]({ projectRoot: root, desc: "" }),
    (err) => err instanceof MdControlError && err.code === "bad-request",
  );
  rmSync(root, { recursive: true, force: true });
});
