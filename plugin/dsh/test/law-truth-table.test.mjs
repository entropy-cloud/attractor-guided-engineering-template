/**
 * law-truth-table.test.mjs — AGE rule-law truth-table foundation
 * (age-autonomy M2-WI12/WI13, plan
 * `docs/plans/age-autonomy/2026-08-25-0815-1` Phase 3; grows to the WI24
 * ≥30-case M2 gate as N=2 (three hard gates) / N=3 (supporting gates) append
 * cases in this same file).
 *
 * Sections:
 *   1. seam (through the BUNDLED kernel copies — proves the assets channel):
 *      proposedAction contract malformed faces, structural-subset posture,
 *      observe-mode non-blocking, enforce deny.
 *   2. policy schema sampling: the repo's real missions/autonomy.policy.yml
 *      validates through the bundled validator; illegal fixtures deny.
 *   3. plan-structure truth table: legal / frontmatter violations /
 *      out-of-domain legacy / counting-domain / append-only line grammar.
 *   4. host adapter: real-cordis-waterfall mounting (real Context event
 *      pipeline — the host-face evidence, not a ctx mock), observation-log
 *      JSONL production, enforce-deny return, disposer semantics, and the
 *      fail-open crash path (throwing rule → allow + warn, D1 lineage).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import {
  evaluateGates,
  expandWorkItemLabel,
  getRule,
  registerRule,
  workItemRegistered,
} from "../assets/src/law-core.mjs";
import { parsePolicy, policyAgentNames, checkDistinctModelSatisfiability, resolveMaxAuditRounds } from "../assets/src/law-policy.mjs";
import { scanPlanLedger, scanRoadmapLedger, computeBasisHash, deriveCompleted, draftPlans, activePlans } from "../assets/src/ledger-sections.mjs";
import { defaultVerifyKeys, passLineFor, resolveVerifyPlan, runVerifyCommands } from "../assets/src/verify-runner.mjs";
import {
  evaluateLawCall,
  extractLawAction,
  fsLawGateIo,
  observationFileFor,
  registerLawGate,
  resolveLawActor,
} from "../src/law/host-adapter.ts";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const REAL_POLICY_FILE = join(REPO_ROOT, "missions", "autonomy.policy.yml");

const LEGAL_PLAN = `---
status: active
mission: demo
work-item: M1-WI1
verify: [test]
---
# Plan

## Phase 1 — Work

- [x] only item

## Draft Review Record

## Verification

## Closure
`;

/* ── scratch project factory ─────────────────────────────────────────────── */

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "law-truth-table-"));
}

function writePolicy(root, body) {
  const file = join(root, "missions", "autonomy.policy.yml");
  mkdirSync(join(root, "missions"), { recursive: true });
  writeFileSync(file, body, "utf8");
  return file;
}

function writeMission(root, extra = {}) {
  const file = join(root, "missions", "demo.json");
  mkdirSync(join(root, "missions"), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({
      name: "demo",
      roadmapPath: "docs/backlog/demo-roadmap.md",
      plansDir: "docs/plans/demo",
      commands: { test: "true" },
      autonomyPolicy: "missions/autonomy.policy.yml",
      ...extra,
    }),
    "utf8",
  );
  return file;
}

function writePlan(root, rel, content = LEGAL_PLAN) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, "utf8");
  return p;
}

const POLICY_BODY = (mode) => `version: 1
gates:
  - id: plan-structure
    match: "{{plansDir}}/**/*.md"
    rule: plan-structure
    mode: ${mode}
`;

/* ── 1. seam (bundled kernel copies) ─────────────────────────────────────── */

test("seam: unknown proposedAction type denies malformed through the bundled copy", () => {
  const out = evaluateGates(
    { type: "teleport", path: "/x.md", proposedContent: "c" },
    { policy: { gates: [] } },
  );
  assert.equal(out.decision, "deny");
  assert.equal(out.malformed, true);
  assert.match(out.reason, /malformed-action: unknown proposedAction\.type/);
});

test("seam: missing path / missing proposedContent deny malformed", () => {
  for (const bad of [
    { type: "write", proposedContent: "c" },
    { type: "edit", path: "/x.md" },
  ]) {
    const out = evaluateGates(bad, { policy: { gates: [] } });
    assert.equal(out.decision, "deny", JSON.stringify(bad));
    assert.equal(out.malformed, true);
  }
});

test("seam: absent actor → structural-subset unverified-writer note, never a deny by itself", () => {
  const out = evaluateGates(
    { type: "write", path: "/p/x.md", proposedContent: LEGAL_PLAN },
    { policy: { gates: [] } },
  );
  assert.equal(out.decision, "allow");
  assert.deepEqual(out.notes, ["unverified-writer"]);
});

test("seam: observe-mode gate records a would-deny without blocking", () => {
  const out = evaluateGates(
    { type: "write", path: "/p/x.md", proposedContent: "---\nstatus: completed\n---\n" },
    {
      policy: { gates: [{ id: "plan-structure", match: "{{plansDir}}/**/*.md", rule: "plan-structure", mode: "observe" }] },
      ctx: { plansDir: "/p" },
    },
  );
  assert.equal(out.decision, "allow");
  assert.equal(out.observations.length, 1);
  assert.equal(out.observations[0].verdict, "deny");
  assert.equal(out.observations[0].mode, "observe");
});

test("seam: enforce-mode gate denies with a structured reason", () => {
  const out = evaluateGates(
    { type: "write", path: "/p/x.md", proposedContent: "---\nstatus: completed\n---\n" },
    {
      policy: { gates: [{ id: "plan-structure", match: "{{plansDir}}/**/*.md", rule: "plan-structure", mode: "enforce" }] },
      ctx: { plansDir: "/p" },
    },
  );
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /gate plan-structure \(plan-structure\) denied/);
});

/* ── 2. policy schema sampling (bundled validator, real instance) ────────── */

test("policy: the repo's real autonomy.policy.yml validates through the bundled validator", () => {
  const r = parsePolicy(readFileSync(REAL_POLICY_FILE, "utf8"));
  assert.equal(r.ok, true, r.errors?.join("; "));
  assert.deepEqual(policyAgentNames(r.policy), ["drafter", "reviewer", "auditor", "executor"]);
});

test("policy: sampling of illegal fixtures denies with pointed reasons", () => {
  for (const [label, text, re] of [
    ["missing version", "gates: []\n", /missing required key "version"/],
    ["unknown rule", `version: 1\ngates:\n  - id: g\n    match: "{{plansDir}}"\n    rule: ghost-rule\n`, /not in the kernel registry/],
    ["dispatch to undefined agent", `version: 1\ndispatch:\n  closure-audit: phantom\n`, /references undefined agent "phantom"/],
    ["dir prefix without cap", `version: 1\nagents:\n  a:\n    mode: fresh\n    fixedPrefix: [ { kind: dir, ref: d } ]\n`, /maxFileBytes is required when kind is dir/],
    ["bad prefix kind", `version: 1\nagents:\n  a:\n    mode: fresh\n    fixedPrefix: [ { kind: tape, ref: d } ]\n`, /kind must be one of/],
    ["trigger syntax out of subset", `version: 1\ntriggers:\n  - when: "plan.full-tick xor vibes"\n    dispatch: closure-audit\n`, /unknown predicate "xor"|unexpected trailing/],
    ["unknown top-level key", `version: 1\nbogus: 1\n`, /unknown top-level key "bogus"/],
  ]) {
    const r = parsePolicy(text);
    assert.equal(r.ok, false, label);
    assert.match(r.errors.join(" | "), re, label);
  }
});

/* ── 3. plan-structure truth table (bundled rule) ────────────────────────── */

const ps = (content, ctx = {}) =>
  evaluateGates(
    { type: "write", path: "/p/x.md", proposedContent: content },
    { policy: { gates: [{ id: "g", match: "{{plansDir}}/**/*.md", rule: "plan-structure", mode: "enforce" }] }, ctx: { plansDir: "/p", ...ctx } },
  );

test("truth table: legal frontmatter plan allows", () => {
  assert.equal(ps(LEGAL_PLAN).decision, "allow");
});

test("truth table: derived-status write denies (completed is never writable)", () => {
  const out = ps(LEGAL_PLAN.replace("status: active", "status: completed"));
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /derived status/);
});

test("truth table: unknown frontmatter key denies", () => {
  const out = ps(LEGAL_PLAN.replace("verify: [test]", "verify: [test]\nbogus: 1"));
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /unknown field "bogus"/);
});

test("truth table: claim pair outside active denies", () => {
  const out = ps(
    LEGAL_PLAN
      .replace("status: active", "status: draft")
      .replace("verify: [test]", 'claim: attempt-r-s-abc12345\nclaim-expires: "2026-01-01T00:00:00Z"'),
  );
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /only allowed while status is "active"/);
});

test("truth table: agent name not in the injected policy list denies", () => {
  const out = ps(LEGAL_PLAN.replace("verify: [test]", 'agent: ghost'), { agentNames: ["drafter", "auditor"] });
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /not defined in the autonomy policy agents section/);
});

test("truth table: out-of-domain column-0 checkbox denies", () => {
  const out = ps(`${LEGAL_PLAN}\nprose\n\n- [ ] stray\n`);
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /out-of-domain-checkbox/);
});

test("truth table: malformed append-only line denies", () => {
  const out = ps(LEGAL_PLAN.replace("## Closure\n", "## Closure\n\n- accepted #bogus\n"));
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /malformed-accepted|invalid ledger id/);
});

test("truth table: broken frontmatter syntax (unclosed block) denies, not domain-skip", () => {
  const out = ps("---\nstatus: active\nmission: demo\nwork-item: M1-WI1\nnever closed");
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /never closed/);
});

test("truth table: legacy-format plan is out of domain → allow with format note", () => {
  const out = ps("# Plan\n\n> Plan Status: completed\n\n## Phase 1 — W\n\n- [x] done\n");
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /format=legacy .*outside plan-structure domain/);
});

test("truth table: agentNames absent degrades to skip + the record carries no agent error", () => {
  const out = ps(LEGAL_PLAN.replace("verify: [test]", 'agent: whoever'));
  assert.equal(out.decision, "allow");
});

/* ── 4. host adapter ─────────────────────────────────────────────────────── */

test("adapter: extractLawAction covers write/edit/str_replace_editor shapes", () => {
  const root = tmpProject();
  try {
    const plan = writePlan(root, "docs/plans/demo/x.md");
    const w = extractLawAction({ name: "write", arguments: { file_path: plan, content: LEGAL_PLAN } }, fsLawGateIo);
    assert.equal(w.proposedContent, LEGAL_PLAN);
    const e = extractLawAction(
      { name: "edit", arguments: { file_path: plan, old_string: "status: active", new_string: "status: held\nhold: why" } },
      fsLawGateIo,
    );
    assert.match(e.proposedContent, /status: held/);
    assert.equal(e.disk, LEGAL_PLAN);
    const ins = extractLawAction(
      { name: "str_replace_editor", arguments: { path: plan, command: "insert", insert_line: 4, new_str: "group: g1" } },
      fsLawGateIo,
    );
    assert.match(ins.proposedContent, /group: g1/);
    assert.equal(extractLawAction({ name: "bash", arguments: { cmd: "ls" } }, fsLawGateIo), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter: resolveLawActor maps exec.agent.id; absent agent → structural subset", () => {
  assert.deepEqual(resolveLawActor({ agent: { id: "ses-42" } }), { actor: { id: "ses-42" } });
  assert.deepEqual(resolveLawAgentless(), {});
  function resolveLawAgentless() {
    return resolveLawActor({});
  }
});

test("adapter: no governing policy → allow passthrough, no observation records", () => {
  const root = tmpProject();
  try {
    const plan = writePlan(root, "docs/plans/demo/x.md");
    const out = evaluateLawCall({ name: "write", arguments: { file_path: plan, content: LEGAL_PLAN } }, {}, fsLawGateIo);
    assert.equal(out.decision, "allow");
    assert.equal(out.records.length, 0);
    assert.equal(out.lawCtx, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter: real cordis waterfall drives a live evaluate + observation log JSONL (host-face evidence)", async () => {
  const root = tmpProject();
  const ctx = new Context();
  try {
    writeMission(root);
    writePolicy(root, POLICY_BODY("observe"));
    const plan = writePlan(root, "docs/plans/demo/x.md");
    const logs = [];
    const logger = {
      info: (m, f) => logs.push({ level: "info", m, f }),
      warn: (m, f) => logs.push({ level: "warn", m, f }),
    };
    const dispose = registerLawGate(ctx, logger);
    const decision = await ctx.waterfall(
      null,
      "tools/pre-execute",
      { name: "write", arguments: { file_path: plan, content: LEGAL_PLAN.replace("status: active", "status: completed") }, agent: { id: "ses-live-1" } },
      () => Promise.resolve({ kind: "allow" }),
    );
    // observe mode: the would-deny is recorded, the call still passes through
    assert.equal(decision.kind, "allow");
    const obsFile = observationFileFor(root);
    assert.ok(existsSync(obsFile), "observation log produced");
    const lines = readFileSync(obsFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].rule, "plan-structure");
    assert.equal(lines[0].mode, "observe");
    assert.equal(lines[0].verdict, "deny");
    assert.equal(lines[0].actor.id, "ses-live-1");
    assert.equal(lines[0].enforced, false);
    assert.ok(logs.some((l) => l.level === "info" && /plan-structure/.test(l.m)));
    dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter: enforce-mode deny returns the host deny decision through the waterfall", async () => {
  const root = tmpProject();
  const ctx = new Context();
  try {
    writeMission(root);
    writePolicy(root, POLICY_BODY("enforce"));
    const plan = writePlan(root, "docs/plans/demo/x.md");
    const dispose = registerLawGate(ctx, { info() {}, warn() {} });
    const decision = await ctx.waterfall(
      null,
      "tools/pre-execute",
      { name: "write", arguments: { file_path: plan, content: "---\nstatus: completed\n---\n" } },
      () => Promise.resolve({ kind: "allow" }),
    );
    assert.equal(decision.kind, "deny");
    assert.match(decision.reason, /gate plan-structure \(plan-structure\) denied/);
    dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter: disposer removes the listener; the pipeline runs clean afterwards", async () => {
  const ctx = new Context();
  let calls = 0;
  const dispose = registerLawGate(ctx, { info() {}, warn() {} });
  const exec = { name: "bash", arguments: { cmd: "ls" } };
  await ctx.waterfall(null, "tools/pre-execute", exec, () => { calls++; return Promise.resolve({ kind: "allow" }); });
  assert.equal(calls, 1);
  dispose();
  await ctx.waterfall(null, "tools/pre-execute", exec, () => { calls++; return Promise.resolve({ kind: "allow" }); });
  assert.equal(calls, 2);
});

test("adapter: rule crash fails open per-rule — allow + rule-error observation (02 §6)", async () => {
  const root = tmpProject();
  const ctx = new Context();
  try {
    // a REAL kernel rule throw, registered into the same bundled registry
    // instance the adapter evaluates through
    registerRule("kaboom-rule", () => {
      throw new Error("kaboom");
    });
    writeMission(root);
    writePolicy(
      root,
      `version: 1\ngates:\n  - id: boom\n    match: "{{plansDir}}/**/*.md"\n    rule: kaboom-rule\n    mode: enforce\n`,
    );
    const plan = writePlan(root, "docs/plans/demo/x.md");
    const infos = [];
    const dispose = registerLawGate(ctx, { info: (m, f) => infos.push({ m, f }), warn() {} });
    const decision = await ctx.waterfall(
      null,
      "tools/pre-execute",
      { name: "write", arguments: { file_path: plan, content: LEGAL_PLAN } },
      () => Promise.resolve({ kind: "allow" }),
    );
    assert.equal(decision.kind, "allow");
    const lines = readFileSync(observationFileFor(root), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines[0].rule, "kaboom-rule");
    assert.match(lines[0].reason, /rule-error: kaboom/);
    assert.equal(lines[0].enforced, false);
    dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter: whole-face crash fails open — allow + warn (D1 lineage)", async () => {
  const root = tmpProject();
  const ctx = new Context();
  try {
    writeMission(root);
    writePolicy(root, POLICY_BODY("enforce"));
    const plan = writePlan(root, "docs/plans/demo/x.md");
    const throwingIo = {
      ...fsLawGateIo,
      readTextFile() {
        throw new Error("disk exploded");
      },
    };
    const warns = [];
    const dispose = registerLawGate(ctx, { info() {}, warn: (m) => warns.push(m) }, throwingIo);
    // edit command takes the readTextFile path → the adapter's own try/catch
    const decision = await ctx.waterfall(
      null,
      "tools/pre-execute",
      { name: "edit", arguments: { file_path: plan, old_string: "a", new_string: "b" } },
      () => Promise.resolve({ kind: "allow" }),
    );
    assert.equal(decision.kind, "allow");
    assert.ok(warns.some((m) => /internal error — failing open/.test(m)));
    dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* ── 5. hard gate 1 truth table: closure-audit-binding (M2-WI14, 02 §4.1) ─── */

const AUDIT_ID = "#audit-2026-08-25-205251-mission-driver-demo-plan-1-3fb2c1a8";
const OTHER_AUDIT_ID = "#audit-2026-08-25-205251-mission-driver-demo-plan-2-7ac91e44";

function planWithClosure(closureBody, { status = "active", ticked = true } = {}) {
  return `---
status: ${status}
mission: demo
work-item: M1-WI1
verify: [test]
---
# Plan

## Phase 1 — Work

- ${ticked ? "[x]" : "[ ]"} only item

## Draft Review Record

## Verification

## Closure

${closureBody}`;
}

function binding(content, opts = {}) {
  return evaluateGates(
    { type: "write", path: "/p/x.md", proposedContent: content, ...(opts.actor ? { actor: opts.actor } : {}) },
    {
      policy: { gates: [{ id: "g", match: "{{plansDir}}/**/*.md", rule: opts.rule ?? "closure-audit-binding", mode: "enforce" }] },
      currentFileState: opts.current ? { text: opts.current } : undefined,
      ctx: { plansDir: "/p" },
    },
  );
}

test("gate1: legal same-id pairing allows (structural face notes it does not claim writer verification)", () => {
  const out = binding(planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${AUDIT_ID}：审计通过，证据见 Verification\n`));
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /structural face verified/);
  assert.match(out.observations[0].reason, /writer face not evaluated/);
  assert.ok(out.notes.includes("unverified-writer"));
});

test("gate1: accepted with a wrong id (no same-id dispatch) denies pointing at the dispatch-first path", () => {
  const out = binding(planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${OTHER_AUDIT_ID}：结论\n`));
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /closure-audit-binding: unbound conclusion line\(s\) #audit-/);
  assert.match(out.reason, /requires a same-id dispatch line/);
});

test("gate1: accepted without any dispatch at all denies (forged receipt)", () => {
  const out = binding(planWithClosure(`- accepted ${AUDIT_ID}：结论\n`));
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /unbound conclusion line\(s\)/);
});

test("gate1: dispatch without accepted is the legal in-flight intermediate state — allow, never a deny", () => {
  const out = binding(planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n`));
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /structural face verified/);
});

test("gate1: accepted written by the dispatched auditor session allows; a third session denies (actor face)", () => {
  const current = planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n`);
  const proposed = planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${AUDIT_ID}：审计通过\n`);
  const wrong = binding(proposed, { current, actor: { id: "ses-impostor" } });
  assert.equal(wrong.decision, "deny");
  assert.match(wrong.reason, /written by actor ses-impostor but dispatched to ses_auditor_1/);
  const right = binding(proposed, { current, actor: { id: "ses_auditor_1" } });
  assert.equal(right.decision, "allow");
  assert.match(right.observations[0].reason, /accepted-writer session match/);
});

test("gate1: new dispatch lines from a non-dispatcher role deny; engine/supervisor allow; id-only actor notes instead", () => {
  const current = planWithClosure(``);
  const proposed = planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n`);
  const executorWrite = binding(proposed, { current, actor: { id: "ses-exec-1", role: "executor" } });
  assert.equal(executorWrite.decision, "deny");
  assert.match(executorWrite.reason, /dispatch .* written by role executor — dispatch lines are written by the dispatcher/);
  assert.equal(binding(proposed, { current, actor: { id: "ses-flow-1", role: "engine" } }).decision, "allow");
  const idOnly = binding(proposed, { current, actor: { id: "ses-flow-1" } });
  assert.equal(idOnly.decision, "allow");
  assert.match(idOnly.observations[0].reason, /dispatch-line writer role not verifiable on this face \(id-only actor/);
});

test("gate1: plan-face accepted line carrying the roadmap findings lexeme denies", () => {
  const out = binding(planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${AUDIT_ID} findings=none：审计通过\n`));
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /accepted-findings-mismatch/);
});

test("gate1: malformed models= lineage suffix denies with the legal shape; the legal pair parses into the record", () => {
  const half = binding(planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_auditor_1 models={exec:glm-5.2}\n`));
  assert.equal(half.decision, "deny");
  assert.match(half.reason, /models= lineage suffix must be exactly ` models=\{exec:<name>,aud:<name>\}`/);
  const legal = binding(planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_auditor_1 models={exec:glm-5.2,aud:glm-5.2-high}\n`));
  assert.equal(legal.decision, "allow");
  const scan = scanPlanLedger(legal.observations.length > 0 ? planWithClosure(`- dispatch audit ${AUDIT_ID} to ses_a models={exec:a1,aud:a2}\n`) : "");
  assert.deepEqual(scan.closure.dispatches[0].models, { exec: "a1", aud: "a2" });
});

test("gate1: untouched ## Closure area stays outside the interception target (not full-tick)", () => {
  const body = `- dispatch audit ${AUDIT_ID} to ses_auditor_1\n`;
  const current = planWithClosure(body, { ticked: false });
  const proposed = planWithClosure(body, { ticked: false }).replace("- [ ] only item", "- [x] only item\n- [ ] second item");
  const out = binding(proposed, { current });
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /## Closure area untouched/);
});

test("gate1: legacy-format plan is out of domain — allow, no false kill", () => {
  const out = binding("# Plan\n\n> Plan Status: active\n\n## Closure\n\n- accepted #audit-x\n");
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /outside domain \(dual-read transition\)/);
});

/* ── 6. hard gate 1 truth table: roadmap-audit-binding (01 §3.3 isomorph) ─── */

function roadmapWith(darBody) {
  return `---
audit-rounds: 2
---
# Roadmap

### M1 — First

- [x] WI1 thing

## Deep Audit Record

${darBody}`;
}

test("gate1-roadmap: legal dispatch/accepted pair with findings lexeme allows", () => {
  const out = binding(roadmapWith(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${AUDIT_ID} findings=none：审计通过\n`), { rule: "roadmap-audit-binding" });
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /structural face verified/);
});

test("gate1-roadmap: accepted missing the findings lexeme denies (01 §3.3 required mode)", () => {
  const out = binding(roadmapWith(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${AUDIT_ID}：missing findings token\n`), { rule: "roadmap-audit-binding" });
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /accepted-findings-mismatch/);
});

test("gate1-roadmap: unbound accepted denies; dispatch-only allows as the in-flight state", () => {
  const forged = binding(roadmapWith(`- accepted ${AUDIT_ID} findings=items：结论\n`), { rule: "roadmap-audit-binding" });
  assert.equal(forged.decision, "deny");
  assert.match(forged.reason, /unbound conclusion line\(s\)/);
  const inflight = binding(roadmapWith(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n`), { rule: "roadmap-audit-binding" });
  assert.equal(inflight.decision, "allow");
});

test("gate1-roadmap: untouched Deep Audit Record area and non-roadmap files stay out of domain", () => {
  const dar = `- dispatch audit ${AUDIT_ID} to ses_auditor_1\n`;
  const current = roadmapWith(dar);
  const proposed = current.replace("- [x] WI1 thing", "- [x] WI1 thing\n- [ ] WI2 next");
  const out = binding(proposed, { current, rule: "roadmap-audit-binding" });
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /untouched/);
  const planFile = binding(LEGAL_PLAN, { rule: "roadmap-audit-binding" });
  assert.equal(planFile.decision, "allow");
  assert.match(planFile.observations[0].reason, /no ## Deep Audit Record section — outside domain/);
});

test("gate1-roadmap: accepted writer face matches the dispatched session (actor face)", () => {
  const current = roadmapWith(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n`);
  const proposed = roadmapWith(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${AUDIT_ID} findings=none：审计通过\n`);
  const wrong = binding(proposed, { current, rule: "roadmap-audit-binding", actor: { id: "ses-other" } });
  assert.equal(wrong.decision, "deny");
  assert.match(wrong.reason, /dispatched to ses_auditor_1/);
  const right = binding(proposed, { current, rule: "roadmap-audit-binding", actor: { id: "ses_auditor_1" } });
  assert.equal(right.decision, "allow");
});

/* ── 7. requireDistinctModel satisfiability (02 §4.9, check-policy face) ──── */

test("policy-distinct: executor/auditor sharing the model pair fails validation; the explicit downgrade channel passes", () => {
  const agents = (auditorExtra) => `version: 1
agents:
  executor:
    mode: pooled
    poolKey: "executor:{projectRoot}"
    model: { provider: p, model: m, reasoningEffort: default }
  auditor:
    mode: fresh
    model: { provider: p, model: m, reasoningEffort: high }
    requireDistinctModel: true
${auditorExtra}
dispatch:
  execute: executor
  closure-audit: auditor
  deep-audit: auditor
`;
  const bad = parsePolicy(agents(""));
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(" | "), /agents\.auditor: requireDistinctModel is unsatisfiable/);
  assert.match(bad.errors.join(" | "), /downgrade: single-model/);
  const downgraded = parsePolicy(agents("    downgrade: single-model"));
  assert.equal(downgraded.ok, true, downgraded.errors?.join("; "));
  // the repo's real policy declares the channel and satisfies the check
  const real = parsePolicy(readFileSync(REAL_POLICY_FILE, "utf8"));
  assert.equal(real.ok, true);
  assert.deepEqual(checkDistinctModelSatisfiability(real.policy), []);
  assert.equal(real.policy.agents.auditor.downgrade, "single-model");
});

/* ── 8. hard gate 2 truth table: writer-identity (M2-WI15, 02 §4.2) ───────── */

const REVIEW_ID = "#review-2026-08-25-205251-mission-driver-demo-plan-1-84a1c2e6";

function transitionPlan({ status = "draft", drr = "", fmExtra = "", ticked = false } = {}) {
  return `---
status: ${status}
mission: demo
work-item: M1-WI1
verify: [test]
${fmExtra}---
# Plan

## Phase 1 — Work

- ${ticked ? "[x]" : "[ ]"} only item

## Draft Review Record
${drr}
## Verification

## Closure
`;
}

const PAIRED_DRR = `- dispatch review ${REVIEW_ID} to ses_reviewer_2
- 2026-08-25：iteration 1，共识 acceptable-as-is ${REVIEW_ID}
`;
const OPEN_DRR = `- dispatch review ${REVIEW_ID} to ses_reviewer_2
`;

function gate2(current, proposed, actor) {
  return binding(proposed, { current, rule: "writer-identity", ...(actor ? { actor } : {}) });
}

test("gate2: draft→active by the dispatched reviewer with the paired receipt allows", () => {
  const out = gate2(
    transitionPlan({ drr: OPEN_DRR }),
    transitionPlan({ status: "active", drr: PAIRED_DRR }),
    { id: "ses_reviewer_2" },
  );
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /draft→active with paired review receipt by the dispatched reviewer ses_reviewer_2/);
});

test("gate2: draft→active by a mismatched session denies naming the dispatched reviewer", () => {
  const out = gate2(
    transitionPlan({ drr: OPEN_DRR }),
    transitionPlan({ status: "active", drr: PAIRED_DRR }),
    { id: "ses-drafter-self" },
  );
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /draft→active written by actor ses-drafter-self but the paired review was dispatched to ses_reviewer_2/);
});

test("gate2: draft→active without a conclusion line denies pointing at the receipt path", () => {
  const out = gate2(
    transitionPlan({ drr: OPEN_DRR }),
    transitionPlan({ status: "active", drr: OPEN_DRR }),
    { id: "ses_reviewer_2" },
  );
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /draft→active requires the Draft Review Record to carry a dispatch review line WITH its same-id conclusion line/);
});

test("gate2: executors never write status — role face and claim-holder face", () => {
  const byRole = gate2(
    transitionPlan({ drr: PAIRED_DRR }),
    transitionPlan({ status: "active", drr: PAIRED_DRR }),
    { id: "ses_x", role: "executor" },
  );
  assert.equal(byRole.decision, "deny");
  assert.match(byRole.reason, /executors never write status/);
  const byClaim = gate2(
    transitionPlan({
      status: "active",
      drr: PAIRED_DRR,
      ticked: true,
      fmExtra: 'claim: attempt-2026-08-25-205251-mission-driver-ses_exec_1-1a2b3c4d\nclaim-expires: "2099-01-01T00:00:00Z"\n',
    }),
    transitionPlan({ status: "held", drr: PAIRED_DRR, ticked: true, fmExtra: 'hold: "why"\n' }),
    { id: "ses_exec_1" },
  );
  assert.equal(byClaim.decision, "deny");
  assert.match(byClaim.reason, /actor ses_exec_1 is the registered claim holder \(executor\)/);
});

test("gate2: held→active with failures reset + hold removed allows; a missing reset denies malformed-transition", () => {
  const heldFm = 'hold: "等待解锁"\nfailures: 2\n';
  const ok = gate2(
    transitionPlan({ status: "held", drr: PAIRED_DRR, fmExtra: heldFm }),
    transitionPlan({ status: "active", drr: PAIRED_DRR }),
    { id: "ses_reviewer_2" },
  );
  assert.equal(ok.decision, "allow");
  assert.match(ok.observations[0].reason, /held→active with failures reset by the new review's dispatched reviewer ses_reviewer_2/);
  const noReset = gate2(
    transitionPlan({ status: "held", drr: PAIRED_DRR, fmExtra: heldFm }),
    transitionPlan({ status: "active", drr: PAIRED_DRR, fmExtra: "failures: 2\n" }),
    { id: "ses_reviewer_2" },
  );
  assert.equal(noReset.decision, "deny");
  assert.match(noReset.reason, /malformed held→active transition — the same write must reset failures to 0 and remove hold/);
  const holdKept = gate2(
    transitionPlan({ status: "held", drr: PAIRED_DRR, fmExtra: heldFm }),
    transitionPlan({ status: "active", drr: PAIRED_DRR, fmExtra: 'hold: "still held"\n' }),
    { id: "ses_reviewer_2" },
  );
  assert.equal(holdKept.decision, "deny");
  assert.match(holdKept.reason, /malformed held→active/);
});

test("gate2: held→active unlock writer degrades to the unverified-writer note (identity-dependent, no receipt syntax)", () => {
  const out = gate2(
    transitionPlan({ status: "held", drr: PAIRED_DRR, fmExtra: 'hold: "x"\nfailures: 1\n' }),
    transitionPlan({ status: "active", drr: PAIRED_DRR }),
    { id: "ses-supervisor-route" },
  );
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /supervisor unlock arrives via mdcontrol\.unlock \(M3-WI28, role=supervisor writer\); this face has no receipt syntax to verify the unlock writer, not claiming verification/);
});

test("gate2: review lease — third party denied, the open reviewer/supervisor/engine allowed, no-actor degrades to a note", () => {
  const current = transitionPlan({ drr: OPEN_DRR, ticked: true });
  const elsewhere = current.replace("- [x] only item", "- [x] only item\n- [ ] second item");
  const third = gate2(current, elsewhere, { id: "ses-third-party" });
  assert.equal(third.decision, "deny");
  assert.match(third.reason, /review lease active — dispatch review .* to ses_reviewer_2 is not yet concluded/);
  assert.equal(gate2(current, elsewhere, { id: "ses_reviewer_2" }).decision, "allow");
  assert.equal(gate2(current, elsewhere, { role: "supervisor" }).decision, "allow");
  assert.equal(gate2(current, elsewhere, { role: "engine" }).decision, "allow");
  const noActor = gate2(current, elsewhere);
  assert.equal(noActor.decision, "allow");
  assert.match(noActor.observations[0].reason, /third-party writer cannot be excluded, not claiming verification/);
});

test("gate2: lease ends when the same write lands the same-id conclusion (reviewer flips to active)", () => {
  const out = gate2(
    transitionPlan({ drr: OPEN_DRR }),
    transitionPlan({ status: "active", drr: PAIRED_DRR }),
    { id: "ses_reviewer_2" },
  );
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /draft→active with paired review receipt/);
});

/* ── 8b. M3-WI29 lease increment: latest-line semantics (crash-redispatch corpus) ── */

const REDISPATCH_OLD_ID = "#review-2026-08-26-130203-mission-driver-demo-plan-1-1111aaaa";
const REDISPATCH_NEW_ID = "#review-2026-08-26-130203-mission-driver-demo-plan-1-2222bbbb";
const REDISPATCH_IN_FLIGHT_DRR = `- dispatch review ${REDISPATCH_OLD_ID} to ses_crash_dead
- dispatch review ${REDISPATCH_NEW_ID} to ses_review_new
`;
const REDISPATCH_CONCLUDED_DRR = `- dispatch review ${REDISPATCH_OLD_ID} to ses_crash_dead
- dispatch review ${REDISPATCH_NEW_ID} to ses_review_new
- 2026-08-26：iteration 1，共识 acceptable-as-is ${REDISPATCH_NEW_ID}
`;

test("gate2 M3-WI29: in-flight redispatch — the LATEST unpaired line holds the lease; the superseded dead session is denied as a third party", () => {
  const current = transitionPlan({ drr: REDISPATCH_IN_FLIGHT_DRR, ticked: true });
  const elsewhere = current.replace("- [x] only item", "- [x] only item\n- [ ] second item");
  const drafter = gate2(current, elsewhere, { id: "ses-drafter-self" });
  assert.equal(drafter.decision, "deny");
  assert.match(
    drafter.reason,
    new RegExp(`review lease active — dispatch review ${REDISPATCH_NEW_ID} to ses_review_new is not yet concluded`),
  );
  assert.match(drafter.reason, /lease holder = the LATEST dispatch line, superseded earlier lines hold no lease — M3-WI29/);
  const dead = gate2(current, elsewhere, { id: "ses_crash_dead" });
  assert.equal(dead.decision, "deny", "the crash-orphaned superseded line holds no lease — its dead session is a third party now");
  assert.match(dead.reason, /review lease active/);
  assert.equal(gate2(current, elsewhere, { id: "ses_review_new" }).decision, "allow");
});

test("gate2 M3-WI29: concluded redispatch — a paired LATEST line closes the lease even while the crash-orphaned earlier line stays unpaired (drafter write face unblocked)", () => {
  const current = transitionPlan({ drr: REDISPATCH_CONCLUDED_DRR, ticked: true });
  const elsewhere = current.replace("- [x] only item", "- [x] only item\n- [ ] second item");
  const drafter = gate2(current, elsewhere, { id: "ses-drafter-self" });
  assert.equal(drafter.decision, "allow", "lease closed by the paired latest line — redispatch no longer locks the plan write face forever (the M3-WI29 deadlock fix)");
  assert.match(drafter.observations[0].reason, /no status transition in this write/);
});

test("gate2: terminal disposition — registered reviewer/supervisor verified, other ids degrade to the note (never impersonated)", () => {
  const active = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: true });
  const cancelled = transitionPlan({ status: "cancelled", drr: PAIRED_DRR, ticked: true });
  const reviewer = gate2(active, cancelled, { id: "ses_reviewer_2" });
  assert.equal(reviewer.decision, "allow");
  assert.match(reviewer.observations[0].reason, /disposition by registered reviewer ses_reviewer_2/);
  assert.match(gate2(active, cancelled, { role: "supervisor" }).observations[0].reason, /disposition by the supervisor/);
  const other = gate2(active, cancelled, { id: "ses-unknown" });
  assert.equal(other.decision, "allow");
  assert.match(other.observations[0].reason, /disposition writer identity is role-dependent with no receipt syntax/);
});

test("gate2: illegal edges deny — active→draft resurrection of the draft state and terminal resurrection", () => {
  const active = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: true });
  const backToDraft = gate2(active, transitionPlan({ status: "draft", drr: PAIRED_DRR, ticked: true }), { id: "ses_reviewer_2" });
  assert.equal(backToDraft.decision, "deny");
  assert.match(backToDraft.reason, /illegal transition active→draft/);
  const cancelled = transitionPlan({ status: "cancelled", drr: PAIRED_DRR, ticked: true });
  const resurrect = gate2(cancelled, active, { id: "ses_reviewer_2" });
  assert.equal(resurrect.decision, "deny");
  assert.match(resurrect.reason, /illegal transition cancelled→active .* terminal states never resurrect/);
});

test("gate2: unchanged status and the no-currentFileState face stay inert", () => {
  const current = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: true });
  const unchanged = gate2(current, current.replace("only item", "only item\n- [ ] another"), { id: "ses_exec_1" });
  assert.equal(unchanged.decision, "allow");
  assert.match(unchanged.observations[0].reason, /no status transition in this write/);
  const singleFile = binding(current, { rule: "writer-identity" });
  assert.equal(singleFile.decision, "allow");
  assert.match(singleFile.observations[0].reason, /no currentFileState — status transition and review lease not observable/);
});

/* ── 9. hard gate 3 truth table: plan-completed (M2-WI16, 02 §4.3) ────────── */

// gate3 routes through evaluateGates with a custom policy+ctx so the clock
// (ctx.now) and defaultVerifyKeys injections stay honest.
function gate3ctx(current, proposed, ctx = {}, actor) {
  return evaluateGates(
    { type: "write", path: "/p/x.md", proposedContent: proposed, ...(actor ? { actor } : {}) },
    {
      policy: { gates: [{ id: "g", match: "{{plansDir}}/**/*.md", rule: "plan-completed", mode: "enforce" }] },
      currentFileState: current !== null ? { text: current } : undefined,
      ctx: { plansDir: "/p", ...ctx },
    },
  );
}

function fullTickPlan({ fmExtra = "", closureBody = "", verificationBody = "" } = {}) {
  return `---
status: active
mission: demo
work-item: M1-WI1
verify: [test]
${fmExtra}---
# Plan

## Phase 1 — Work

- [x] only item

## Draft Review Record

## Verification
${verificationBody}
## Closure
${closureBody}`;
}

function completedPlan() {
  const base = fullTickPlan({ closureBody: "" });
  const hash = computeBasisHash(base);
  return fullTickPlan({
    closureBody: `- dispatch audit ${AUDIT_ID} to ses_auditor_1 models={exec:glm-5.2,aud:glm-5.2}\n- accepted ${AUDIT_ID}：审计通过\n`,
    verificationBody: `\n- pass test run-1 basisHash=${hash} exit=0\n`,
  });
}

test("gate3-①: full-tick + bound receipts + matching pass basisHash → completion formula satisfied → allow", () => {
  const plan = completedPlan();
  assert.equal(deriveCompleted(plan).completed, true);
  const out = gate3ctx(null, plan);
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /completion formula satisfied/);
});

test("gate3-①: reworked full-tick with STALE pass basisHash denies pointing at re-verification (rework reuse case)", () => {
  const plan = completedPlan().replace("- [x] only item", "- [x] only item\n- [x] rework item");
  assert.equal(deriveCompleted(plan).completed, false);
  const out = gate3ctx(null, plan);
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /completion formula is unsatisfied — .*basis-hash-mismatch:test/);
});

test("gate3-②: full-tick transition by the claim holder clearing the claim → allow entering awaitingClosure", () => {
  const current = fullTickPlan({ fmExtra: 'claim: attempt-2026-08-25-205251-mission-driver-ses_exec_1-1a2b3c4d\nclaim-expires: "2099-01-01T00:00:00Z"\n' }).replace(
    "- [x] only item",
    "- [ ] only item",
  );
  const proposed = fullTickPlan({});
  const out = gate3ctx(current, proposed, {}, { id: "ses_exec_1" });
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /entering awaitingClosure \(claim cleared in the same write\) by the claim holder ses_exec_1/);
});

test("gate3-②: no claim / wrong holder / expired claim / residual claim each deny with the legal path", () => {
  const currentNoClaim = fullTickPlan({}).replace("- [x] only item", "- [ ] only item");
  const noClaim = gate3ctx(currentNoClaim, fullTickPlan({}));
  assert.equal(noClaim.decision, "deny");
  assert.match(noClaim.reason, /without an audit receipt and without a valid claim in the prior state/);

  const currentClaim = fullTickPlan({ fmExtra: 'claim: attempt-2026-08-25-205251-mission-driver-ses_exec_1-1a2b3c4d\nclaim-expires: "2099-01-01T00:00:00Z"\n' }).replace("- [x] only item", "- [ ] only item");
  const wrongHolder = gate3ctx(currentClaim, fullTickPlan({}), {}, { id: "ses-other" });
  assert.equal(wrongHolder.decision, "deny");
  assert.match(wrongHolder.reason, /the claim is held by another session/);

  const expired = gate3ctx(
    currentClaim.replace("2099-01-01", "2026-01-01"),
    fullTickPlan({}),
    { now: "2026-08-25T00:00:00Z" },
    { id: "ses_exec_1" },
  );
  assert.equal(expired.decision, "deny");
  assert.match(expired.reason, /claim expired/);

  const residual = gate3ctx(currentClaim, fullTickPlan({ fmExtra: 'claim: attempt-2026-08-25-205251-mission-driver-ses_exec_1-1a2b3c4d\nclaim-expires: "2099-01-01T00:00:00Z"\n' }), {}, { id: "ses_exec_1" });
  assert.equal(residual.decision, "deny");
  assert.match(residual.reason, /must clear the claim fields in the same write/);

  const unverified = gate3ctx(currentClaim, fullTickPlan({}));
  assert.equal(unverified.decision, "allow");
  assert.match(unverified.observations[0].reason, /writer session not verifiable on this face/);
});

test("gate3-maintenance: pass-line and dispatch writes inside awaitingClosure allow (already full-tick, no receipt)", () => {
  const current = fullTickPlan({});
  const withPass = fullTickPlan({ verificationBody: `\n- pass test run-1 basisHash=${computeBasisHash(fullTickPlan({}))} exit=0\n` });
  const out = gate3ctx(current, withPass);
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /awaitingClosure maintenance write/);
});

test("gate3-structural: no prior state → full-tick without receipts is awaitingClosure, a legal middle state (not denied)", () => {
  const out = gate3ctx(null, fullTickPlan({}));
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /awaitingClosure \(legal derived middle state, 01 §5\.2\)/);
});

test("gate3-③: appending an unchecked Closure Findings item leaves full-tick naturally — allow, no state bit", () => {
  const current = fullTickPlan({});
  const rework = current.replace("## Closure\n", "## Closure Findings\n\n- [ ] rework item from audit rejection\n\n## Closure\n");
  assert.notEqual(rework, current);
  const out = gate3ctx(current, rework);
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /not full-tick — completion-derivation gate inert/);
});

test("gate3-freeze: derived-completed plan rejects basis-domain writes but keeps append-only additions legal", () => {
  const done = completedPlan();
  const retick = done.replace("- [x] only item", "- [ ] only item");
  const denied = gate3ctx(done, retick);
  assert.equal(denied.decision, "deny");
  assert.match(denied.reason, /terminal freeze .*restart the work as a new plan/);
  const appended = done.replace("## Closure\n", "## Closure\n- dispatch review #review-2026-08-25-205251-mission-driver-demo-plan-1-84a1c2e6 to ses_reviewer_2\n");
  const allowed = gate3ctx(done, appended);
  assert.equal(allowed.decision, "allow");
  assert.match(allowed.observations[0].reason, /terminal freeze active — basis domain unchanged/);
  // also prevents reusing the old accepted receipt against new unchecked items
  const reuse = denied;
  assert.match(reuse.reason, /blocks reusing an old accepted receipt/);
});

test("gate3-freeze: cancelled (writable terminal) plan rejects any basis change (resurrection covered by freeze too)", () => {
  const cancelled = completedPlan().replace("status: active", "status: cancelled");
  const revived = cancelled.replace("status: cancelled", "status: active");
  const out = gate3ctx(cancelled, revived);
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /terminal freeze/);
});

/* ── 10. corpus semantics pinned by file class (real repo files) ──────────── */

// 0635-3 landed its closure receipts (run 2026-08-26-072439) — corpus pins
// track the live derived state, so it moved to the completed class below.
// 0815-1 (commit 8d3c92b), 0815-2 (a6fac25, first production writer of the
// models= lineage suffix) and 0815-3 followed: no pinned corpus
// member remains awaitingClosure — that derived state is transient by design
// (any run's BUILD_VERIFY/CLOSURE_AUDIT step can legally close it mid-flight),
// so its semantics stay pinned by the constructed gate3 fixtures above, never
// by a live plan file.
test("corpus: closed plans (0635-3, 0815-1, 0815-2, 0815-3, receipts bound) derive completed and allow same-content writes", () => {
  for (const name of [
    "2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md",
    "2026-08-25-0815-1-m2-law-seam-policy-schema.md",
    "2026-08-25-0815-2-m2-three-hard-gates.md",
    "2026-08-25-0815-3-m2-supporting-gates.md",
  ]) {
    const file = join(REPO_ROOT, "docs", "plans", "age-autonomy", name);
    const text = readFileSync(file, "utf8");
    assert.equal(deriveCompleted(text).completed, true, name);
    const out = evaluateGates(
      { type: "write", path: file, proposedContent: text },
      {
        policy: {
          gates: [
            { id: "closure-audit-binding", match: "{{plansDir}}/**/*.md", rule: "closure-audit-binding", mode: "enforce" },
            { id: "writer-identity", match: "{{plansDir}}/**/*.md", rule: "writer-identity", mode: "enforce" },
            { id: "plan-completed", match: "{{plansDir}}/**/*.md", rule: "plan-completed", mode: "enforce" },
          ],
        },
        ctx: { plansDir: join(REPO_ROOT, "docs", "plans", "age-autonomy") },
      },
    );
    assert.equal(out.decision, "allow", `${name}: ${out.reason}`);
    const pc = out.observations.find((o) => o.rule === "plan-completed");
    assert.match(pc.reason, /completion formula satisfied/, name);
  }
});

test("corpus: legacy-format plans (0635-1/2) are outside every hard gate's domain — dual-read skip, no false kill", () => {
  for (const name of [
    "2026-08-25-0635-1-m1-frontmatter-ledger-core.md",
    "2026-08-25-0635-2-m1-ledger-sections-derivation.md",
  ]) {
    const file = join(REPO_ROOT, "docs", "plans", "age-autonomy", name);
    const text = readFileSync(file, "utf8");
    const out = evaluateGates(
      { type: "write", path: file, proposedContent: text },
      {
        policy: {
          gates: [
            { id: "closure-audit-binding", match: "{{plansDir}}/**/*.md", rule: "closure-audit-binding", mode: "enforce" },
            { id: "writer-identity", match: "{{plansDir}}/**/*.md", rule: "writer-identity", mode: "enforce" },
            { id: "plan-completed", match: "{{plansDir}}/**/*.md", rule: "plan-completed", mode: "enforce" },
          ],
        },
        ctx: { plansDir: join(REPO_ROOT, "docs", "plans", "age-autonomy") },
      },
    );
    assert.equal(out.decision, "allow", name);
    for (const o of out.observations) {
      assert.match(o.reason, /outside domain \(dual-read transition\)/, `${name}: ${o.rule} → ${o.reason}`);
    }
  }
});

test("corpus: the repo's REAL enforce policy denies a full-tick unauthorized write (no receipt, no claim) end-to-end", () => {
  const real = parsePolicy(readFileSync(REAL_POLICY_FILE, "utf8"));
  assert.equal(real.ok, true);
  const plansDir = join(REPO_ROOT, "docs", "plans", "age-autonomy");
  const current = fullTickPlan({}).replace("- [x] only item", "- [ ] only item");
  const out = evaluateGates(
    { type: "write", path: join(plansDir, "x.md"), proposedContent: fullTickPlan({}), actor: { id: "ses-anyone" } },
    { policy: real.policy, currentFileState: { text: current }, ctx: { plansDir } },
  );
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /gate plan-completed \(plan-completed\) denied: .*without an audit receipt and without a valid claim in the prior state/);
  const enforcedObs = out.observations.find((o) => o.rule === "plan-completed");
  assert.equal(enforcedObs.mode, "enforce");
});

/* ── 11. supporting gates: nothing-claim-guard + audit-rounds-overflow ────── */
/* (M2-WI17 meter faces, plan 2026-08-25-0815-3 Phase 1)                      */

const NOTHING_POLICY = {
  gates: [{ id: "nothing-claim", match: "action:terminal-claim", rule: "nothing-claim-guard", mode: "enforce" }],
};

function terminalClaim(content, { plans, actor } = {}) {
  return evaluateGates(
    {
      type: "terminal-claim",
      path: "_tmp/run-1/terminal-claim.json",
      proposedContent: typeof content === "string" ? content : JSON.stringify(content),
      ...(actor ? { actor } : {}),
    },
    { policy: NOTHING_POLICY, ctx: { ...(plans !== undefined ? { plans } : {}) } },
  );
}

// A REAL plansDir fixture (files on disk, read into records — not mocks):
// draft, active-with-unfinished-work, and derived-completed plans.
function fixturePlans(root) {
  const dir = join(root, "docs", "plans", "demo");
  mkdirSync(dir, { recursive: true });
  const draftFile = join(dir, "draft-one.md");
  writeFileSync(draftFile, LEGAL_PLAN.replace("status: active", "status: draft"), "utf8");
  const activeFile = join(dir, "active-one.md");
  writeFileSync(activeFile, LEGAL_PLAN.replace("- [x] only item", "- [ ] only item"), "utf8");
  const doneFile = join(dir, "done-one.md");
  const doneBase = fullTickPlan({});
  writeFileSync(
    doneFile,
    fullTickPlan({
      closureBody: `- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${AUDIT_ID}：审计通过\n`,
      verificationBody: `\n- pass test run-1 basisHash=${computeBasisHash(doneBase)} exit=0\n`,
    }),
    "utf8",
  );
  return [draftFile, activeFile, doneFile].map((p) => ({ text: readFileSync(p, "utf8"), path: p }));
}

test("gate-nothing: real plansDir fixture — predicate injection face verified on disk records", () => {
  const root = tmpProject();
  try {
    const records = fixturePlans(root);
    assert.deepEqual(draftPlans(records).map((p) => basename(p)), ["draft-one.md"]);
    assert.deepEqual(activePlans(records).map((p) => basename(p)), ["active-one.md"]);
    // derived-completed plans exit activePlans() — the nothing claim only
    // weighs visible unfinished work.
    const doneOnly = records.filter((r) => basename(r.path) === "done-one.md");
    assert.equal(deriveCompleted(doneOnly[0].text).completed, true);
    assert.deepEqual(activePlans(doneOnly), []);
    assert.deepEqual(draftPlans(doneOnly), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gate-nothing: nothing-to-draft with draft/active work remaining denies pointing at the plans", () => {
  const root = tmpProject();
  try {
    const records = fixturePlans(root);
    const out = terminalClaim({ kind: "nothing-to-draft" }, { plans: records });
    assert.equal(out.decision, "deny");
    assert.match(out.reason, /nothing-claim-guard: nothing-to-draft claim denied — visible unfinished work remains/);
    assert.match(out.reason, /draftPlans=1 \(draft-one\.md\)/);
    assert.match(out.reason, /activePlans=1 \(active-one\.md\)/);
    // only-draft vs only-active columns of the truth table
    const onlyDraft = terminalClaim({ kind: "nothing-to-draft" }, { plans: records.filter((r) => !basename(r.path).startsWith("active")) });
    assert.equal(onlyDraft.decision, "deny");
    assert.match(onlyDraft.reason, /draftPlans=1/);
    const onlyActive = terminalClaim({ kind: "nothing-to-draft" }, { plans: records.filter((r) => !basename(r.path).startsWith("draft")) });
    assert.equal(onlyActive.decision, "deny");
    assert.match(onlyActive.reason, /activePlans=1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gate-nothing: draftPlans()==0 ∧ activePlans()==0 allows and emits the Deep Audit trigger signal shape", () => {
  const root = tmpProject();
  try {
    const records = fixturePlans(root).filter((r) => basename(r.path) === "done-one.md");
    const out = terminalClaim({ kind: "nothing-to-draft", reason: "roadmap 无未勾且无 open plans" }, { plans: records });
    assert.equal(out.decision, "allow");
    assert.match(out.observations[0].reason, /nothing-to-draft claim verified \(draftPlans\(\)==0 ∧ activePlans\(\)==0\)/);
    // trigger signal data shape (consumed by the M3/WI26 supervisor; pinned
    // here at the rule level — evaluateGates surfaces verdict/reason only)
    const rule = getRule("nothing-claim-guard");
    const verdict = rule.fn(
      { type: "terminal-claim", path: "_tmp/run-1/terminal-claim.json", proposedContent: JSON.stringify({ kind: "nothing-to-draft" }) },
      null,
      { plans: records },
    );
    assert.deepEqual(verdict.trigger, {
      dispatch: "deep-audit",
      when: "terminal-claim=nothing-to-draft ∧ draftPlans()==0 ∧ activePlans()==0",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gate-nothing: kind lexeme / non-JSON / missing records columns", () => {
  const root = tmpProject();
  try {
    const records = fixturePlans(root);
    // kind lexeme: only the exact nothing-to-draft lexeme enters the deny face
    const typo = terminalClaim({ kind: "nothing-to-drafter" }, { plans: records });
    assert.equal(typo.decision, "allow");
    assert.match(typo.observations[0].reason, /kind="nothing-to-drafter" is not "nothing-to-draft" — outside this gate's deny face/);
    const otherKind = terminalClaim({ kind: "blocked" }, { plans: records });
    assert.equal(otherKind.decision, "allow");
    // non-JSON action record = decidable malformed fact → deny
    const badJson = terminalClaim("nothing to draft, trust me", { plans: [] });
    assert.equal(badJson.decision, "deny");
    assert.match(badJson.reason, /not parseable JSON/);
    // records not injected (structural subset / non-supervisor face): the
    // predicates are unobservable — allow + note, never a silent deny
    const noRecords = terminalClaim({ kind: "nothing-to-draft" });
    assert.equal(noRecords.decision, "allow");
    assert.match(noRecords.observations[0].reason, /plan records not injected on this face/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function roadmapBudget({ rounds = 0, dar = "", extraFm = "" } = {}) {
  return `---
audit-rounds: ${rounds}
${extraFm}---
# Roadmap

### M1 — First

- [x] WI1 thing

## Deep Audit Record

${dar}`;
}

const NEW_DISPATCH = `- dispatch audit #audit-2026-08-25-205251-mission-driver-roadmap-3-9c31d0e2 to ses_auditor_9\n`;
const OLD_DISPATCH = `- dispatch audit ${AUDIT_ID} to ses_auditor_1\n`;

function meter(proposed, { current, maxAuditRounds } = {}) {
  return evaluateGates(
    { type: "write", path: "/r/roadmap.md", proposedContent: proposed },
    {
      policy: { gates: [{ id: "meter-guard", match: "{{roadmapPath}}", rule: "audit-rounds-overflow", mode: "enforce" }] },
      currentFileState: current !== undefined ? { text: current } : undefined,
      ctx: { roadmapPath: "/r/roadmap.md", ...(maxAuditRounds !== undefined ? { maxAuditRounds } : {}) },
    },
  );
}

test("gate-meter: audit-rounds < max with a NEW dispatch line allows (budget available)", () => {
  const current = roadmapBudget({ rounds: 2, dar: OLD_DISPATCH });
  const proposed = roadmapBudget({ rounds: 2, dar: `${OLD_DISPATCH}${NEW_DISPATCH}` });
  const out = meter(proposed, { current, maxAuditRounds: 3 });
  assert.equal(out.decision, "allow");
  assert.match(out.observations[0].reason, /budget available \(audit-rounds=2 < maxAuditRounds=3\) for 1 new dispatch audit line\(s\)/);
});

test("gate-meter: audit-rounds = max denies the new round; unconfigured (both sources = 0) denies too", () => {
  const atMax = meter(roadmapBudget({ rounds: 3, dar: OLD_DISPATCH + NEW_DISPATCH }), {
    current: roadmapBudget({ rounds: 3, dar: OLD_DISPATCH }),
    maxAuditRounds: 3,
  });
  assert.equal(atMax.decision, "deny");
  assert.match(atMax.reason, /budget exhausted \(audit-rounds=3 ≥ maxAuditRounds=3\) — deny new dispatch/);
  assert.match(atMax.reason, /raise the budget \(policy limits\.maxAuditRounds, mission flow fallback\) or close the mission via R1/);
  // unconfigured on both sources (=0 semantics): no audit concept → every
  // new dispatch line is out of budget (0 ≥ 0), mirroring the engine
  // posture that never enters audit rounds with max=0.
  const unconfigured = meter(roadmapBudget({ rounds: 0, dar: NEW_DISPATCH }), {
    current: roadmapBudget({ rounds: 0, dar: "" }),
  });
  assert.equal(unconfigured.decision, "deny");
  assert.match(unconfigured.reason, /audit-rounds=0 ≥ maxAuditRounds=0/);
});

test("gate-meter M3-WI29: same-occurrence crash redispatch of an unpaired in-flight round consumes NO budget — allowed even when exhausted (01 §3.1)", () => {
  const deadInFlight = `- dispatch audit #audit-2026-08-26-130203-mission-driver-roadmap-3-aaaaaaaa to ses_dead_auditor\n`;
  const redispatchLine = `- dispatch audit #audit-2026-08-26-130203-mission-driver-roadmap-3-bbbbbbbb to ses_new_auditor\n`;
  // budget exhausted (rounds=3 ≥ max=3) by the crashed attempt that already
  // paid round 3: denying the redispatch would deadlock the occurrence
  // forever (the dead session never writes its conclusion).
  const exhausted = meter(roadmapBudget({ rounds: 3, dar: deadInFlight + redispatchLine }), {
    current: roadmapBudget({ rounds: 3, dar: deadInFlight }),
    maxAuditRounds: 3,
  });
  assert.equal(exhausted.decision, "allow");
  assert.match(exhausted.observations[0].reason, /same-occurrence crash redispatch\(s\) of unpaired in-flight round\(s\)/);
  assert.match(exhausted.observations[0].reason, /the round was already paid, no budget consumed, no increment required/);
  // budget available with a MIXED write (fresh round + same-round
  // redispatch): the fresh round consumes budget, the redispatch rides inert
  const inFlight2 = `- dispatch audit #audit-2026-08-26-130203-mission-driver-roadmap-2-cccccccc to ses_dead_auditor\n`;
  const redispatch2 = `- dispatch audit #audit-2026-08-26-130203-mission-driver-roadmap-2-dddddddd to ses_new_auditor\n`;
  const fresh2 = `- dispatch audit #audit-2026-08-26-130203-mission-driver-roadmap-3-eeeeeeee to ses_auditor_2\n`;
  const available = meter(roadmapBudget({ rounds: 2, dar: inFlight2 + redispatch2 + fresh2 }), {
    current: roadmapBudget({ rounds: 2, dar: inFlight2 }),
    maxAuditRounds: 3,
  });
  assert.equal(available.decision, "allow");
  assert.match(available.observations[0].reason, /budget available \(audit-rounds=2 < maxAuditRounds=3\) for 1 new dispatch audit line\(s\)/);
  assert.match(available.observations[0].reason, /\+1 same-occurrence redispatch\(s\), budget-inert — M3-WI29/);
});

test("gate-meter: existing dispatch lines only / no prior state / no DAR / legacy stay inert", () => {
  // existing lines untouched (accepted line landing on an old dispatch)
  const landing = meter(roadmapBudget({ rounds: 2, dar: `${OLD_DISPATCH}- accepted ${AUDIT_ID} findings=none：结论\n` }), {
    current: roadmapBudget({ rounds: 2, dar: OLD_DISPATCH }),
    maxAuditRounds: 2,
  });
  assert.equal(landing.decision, "allow");
  assert.match(landing.observations[0].reason, /no new dispatch audit lines — budget face inert/);
  // no currentFileState: new-ness unobservable → allow + note (02 §2)
  const noCurrent = meter(roadmapBudget({ rounds: 5, dar: NEW_DISPATCH }), { maxAuditRounds: 1 });
  assert.equal(noCurrent.decision, "allow");
  assert.match(noCurrent.observations[0].reason, /no currentFileState — new dispatch audit lines not observable/);
  // no DAR section at all → outside domain
  const noDar = meter(roadmapBudget({ rounds: 9 }).replace("\n## Deep Audit Record\n\n", ""), {
    current: roadmapBudget({ rounds: 9 }),
    maxAuditRounds: 1,
  });
  assert.equal(noDar.decision, "allow");
  assert.match(noDar.observations[0].reason, /no ## Deep Audit Record section — outside domain/);
  // legacy (no frontmatter) roadmap → dual-read skip
  const legacy = meter("# Roadmap\n\n## Deep Audit Record\n\n" + NEW_DISPATCH, { current: "# Roadmap\n", maxAuditRounds: 0 });
  assert.equal(legacy.decision, "allow");
  assert.match(legacy.observations[0].reason, /outside domain \(dual-read transition\)/);
});

test("gate-meter: limits precedence — policy authoritative, mission config fallback, else 0 (0815-1 ruling, consumer switch here)", () => {
  assert.equal(resolveMaxAuditRounds({ limits: { maxAuditRounds: 3 } }, { flow: { maxAuditRounds: 5 } }), 3);
  assert.equal(resolveMaxAuditRounds({}, { flow: { maxAuditRounds: 5 } }), 5);
  assert.equal(resolveMaxAuditRounds({ limits: {} }, { flow: { maxAuditRounds: 5 } }), 5);
  assert.equal(resolveMaxAuditRounds({ limits: { maxAuditRounds: 3 } }, {}), 3);
  assert.equal(resolveMaxAuditRounds({}, {}), 0);
  assert.equal(resolveMaxAuditRounds(null, null), 0);
  // invalid shapes never win: fall through to the fallback / 0
  assert.equal(resolveMaxAuditRounds({ limits: { maxAuditRounds: -1 } }, { flow: { maxAuditRounds: 5 } }), 5);
  assert.equal(resolveMaxAuditRounds({ limits: { maxAuditRounds: "3" } }, {}), 0);
});

/* ── 12. supporting gate: claim-validity (M2-WI18, 02 §4.5) ───────────────── */

const CLAIM_TOKEN = "attempt-2026-08-25-205251-mission-driver-ses_exec_1-1a2b3c4d";
const OTHER_CLAIM_TOKEN = "attempt-2026-08-25-205251-mission-driver-ses_exec_2-9f8e7d6c";
const CLAIM_FM = `claim: ${CLAIM_TOKEN}\nclaim-expires: "2099-01-01T00:00:00Z"\n`;

function claimGate(proposed, { current, actor, now, type = "write" } = {}) {
  return evaluateGates(
    { type, path: "/p/x.md", proposedContent: proposed, ...(actor ? { actor } : {}) },
    {
      policy: { gates: [{ id: "claim-taken", match: "{{plansDir}}/**/*.md", rule: "claim-validity", mode: "enforce" }] },
      currentFileState: current !== undefined ? { text: current } : undefined,
      ctx: { plansDir: "/p", ...(now !== undefined ? { now } : {}) },
    },
  );
}

test("gate-claim①: claim writes — dispatcher roles allow, executing roles deny, id-only notes (transition posture)", () => {
  const current = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: false });
  const proposed = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: false, fmExtra: CLAIM_FM });
  for (const role of ["executor", "drafter", "reviewer", "auditor"]) {
    const out = claimGate(proposed, { current, actor: { id: `ses_${role}_1`, role } });
    assert.equal(out.decision, "deny", role);
    assert.match(out.reason, /claim fields are written by the dispatcher \(engine \| supervisor\), never by the executing agent/);
    assert.match(out.reason, new RegExp(`actor role ${role} cannot write claim/claim-expires`));
  }
  assert.equal(claimGate(proposed, { current, actor: { id: "ses-flow-1", role: "engine" } }).decision, "allow");
  assert.equal(claimGate(proposed, { current, actor: { id: "ses-sup-1", role: "supervisor" } }).decision, "allow");
  // transition-period posture (0815-1 Explore: role not inferable on the DSH
  // face) — id-only/absent actors note, never deny; M3 swaps the writer.
  const idOnly = claimGate(proposed, { current, actor: { id: "ses-flow-1" } });
  assert.equal(idOnly.decision, "allow");
  assert.match(idOnly.observations[0].reason, /claim writer role not verifiable on this face \(id-only\/absent actor/);
  const noActor = claimGate(proposed, { current });
  assert.equal(noActor.decision, "allow");
  assert.match(noActor.observations[0].reason, /claim writer role not verifiable/);
});

test("gate-claim①: written claims must carry a future ISO-8601 TTL", () => {
  const current = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: false });
  const unparseable = claimGate(
    transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: false, fmExtra: `claim: ${CLAIM_TOKEN}\nclaim-expires: "next tuesday"\n` }),
    { current, actor: { id: "ses-sup-1", role: "supervisor" } },
  );
  assert.equal(unparseable.decision, "deny");
  assert.match(unparseable.reason, /claim write must carry a valid ISO-8601 claim-expires/);
  const alreadyExpired = claimGate(
    transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: false, fmExtra: `claim: ${CLAIM_TOKEN}\nclaim-expires: "2026-01-01T00:00:00Z"\n` }),
    { current, actor: { id: "ses-sup-1", role: "supervisor" }, now: "2026-08-25T00:00:00Z" },
  );
  assert.equal(alreadyExpired.decision, "deny");
  assert.match(alreadyExpired.reason, /already-expired claim-expires .* the TTL must be in the future at write time/);
});

// Two-item plan pair for ② tick tests: ticking one item must NOT be the
// full-tick transition (that transition's claim handling belongs to ④ and
// plan-completed ②) — mid-plan execution ticks keep a second unchecked item.
function twoItemTickPair(fm) {
  const unticked = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: false, fmExtra: fm }).replace(
    "- [ ] only item",
    "- [ ] only item\n- [ ] second item",
  );
  const tickedFirst = unticked.replace("- [ ] only item", "- [x] only item");
  return { unticked, tickedFirst };
}

test("gate-claim②: ticks under a live claim — holder allows, mismatch denies, no-actor degrades to exists ∧ unexpired", () => {
  const { unticked, tickedFirst } = twoItemTickPair(CLAIM_FM);
  const holder = claimGate(tickedFirst, { current: unticked, actor: { id: "ses_exec_1" } });
  assert.equal(holder.decision, "allow");
  assert.match(holder.observations[0].reason, /claim fields legal on this write/);
  const mismatch = claimGate(tickedFirst, { current: unticked, actor: { id: "ses-other" } });
  assert.equal(mismatch.decision, "deny");
  assert.match(mismatch.reason, /checkbox ticks under a claim are reserved for its holder — actor ses-other does not match the holderSessionId encoded in/);
  const structural = claimGate(tickedFirst, { current: unticked });
  assert.equal(structural.decision, "allow");
  assert.match(structural.observations[0].reason, /holder face degraded to claim-exists ∧ unexpired \(unverified-writer posture\)/);
});

test("gate-claim②: expiry boundary pinned with the injectable clock (<, =, >)", () => {
  const { unticked, tickedFirst } = twoItemTickPair(`claim: ${CLAIM_TOKEN}\nclaim-expires: "2026-08-25T12:00:00Z"\n`);
  const before = claimGate(tickedFirst, { current: unticked, actor: { id: "ses_exec_1" }, now: "2026-08-25T11:00:00Z" });
  assert.equal(before.decision, "allow");
  const atBoundary = claimGate(tickedFirst, { current: unticked, actor: { id: "ses_exec_1" }, now: "2026-08-25T12:00:00Z" });
  assert.equal(atBoundary.decision, "deny");
  assert.match(atBoundary.reason, /tick under an expired claim/);
  const after = claimGate(tickedFirst, { current: unticked, actor: { id: "ses_exec_1" }, now: "2026-08-25T13:00:00Z" });
  assert.equal(after.decision, "deny");
  assert.match(after.reason, /tick under an expired claim/);
});

test("gate-claim③: claim action on a live different claim denies (transition face; parse face = duplicate-key rejection)", () => {
  const current = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: false, fmExtra: CLAIM_FM });
  const take = (token, opts = {}) =>
    claimGate(typeof token === "string" ? token : JSON.stringify(token), { ...opts, type: "claim" });
  // double-active transition face: one write would leave two live claims.
  // (The parse face — two `claim:` keys in ONE frontmatter — is rejected by
  // the M1 parser's duplicate-key denial; that boundary is ledger-frontmatter
  // territory, not re-tested here.)
  const second = take({ claim: OTHER_CLAIM_TOKEN }, { current, actor: { id: "ses_exec_2", role: "executor" } });
  assert.equal(second.decision, "deny");
  assert.match(second.reason, /single active claim per plan .*already holds the unexpired claim/);
  const idempotent = take({ claim: CLAIM_TOKEN }, { current, actor: { id: "ses_exec_1" } });
  assert.equal(idempotent.decision, "allow");
  assert.match(idempotent.observations[0].reason, /the same \(idempotent\)/);
  const unclaimed = take({ claim: CLAIM_TOKEN }, { current: transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: false }) });
  assert.equal(unclaimed.decision, "allow");
  assert.match(unclaimed.observations[0].reason, /no live.*claim/);
  const malformed = take("", { current });
  assert.equal(malformed.decision, "deny");
  assert.match(malformed.reason, /malformed claim action/);
  const noCurrent = take({ claim: CLAIM_TOKEN });
  assert.equal(noCurrent.decision, "allow");
  assert.match(noCurrent.observations[0].reason, /existing claim not observable on this face/);
});

test("gate-claim④⑤: full-tick residual claim and out-of-active carrying each deny with the legal path", () => {
  // ④ entering awaitingClosure must clear the claim in the same write
  const residual = claimGate(fullTickPlan({ fmExtra: CLAIM_FM }), {
    current: fullTickPlan({ fmExtra: CLAIM_FM }).replace("- [x] only item", "- [ ] only item"),
    actor: { id: "ses_exec_1" },
  });
  assert.equal(residual.decision, "deny");
  assert.match(residual.reason, /full-tick without an audit receipt \(entering awaitingClosure\) and still carries a claim — the write must clear the claim fields/);
  // ⑤ leaving active while keeping the claim
  const toHeld = claimGate(
    transitionPlan({ status: "held", drr: PAIRED_DRR, ticked: true, fmExtra: `hold: "x"\n${CLAIM_FM}` }),
    { current: transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: true, fmExtra: CLAIM_FM }) },
  );
  assert.equal(toHeld.decision, "deny");
  assert.match(toHeld.reason, /claims exist only while status is "active" .* clear the claim in the same write that leaves active/);
  // claim introduction on a draft plan also hits ⑤ (claims are execution-time)
  const onDraft = claimGate(transitionPlan({ status: "draft", drr: "", fmExtra: CLAIM_FM }), {
    current: transitionPlan({ status: "draft", drr: "" }),
    actor: { id: "ses-sup-1", role: "supervisor" },
  });
  assert.equal(onDraft.decision, "deny");
  assert.match(onDraft.reason, /claims exist only while status is "active"/);
});

test("gate-claim: clearing — the holder or the dispatcher may clear; a third session denies; inert faces stay inert", () => {
  const current = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: true, fmExtra: CLAIM_FM });
  const clearedNow = transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: true });
  const byHolder = claimGate(clearedNow, { current, actor: { id: "ses_exec_1" } });
  assert.equal(byHolder.decision, "allow");
  const bySupervisor = claimGate(clearedNow, { current, actor: { id: "ses-sup-1", role: "supervisor" } });
  assert.equal(bySupervisor.decision, "allow");
  const byThird = claimGate(clearedNow, { current, actor: { id: "ses-third" } });
  assert.equal(byThird.decision, "deny");
  assert.match(byThird.reason, /only the claim holder or the dispatcher \(engine \| supervisor\) may clear a claim — actor ses-third is neither/);
  const idOnlyHolder = claimGate(clearedNow, { current, actor: { id: "ses_exec_1" } });
  assert.equal(idOnlyHolder.decision, "allow");
  const idOnlyThird = claimGate(clearedNow, { current, actor: { id: "ses-flow-1" } });
  assert.equal(idOnlyThird.decision, "deny");
  assert.match(idOnlyThird.reason, /only the claim holder or the dispatcher/);
  const noActorClear = claimGate(clearedNow, { current });
  assert.equal(noActorClear.decision, "allow");
  assert.match(noActorClear.observations[0].reason, /claim clear writer not verifiable on this face/);
  // no claim fields in play anywhere → inert
  const inert = claimGate(transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: true }), {
    current: transitionPlan({ status: "active", drr: PAIRED_DRR, ticked: false }),
    actor: { id: "ses_exec_1" },
  });
  assert.equal(inert.decision, "allow");
  assert.match(inert.observations[0].reason, /no claim fields in play — inert/);
  // legacy-format plan stays out of domain
  const legacy = claimGate("# Plan\n\n> Plan Status: active\n", { current: "# Plan\n\n> Plan Status: active\n" });
  assert.equal(legacy.decision, "allow");
  assert.match(legacy.observations[0].reason, /outside domain \(dual-read transition\)/);
});

/* ── 13. supporting gate: verify-keys (M2-WI19, 02 §5 command source) ─────── */

const MISSION_COMMANDS = {
  test: "pnpm --prefix tools/mission-driver test",
  build: "pnpm --prefix tools/mission-driver/web run build",
  lint: "pnpm --prefix tools/mission-driver run lint:prompts",
  "typecheck": "pnpm --prefix tools/mission-driver/web run typecheck",
  broken: "", // present but EMPTY — enum face must reject, not just membership
};

function verifyKeysGate(content, ctx = {}) {
  return evaluateGates(
    { type: "write", path: "/p/x.md", proposedContent: content },
    {
      policy: { gates: [{ id: "verify-keys", match: "{{plansDir}}/**/*.md", rule: "verify-keys", mode: "enforce" }] },
      ctx: { plansDir: "/p", ...ctx },
    },
  );
}

test("gate-verify-keys: declared keys enumerating non-empty commands allow; unknown/empty mappings deny", () => {
  const ok = verifyKeysGate(LEGAL_PLAN.replace("verify: [test]", "verify: [test, build]"), { commands: MISSION_COMMANDS });
  assert.equal(ok.decision, "allow");
  assert.match(ok.observations[0].reason, /all verify keys enumerate non-empty mission commands \(test, build\)/);
  const unknown = verifyKeysGate(LEGAL_PLAN.replace("verify: [test]", "verify: [test, deploy]"), { commands: MISSION_COMMANDS });
  assert.equal(unknown.decision, "deny");
  assert.match(unknown.reason, /"deploy" is not a mission commands\.\* key/);
  assert.match(unknown.reason, /\(known here: test, build, lint, typecheck\)/);
  assert.match(unknown.reason, /plan Proof text is never a command source/);
  const empty = verifyKeysGate(LEGAL_PLAN.replace("verify: [test]", "verify: [broken]"), { commands: MISSION_COMMANDS });
  assert.equal(empty.decision, "deny");
  assert.match(empty.reason, /"broken" maps to an empty command/);
});

test("gate-verify-keys: missing ctx.commands fails open; absent verify field defers to the derivation face; legacy skips", () => {
  const noCommands = verifyKeysGate(LEGAL_PLAN);
  assert.equal(noCommands.decision, "allow");
  assert.match(noCommands.observations[0].reason, /mission commands not injected on this face .* fail-open/);
  const noVerify = verifyKeysGate(LEGAL_PLAN.replace("verify: [test]\n", ""), { commands: MISSION_COMMANDS });
  assert.equal(noVerify.decision, "allow");
  assert.match(noVerify.observations[0].reason, /no verify field — default-key resolution is the derivation face's concern/);
  const legacy = verifyKeysGate("# Plan\n\n> Plan Status: active\n", { commands: MISSION_COMMANDS });
  assert.equal(legacy.decision, "allow");
  assert.match(legacy.observations[0].reason, /outside domain \(dual-read transition\)/);
});

/* ── 14. supporting gate: record-append-only (M2-WI20, 02 §4.8) ───────────── */

function appendOnlyGate(proposed, { current } = {}) {
  return evaluateGates(
    { type: "write", path: "/p/x.md", proposedContent: proposed },
    {
      policy: { gates: [{ id: "append-only-records", match: "{{plansDir}}/**/*.md", rule: "record-append-only", mode: "enforce" }] },
      currentFileState: current !== undefined ? { text: current } : undefined,
      ctx: { plansDir: "/p" },
    },
  );
}

function planWithVerification(body) {
  return `---
status: active
mission: demo
work-item: M1-WI1
verify: [test]
---
# Plan

## Phase 1 — Work

- [ ] only item

## Draft Review Record

- dispatch review ${REVIEW_ID} to ses_reviewer_2

## Verification
${body}
## Closure
`;
}

const PASS_BODY = `\n- pass test run-1 basisHash=${"a".repeat(64)} exit=0\n`;

test("gate-append-only: tail appends allow; delete / rewrite / reorder / section removal / prose deletion deny naming the first violating line", () => {
  const current = planWithVerification(PASS_BODY);
  const appended = planWithVerification(`${PASS_BODY}- pass build run-1 basisHash=${"b".repeat(64)} exit=0\n`);
  const ok = appendOnlyGate(appended, { current });
  assert.equal(ok.decision, "allow");
  assert.match(ok.observations[0].reason, /all append-only sections .* prefix-preserved/);

  const deleted = planWithVerification(`\n- pass build run-1 basisHash=${"b".repeat(64)} exit=0\n`);
  const del = appendOnlyGate(deleted, { current });
  assert.equal(del.decision, "deny");
  assert.match(del.reason, /## Verification line \d+ was deleted or rewritten \("- pass test run-1/);

  const rewritten = planWithVerification(PASS_BODY.replace("exit=0", "exit=0 (reposted)"));
  const rw = appendOnlyGate(rewritten, { current });
  assert.equal(rw.decision, "deny");
  assert.match(rw.reason, /was deleted or rewritten/);

  const reordered = planWithVerification(`${PASS_BODY}- pass build run-1 basisHash=${"b".repeat(64)} exit=0\n`)
    .replace(`${PASS_BODY}- pass build`, `- pass build run-1 basisHash=${"b".repeat(64)} exit=0\n${PASS_BODY.trim()}\n`);
  const ro = appendOnlyGate(reordered, { current });
  assert.equal(ro.decision, "deny");

  const sectionGone = appended.replace("## Verification\n", "## Verification Log\n");
  const gone = appendOnlyGate(sectionGone, { current });
  assert.equal(gone.decision, "deny");
  assert.match(gone.reason, /## Verification section removed/);

  // prose lines are protected too (02 §4.8 as adjudicated in 0815-3: whole-
  // section prefix preservation, prose included — the M1 tolerance is about
  // grammar matching, not deletability)
  const proseCurrent = planWithVerification(`${PASS_BODY}- 执行期复核：证据见日志\n`);
  const proseDeleted = planWithVerification(PASS_BODY);
  const pd = appendOnlyGate(proseDeleted, { current: proseCurrent });
  assert.equal(pd.decision, "deny");
  assert.match(pd.reason, /was deleted or rewritten \("- 执行期复核：证据见日志"\)/);
});

test("gate-append-only: trailing blank-run trim tolerated; unchanged file inert; no currentFileState / legacy / roadmap DAR face", () => {
  const current = planWithVerification(PASS_BODY);
  const trimmed = current.replace(`${PASS_BODY}## Closure`, `${PASS_BODY.trim()}\n\n## Closure`);
  const ok = appendOnlyGate(trimmed, { current });
  assert.equal(ok.decision, "allow");
  const unchanged = appendOnlyGate(current, { current });
  assert.equal(unchanged.decision, "allow");
  const noCurrent = appendOnlyGate(current);
  assert.equal(noCurrent.decision, "allow");
  assert.match(noCurrent.observations[0].reason, /no currentFileState — existing lines not observable/);
  const legacy = appendOnlyGate("# Plan\n\n> Plan Status: active\n", { current: "# Plan\n\n> Plan Status: active\n" });
  assert.equal(legacy.decision, "allow");
  assert.match(legacy.observations[0].reason, /proposed state is not a frontmatter ledger; outside domain \(dual-read transition\)/);
  // roadmap DAR face: deleting an accepted conclusion line denies
  const roadmapGate = (proposed, cur) =>
    evaluateGates(
      { type: "write", path: "/r/roadmap.md", proposedContent: proposed },
      {
        policy: { gates: [{ id: "append-only-records-roadmap", match: "{{roadmapPath}}", rule: "record-append-only", mode: "enforce" }] },
        currentFileState: { text: cur },
        ctx: { roadmapPath: "/r/roadmap.md" },
      },
    );
  const darCur = roadmapWith(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${AUDIT_ID} findings=none：结论\n`);
  const darDeleted = roadmapWith(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n`);
  const dd = roadmapGate(darDeleted, darCur);
  assert.equal(dd.decision, "deny");
  assert.match(dd.reason, /## Deep Audit Record line \d+ was deleted or rewritten/);
  const darAppended = roadmapWith(`- dispatch audit ${AUDIT_ID} to ses_auditor_1\n- accepted ${AUDIT_ID} findings=none：结论\n- dispatch audit ${OTHER_AUDIT_ID} to ses_auditor_2\n`);
  assert.equal(roadmapGate(darAppended, darCur).decision, "allow");
});

/* ── 15. commands runner (M2-WI19 util, bundled copy) ─────────────────────── */

test("runner: resolveVerifyPlan — declared keys, mission defaults, and problem enumeration", () => {
  const declared = resolveVerifyPlan({ verify: ["test", "build"], commands: MISSION_COMMANDS });
  assert.deepEqual(declared, { ok: true, keys: ["test", "build"], problems: [], usedDefault: false });
  const defaults = resolveVerifyPlan({ verify: undefined, commands: MISSION_COMMANDS });
  assert.deepEqual(defaults.keys, ["test", "build", "lint", "typecheck"]);
  assert.equal(defaults.usedDefault, true);
  assert.deepEqual(defaultVerifyKeys(MISSION_COMMANDS), ["test", "build", "lint", "typecheck"]);
  assert.deepEqual(defaultVerifyKeys({ test: "true" }), ["test"]);
  const bad = resolveVerifyPlan({ verify: ["test", "deploy"], commands: MISSION_COMMANDS });
  assert.equal(bad.ok, false);
  assert.match(bad.problems.join("; "), /"deploy" is not a mission commands\.\* key/);
  const malformed = resolveVerifyPlan({ verify: "test", commands: MISSION_COMMANDS });
  assert.equal(malformed.ok, false);
  assert.match(malformed.problems.join("; "), /verify field must be an array of command keys/);
});

test("runner: passLineFor grammar + basisHash binding over the plan text (01 §4.2)", () => {
  const basisHash = computeBasisHash(LEGAL_PLAN);
  const line = passLineFor({ key: "test", runId: "run-1", basisHash, exitCode: 0 });
  assert.equal(line, `- pass test run-1 basisHash=${basisHash} exit=0`);
  const nullExit = passLineFor({ key: "test", runId: "run-1", basisHash, exitCode: null });
  assert.match(nullExit, /exit=null$/);
  const scan = scanPlanLedger(LEGAL_PLAN.replace("## Verification\n", `## Verification\n\n${line}\n`));
  // the emitted line parses back through the M1 pass-line grammar
  const verification = scan.verification ?? { passes: [] };
  assert.equal(verification.passes.length, 1);
  assert.equal(verification.passes[0].key, "test");
  assert.equal(verification.passes[0].basisHash, basisHash);
});

test("runner: runVerifyCommands executes commands.* only — exit codes, timeout, and empty-mapping faces", async () => {
  const root = tmpProject();
  try {
    const planText = LEGAL_PLAN;
    const commands = {
      ok: 'node -e "process.exit(0)"',
      fail: 'node -e "process.exit(3)"',
      slow: 'node -e "setTimeout(() => process.exit(0), 5000)"',
      empty: "",
    };
    const { basisHash, results } = await runVerifyCommands({
      keys: ["ok", "fail", "slow", "empty"],
      commands,
      projectRoot: root,
      planText,
      runId: "run-e2e",
      timeoutMs: 150,
    });
    assert.equal(basisHash, computeBasisHash(planText));
    const byKey = Object.fromEntries(results.map((r) => [r.key, r]));
    assert.equal(byKey.ok.exitCode, 0);
    assert.match(byKey.ok.passLine, /^- pass ok run-e2e basisHash=[0-9a-f]{64} exit=0$/);
    assert.equal(byKey.fail.exitCode, 3);
    assert.match(byKey.fail.passLine, /exit=3$/);
    assert.equal(byKey.slow.timedOut, true);
    assert.equal(byKey.slow.exitCode, null);
    assert.match(byKey.slow.passLine, /exit=null$/);
    assert.match(byKey.slow.output, /chars clipped|$/);
    assert.equal(byKey.empty.exitCode, null);
    assert.match(byKey.empty.output, /no non-empty command mapped to "empty"/);
    assert.ok(results.every((r) => r.durationMs >= 0));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* ── 16. corpus by file class over the REAL extended policy (0815-3) ──────── */

test("corpus: new-format plans (0635-3, 0815-1, 0815-2, 0815-3) pass every registered gate of the real policy — no false kills", () => {
  const real = parsePolicy(readFileSync(REAL_POLICY_FILE, "utf8"));
  assert.equal(real.ok, true);
  const plansDir = join(REPO_ROOT, "docs", "plans", "age-autonomy");
  const corpus = [
    { name: "2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md", completed: true },
    { name: "2026-08-25-0815-1-m2-law-seam-policy-schema.md", completed: true },
    { name: "2026-08-25-0815-2-m2-three-hard-gates.md", completed: true },
    { name: "2026-08-25-0815-3-m2-supporting-gates.md", completed: true },
  ];
  for (const { name, completed } of corpus) {
    const file = join(plansDir, name);
    const text = readFileSync(file, "utf8");
    assert.equal(deriveCompleted(text).completed, completed, name);
    const out = evaluateGates(
      { type: "write", path: file, proposedContent: text },
      { policy: real.policy, ctx: { plansDir, roadmapPath: join(REPO_ROOT, "docs", "backlog", "age-autonomy-implementation-roadmap.md") } },
    );
    assert.equal(out.decision, "allow", `${name}: ${out.reason}`);
    // the four supporting gates all ran and none false-killed
    for (const rule of ["claim-validity", "verify-keys", "record-append-only"]) {
      const obs = out.observations.find((o) => o.rule === rule);
      assert.ok(obs, `${name}: ${rule} observation present`);
      assert.equal(obs.verdict, "allow", `${name}: ${rule} → ${obs.reason}`);
    }
    const pc = out.observations.find((o) => o.rule === "plan-completed");
    assert.match(pc.reason, completed ? /completion formula satisfied/ : /awaitingClosure/, name);
  }
});

test("corpus: legacy plans (0635-1/2) stay outside the old gates' domains; the WI22 freeze owns them (fail-open without roots, deny with the frozen corpus)", () => {
  const real = parsePolicy(readFileSync(REAL_POLICY_FILE, "utf8"));
  const plansDir = join(REPO_ROOT, "docs", "plans", "age-autonomy");
  for (const name of [
    "2026-08-25-0635-1-m1-frontmatter-ledger-core.md",
    "2026-08-25-0635-2-m1-ledger-sections-derivation.md",
  ]) {
    const file = join(plansDir, name);
    const text = readFileSync(file, "utf8");
    // Face 1 (no plansRoots injected): every OLD gate stays dual-read
    // out-of-domain and the freeze fail-opens — same-content write allows.
    const bare = evaluateGates(
      { type: "write", path: file, proposedContent: text },
      { policy: real.policy, ctx: { plansDir } },
    );
    assert.equal(bare.decision, "allow", `${name}: ${bare.reason}`);
    for (const o of bare.observations) {
      if (o.rule === "legacy-plan-freeze") {
        assert.match(o.reason, /plans roots not injected .* fail-open/, `${name}: ${o.reason}`);
      } else {
        assert.match(o.reason, /domain \(dual-read transition\)/, `${name}: ${o.rule} → ${o.reason}`);
      }
    }
    // Face 2 (full ctx + the real plan corpus): the freeze now owns the
    // legacy corpus — same-content rewrites of terminal legacy plans deny
    // (no active plan references them; the corpus is frozen, M2-WI22).
    const records = readdirSync(plansDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ text: readFileSync(join(plansDir, f), "utf8"), path: join(plansDir, f) }));
    const frozen = evaluateGates(
      { type: "write", path: file, proposedContent: text },
      {
        policy: real.policy,
        ctx: { plansDir, plansRoots: [join(REPO_ROOT, "docs", "plans"), plansDir], plans: records },
      },
    );
    assert.equal(frozen.decision, "deny", `${name}: expected the WI22 freeze to deny`);
    assert.match(frozen.reason, /gate legacy-plan-freeze \(legacy-plan-freeze\) denied: .*legacy terminal status line/, `${name}: ${frozen.reason}`);
  }
});

/* ── 17. work-item registration face (M2-WI21, plan 2026-08-25-0950-1) ────── */

const REAL_ROADMAP_FILE = join(REPO_ROOT, "docs", "backlog", "age-autonomy-implementation-roadmap.md");
const REAL_ROADMAP_TEXT = readFileSync(REAL_ROADMAP_FILE, "utf8");
const REAL_ROADMAP_SCAN = scanRoadmapLedger(REAL_ROADMAP_TEXT);

// The 10-plan frontmatter corpus (Current Baseline list, incl. the WI21 plan
// itself) — the composite-label grammar inputs that must keep passing.
const FRONTMATTER_CORPUS = [
  "2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md",
  "2026-08-25-0815-1-m2-law-seam-policy-schema.md",
  "2026-08-25-0815-2-m2-three-hard-gates.md",
  "2026-08-25-0815-3-m2-supporting-gates.md",
  "2026-08-25-0925-1-m2-wi41-closure-routing-deadlock.md",
  "2026-08-25-0925-2-m2-wi42-wi44-validator-wiring-verify-vacuity.md",
  "2026-08-25-0925-3-m2-wi43-arch-ownerdoc-contract-sync.md",
  "2026-08-25-0950-1-m2-wi21-path-structure-guardrails-p8.md",
  "2026-08-25-0950-2-m2-wi22-evidence-face-rebuild.md",
  "2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate.md",
];

test("wi-grammar: single / composite / explicit repeated prefix expand; misses carry the registry hint", () => {
  assert.deepEqual(expandWorkItemLabel("M2-WI21").items, [{ milestone: 2, wi: "WI21" }]);
  assert.deepEqual(expandWorkItemLabel("M2-WI21+WI23+WI24").items, [
    { milestone: 2, wi: "WI21" },
    { milestone: 2, wi: "WI23" },
    { milestone: 2, wi: "WI24" },
  ]);
  // explicit repeated prefixes are the equivalent expansion (accepted)
  assert.deepEqual(expandWorkItemLabel("M2-WI21+M2-WI23").items, expandWorkItemLabel("M2-WI21+WI23").items);
  // per-token explicit milestone is well-defined (each token reconciles at its own milestone)
  assert.deepEqual(expandWorkItemLabel("M1-WI1+M2-WI22").items, [
    { milestone: 1, wi: "WI1" },
    { milestone: 2, wi: "WI22" },
  ]);
  for (const [bad, re] of [
    ["", /work-item label is empty/],
    ["WI12", /first work-item token "WI12" must carry the milestone prefix/],
    ["M2-WI21+", /trailing "\+" produces an empty token/],
    ["+WI12", /leading "\+" produces an empty token/],
    ["M2-WI21++WI22", /consecutive "\+" produces an empty token/],
    ["M2-WI21+WI", /token "WI" matches neither WI<m> nor M<n>-WI<m>/],
    ["M2-WI21+x1", /token "x1" matches neither/],
  ]) {
    const out = expandWorkItemLabel(bad);
    assert.equal(out.ok, false, JSON.stringify(bad));
    assert.match(out.error, re, JSON.stringify(bad));
  }
  // unknown WI number / cross-milestone misfile deny naming the registry
  const unknown = workItemRegistered("M2-WI99", REAL_ROADMAP_SCAN);
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /M2-WI99: milestone M2 has no WI99 \(registered: WI12, WI13/);
  const misfiled = workItemRegistered("M1-WI21", REAL_ROADMAP_SCAN);
  assert.equal(misfiled.ok, false);
  assert.match(misfiled.error, /M1-WI21: milestone M1 has no WI21 \(registered: WI1, WI2/);
  const wrongMilestone = workItemRegistered("M9-WI21", REAL_ROADMAP_SCAN);
  assert.equal(wrongMilestone.ok, false);
  assert.match(wrongMilestone.error, /M9-WI21: roadmap has no milestone M9 \(registered milestones: M1, M2/);
});

test("wi-registry: injected-scan counterexamples — empty registry and missing milestone fail (never vacuous pass)", () => {
  const empty = workItemRegistered("M2-WI21", { milestones: [] });
  assert.equal(empty.ok, false);
  assert.match(empty.error, /empty roadmap registry/);
  const noScan = workItemRegistered("M2-WI21", null);
  assert.equal(noScan.ok, false);
  assert.match(noScan.error, /empty roadmap registry/);
  const bare = workItemRegistered("M2-WI21", scanRoadmapLedger("# Roadmap\n\n## Notes\n\nprose only\n"));
  assert.equal(bare.ok, false);
  assert.match(bare.error, /empty roadmap registry/);
});

test("wi-corpus: the 10-plan frontmatter corpus reconciles against the REAL roadmap — live all-pass", () => {
  for (const name of FRONTMATTER_CORPUS) {
    const file = join(REPO_ROOT, "docs", "plans", "age-autonomy", name);
    const text = readFileSync(file, "utf8");
    const label = scanPlanLedger(text).fm["work-item"];
    const reg = workItemRegistered(label, REAL_ROADMAP_SCAN);
    assert.equal(reg.ok, true, `${name}: ${reg.error}`);
  }
  // legacy header-form corpus (> Work Item:) is syntax-shape input only —
  // those files carry no frontmatter and stay out of the registration face
  for (const name of ["2026-08-25-0635-1-m1-frontmatter-ledger-core.md", "2026-08-25-0635-2-m1-ledger-sections-derivation.md"]) {
    const file = join(REPO_ROOT, "docs", "plans", "age-autonomy", name);
    assert.equal(scanPlanLedger(readFileSync(file, "utf8")).hasFrontmatter, false, name);
  }
});

test("wi-plan-structure: registry reconciliation rides the seed rule — deny with roadmap, note without", () => {
  const ps = (label, ctx = {}) =>
    evaluateGates(
      {
        type: "write",
        path: "/p/x.md",
        proposedContent: LEGAL_PLAN.replace("work-item: M1-WI1", `work-item: ${label}`),
      },
      {
        policy: { gates: [{ id: "g", match: "{{plansDir}}/**/*.md", rule: "plan-structure", mode: "enforce" }] },
        ctx: { plansDir: "/p", ...ctx },
      },
    );
  // registered label with the roadmap injected → allow
  assert.equal(ps("M2-WI21+WI23", { roadmapText: REAL_ROADMAP_TEXT }).decision, "allow");
  // unregistered label with the roadmap injected → deny pointing at the registry
  const deny = ps("M2-WI21+WI99", { roadmapText: REAL_ROADMAP_TEXT });
  assert.equal(deny.decision, "deny");
  assert.match(deny.reason, /unregistered work-item token\(s\).*M2-WI99: milestone M2 has no WI99/);
  assert.match(deny.reason, /roadmap-registered items \(02 §4.7\)/);
  // grammar denies even without the roadmap (decidable from the label alone)
  const grammar = ps("M2-WI21+");
  assert.equal(grammar.decision, "deny");
  assert.match(grammar.reason, /malformed separator/);
  // registry fact unobservable without the roadmap → allow + note, never a deny
  const note = ps("M2-WI21");
  assert.equal(note.decision, "allow");
  assert.match(note.observations[0].reason, /work-item registration not verifiable — roadmap not injected on this face/);
});

/* ── 18. path-guardrail (M2-WI21, 02 §4.7 plansDir domain) ────────────────── */

const PG_ROOTS = ["/r/docs/plans", "/r/docs/plans/demo"];

function pg(path, content, ctx = {}) {
  return evaluateGates(
    { type: "write", path, proposedContent: content },
    {
      policy: { gates: [{ id: "path-guardrail", match: "action:write", rule: "path-guardrail", mode: "enforce" }] },
      ctx: { plansRoots: PG_ROOTS, ...ctx },
    },
  );
}

test("path-guardrail: in-domain plan-shaped writes allow (create and rewrite intercepted identically)", () => {
  const fresh = pg("/r/docs/plans/demo/x.md", LEGAL_PLAN);
  assert.equal(fresh.decision, "allow");
  assert.match(fresh.observations[0].reason, /plan-shaped write inside registered plans root \/r\/docs\/plans/);
  // rewrite face: same proposedContent judgment with prior state present
  const rewrite = pg("/r/docs/plans/demo/x.md", LEGAL_PLAN.replace("- [x] only item", "- [ ] only item"), {
    // currentFileState passes through opts, not ctx — evaluate directly below
  });
  assert.equal(rewrite.decision, "allow");
  const withCurrent = evaluateGates(
    { type: "write", path: "/r/docs/plans/demo/x.md", proposedContent: LEGAL_PLAN },
    {
      policy: { gates: [{ id: "path-guardrail", match: "action:write", rule: "path-guardrail", mode: "enforce" }] },
      currentFileState: { text: LEGAL_PLAN.replace("- [x] only item", "- [ ] only item") },
      ctx: { plansRoots: PG_ROOTS },
    },
  );
  assert.equal(withCurrent.decision, "allow");
});

test("path-guardrail: out-of-domain plan-shaped .md denies listing the registered roots", () => {
  const out = pg("/r/docs/notes/x.md", LEGAL_PLAN);
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /plan-shaped \.md write outside every registered plans root/);
  assert.match(out.reason, /registered roots here: \/r\/docs\/plans, \/r\/docs\/plans\/demo/);
  assert.match(out.reason, /write plans there, not at \/r\/docs\/notes\/x\.md \(02 §4\.7\)/);
});

test("path-guardrail: out-of-domain NON-plan .md and incomplete key sets stay out of domain", () => {
  // two keys only → not plan-shaped
  const twoKeys = pg("/r/docs/notes/x.md", LEGAL_PLAN.replace("work-item: M1-WI1\n", ""));
  assert.equal(twoKeys.decision, "allow");
  assert.match(twoKeys.observations[0].reason, /not plan-shaped \(frontmatter status\+mission\+work-item not all present\)/);
  // plain markdown with frontmatter-less body
  const plain = pg("/r/docs/notes/x.md", "# Notes\n\nplain doc\n");
  assert.equal(plain.decision, "allow");
  // legacy-format plan (no frontmatter block) → shape test cannot fire
  const legacy = pg("/r/docs/notes/x.md", "# Plan\n\n> Plan Status: active\n");
  assert.equal(legacy.decision, "allow");
  // plan-shaped content at a non-.md path
  const yml = pg("/r/missions/x.yml", LEGAL_PLAN);
  assert.equal(yml.decision, "allow");
  assert.match(yml.observations[0].reason, /not a \.md write — outside domain/);
  // roots not injected → fail-open note (02 §6)
  const noRoots = evaluateGates(
    { type: "write", path: "/r/docs/notes/x.md", proposedContent: LEGAL_PLAN },
    {
      policy: { gates: [{ id: "path-guardrail", match: "action:write", rule: "path-guardrail", mode: "enforce" }] },
      ctx: {},
    },
  );
  assert.equal(noRoots.decision, "allow");
  assert.match(noRoots.observations[0].reason, /plans roots not injected on this face .* fail-open/);
});

/* ── 19. one-mission-one-roadmap boundary (01-file-ledger :30, M2-WI21) ───── */

import { checkRoadmapUniqueness } from "../assets/src/mission-check.mjs";

test("boundary: compliant mission set passes; conflict fails naming both missions (fail-fast load face)", () => {
  const root = tmpProject();
  try {
    mkdirSync(join(root, "missions"), { recursive: true });
    writeFileSync(
      join(root, "missions", "alpha.json"),
      JSON.stringify({ name: "alpha", roadmapPath: "docs/backlog/one.md", plansDir: "docs/plans/alpha" }),
      "utf8",
    );
    writeFileSync(
      join(root, "missions", "beta.json"),
      JSON.stringify({ name: "beta", roadmapPath: "docs/backlog/two.md", plansDir: "docs/plans/beta" }),
      "utf8",
    );
    // base-style + malformed configs contribute zero claims
    writeFileSync(join(root, "missions", "base.json"), JSON.stringify({ model: "m" }), "utf8");
    writeFileSync(join(root, "missions", "broken.json"), "{ not json", "utf8");
    const ok = checkRoadmapUniqueness(join(root, "missions"));
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.conflicts, []);

    writeFileSync(
      join(root, "missions", "gamma.json"),
      JSON.stringify({ name: "gamma", roadmapPath: "./docs/backlog/one.md", plansDir: "docs/plans/gamma" }),
      "utf8",
    );
    const conflict = checkRoadmapUniqueness(join(root, "missions"));
    assert.equal(conflict.ok, false);
    assert.equal(conflict.conflicts.length, 1);
    assert.deepEqual(conflict.conflicts[0].missions.sort(), ["alpha", "gamma"]);
    assert.match(conflict.errors[0], /one-mission-one-roadmap violated: roadmap .* is declared by multiple missions \(alpha, gamma\)/);
    // the repo's live mission set is compliant
    const live = checkRoadmapUniqueness(join(REPO_ROOT, "missions"));
    assert.equal(live.ok, true, live.errors?.join("; "));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("boundary: adapter face — conflicting roadmap claims make the ancestor contribute no law context (inert passthrough)", () => {
  const root = tmpProject();
  try {
    writeMission(root);
    writePolicy(root, POLICY_BODY("enforce"));
    mkdirSync(join(root, "missions"), { recursive: true });
    writeFileSync(
      join(root, "missions", "clone.json"),
      JSON.stringify({
        name: "clone",
        roadmapPath: "docs/backlog/demo-roadmap.md",
        plansDir: "docs/plans-clone",
        autonomyPolicy: "missions/autonomy.policy.yml",
      }),
      "utf8",
    );
    const plan = writePlan(root, "docs/plans/demo/x.md");
    const out = evaluateLawCall({ name: "write", arguments: { file_path: plan, content: LEGAL_PLAN } }, {}, fsLawGateIo);
    assert.equal(out.decision, "allow");
    assert.equal(out.records.length, 0);
    assert.equal(out.lawCtx, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* ── 20. roadmap-write-guard (M2-WI21, 02 §4.7 registered-line write-back) ── */

function guardRoadmap({ m1 = "- [x] WI1 thing\n- [ ] WI2 other\n", m2 = "- [ ] WI3 third\n", fm = "audit-rounds: 1\n" } = {}) {
  return `---\n${fm}---\n# Roadmap\n\n### M1 — First\n\n${m1}\n### M2 — Second\n\n${m2}\n## Deep Audit Record\n`;
}

function rwg(proposed, { current, actor, plans, projectRoot = "/r" } = {}) {
  return evaluateGates(
    {
      type: "write",
      path: "/r/docs/backlog/roadmap.md",
      proposedContent: proposed,
      ...(actor ? { actor } : {}),
    },
    {
      policy: { gates: [{ id: "roadmap-write-guard", match: "{{roadmapPath}}", rule: "roadmap-write-guard", mode: "enforce" }] },
      currentFileState: current !== undefined ? { text: current } : undefined,
      ctx: {
        roadmapPath: "/r/docs/backlog/roadmap.md",
        projectRoot,
        ...(plans !== undefined ? { plans } : {}),
      },
    },
  );
}

test("rwg: checkbox flips and in-line evidence appends allow (the M1 write-back practice)", () => {
  const flip = rwg(guardRoadmap({ m2: "- [x] WI3 third\n" }), { current: guardRoadmap() });
  assert.equal(flip.decision, "allow");
  assert.match(flip.observations[0].reason, /WI structure unchanged — registered-line checkbox flips and in-line tail appends only/);
  const append = rwg(guardRoadmap({ m1: "- [x] WI1 thing\n- [ ] WI2 other（证据：plan p1 收口）\n" }), { current: guardRoadmap() });
  assert.equal(append.decision, "allow");
  const both = rwg(guardRoadmap({ m1: "- [x] WI1 thing\n- [x] WI2 other（证据：plan p1）\n", m2: "- [x] WI3 third\n" }), { current: guardRoadmap() });
  assert.equal(both.decision, "allow");
});

test("rwg: structural faces deny — delete line, rewrite id, rewrite line text, uncheck, reorder, milestone edits", () => {
  const cur = guardRoadmap({ m1: "- [x] WI1 thing\n- [ ] WI2 other\n- [ ] WI2b extra\n" });
  const deleted = rwg(guardRoadmap({ m1: "- [x] WI1 thing\n- [ ] WI2 other\n" }), { current: cur });
  assert.equal(deleted.decision, "deny");
  assert.match(deleted.reason, /M1: work-item line count changed \(3 → 2\) — add\/delete of WI lines is a structural change/);
  const idRewritten = rwg(guardRoadmap({ m1: "- [x] WI1 thing\n- [ ] WI9 other\n- [ ] WI2b extra\n" }), { current: cur });
  assert.equal(idRewritten.decision, "deny");
  assert.match(idRewritten.reason, /work-item id rewritten or lines reordered \(WI2 → WI9\)/);
  const textRewritten = rwg(guardRoadmap({ m1: "- [x] WI1 thing\n- [ ] WI2 renamed\n- [ ] WI2b extra\n" }), { current: cur });
  assert.equal(textRewritten.decision, "deny");
  assert.match(textRewritten.reason, /work-item line rewritten — only tail appends of evidence notes are legal/);
  const unchecked = rwg(guardRoadmap({ m1: "- [ ] WI1 thing\n- [ ] WI2 other\n- [ ] WI2b extra\n" }), { current: cur });
  assert.equal(unchecked.decision, "deny");
  assert.match(unchecked.reason, /checkbox flipped \[x\]→\[ \] — only \[ \]→\[x\] flips are legal write-backs/);
  const reordered = rwg(guardRoadmap({ m1: "- [x] WI1 thing\n- [ ] WI2b extra\n- [ ] WI2 other\n" }), { current: cur });
  assert.equal(reordered.decision, "deny");
  assert.match(reordered.reason, /id rewritten or lines reordered/);
  const headingRewritten = rwg(guardRoadmap({ m2: "- [ ] WI3 third\n" }), {
    current: guardRoadmap().replace("### M2 — Second", "### M2 — Midpoint"),
  });
  assert.equal(headingRewritten.decision, "deny");
  assert.match(headingRewritten.reason, /milestone heading 2 rewritten/);
  const milestoneAdded = rwg(guardRoadmap() + "\n### M3 — Later\n\n- [ ] WI4 next\n", { current: guardRoadmap() });
  assert.equal(milestoneAdded.decision, "deny");
  assert.match(milestoneAdded.reason, /milestone structure changed \(current 2 ### M<n> blocks, proposed 3\)/);
});

test("rwg: structural-change exceptions — engine role allows, drafter denies, id-only denies with the unverified-writer note, approved-project allows", () => {
  const cur = guardRoadmap();
  const withNewLine = guardRoadmap({ m2: "- [ ] WI3 third\n- [ ] WI4 landed-by-deep-audit\n" });
  const engine = rwg(withNewLine, { current: cur, actor: { id: "ses-flow-1", role: "engine" } });
  assert.equal(engine.decision, "allow");
  assert.match(engine.observations[0].reason, /structural change by actor role engine \(the deep-audit findings → DRAFT WI-landing path/);
  const drafter = rwg(withNewLine, { current: cur, actor: { id: "ses-draft-1", role: "drafter" } });
  assert.equal(drafter.decision, "deny");
  assert.match(drafter.reason, /add\/delete of WI lines is a structural change/);
  const idOnly = rwg(withNewLine, { current: cur, actor: { id: "ses-flow-1" } });
  assert.equal(idOnly.decision, "deny");
  assert.match(idOnly.reason, /actor role not verifiable on this face \(id-only\/absent actor — unverified-writer posture, the engine\/supervisor exception cannot be claimed here\)/);
  // approved-project: an active plan whose body names the roadmap (relative form)
  const activePlan = `---\nstatus: active\nmission: demo\nwork-item: M1-WI1\nverify: [test]\n---\n# Plan\n\n## Phase 1 — Roadmap landing\n\nTargets: docs/backlog/roadmap.md 回写\n\n- [ ] item\n`;
  const approved = rwg(withNewLine, { current: cur, plans: [{ text: activePlan, path: "/r/docs/plans/demo/p.md" }] });
  assert.equal(approved.decision, "allow");
  assert.match(approved.observations[0].reason, /approved-project exception — active plan \/r\/docs\/plans\/demo\/p.md line 11 declares this roadmap as a target/);
  // a completed-derived or draft plan does NOT carry the exception
  const draftPlan = activePlan.replace("status: active", "status: draft");
  const unapproved = rwg(withNewLine, { current: cur, plans: [{ text: draftPlan, path: "/r/docs/plans/demo/p.md" }] });
  assert.equal(unapproved.decision, "deny");
});

test("rwg: inert faces — non-roadmap target, no currentFileState, legacy roadmap", () => {
  const elsewhere = evaluateGates(
    { type: "write", path: "/r/docs/plans/demo/x.md", proposedContent: guardRoadmap() },
    {
      policy: { gates: [{ id: "roadmap-write-guard", match: "action:write", rule: "roadmap-write-guard", mode: "enforce" }] },
      currentFileState: { text: guardRoadmap() },
      ctx: { roadmapPath: "/r/docs/backlog/roadmap.md", projectRoot: "/r" },
    },
  );
  assert.equal(elsewhere.decision, "allow");
  assert.match(elsewhere.observations[0].reason, /target is not the mission roadmap — outside domain/);
  const noCurrent = rwg(guardRoadmap());
  assert.equal(noCurrent.decision, "allow");
  assert.match(noCurrent.observations[0].reason, /no currentFileState — WI-line set transition not observable/);
  const legacy = rwg("# Roadmap\n\n### M1 — First\n\n- [ ] WI1 x\n", { current: "# Roadmap\n\n### M1 — First\n\n- [x] WI1 x\n" });
  assert.equal(legacy.decision, "allow");
  assert.match(legacy.observations[0].reason, /not a frontmatter roadmap \(legacy\/dual-read\) — WI structure not comparable/);
});

test("rwg: REAL roadmap corpus smoke — an unchecked WI's checkbox flip and evidence append both allow (constructed, no file write)", () => {
  const wiLine = REAL_ROADMAP_TEXT.split("\n").find((l) => /^- \[ \] WI\d+\b/.test(l));
  assert.ok(wiLine, "an unchecked WI line present in the real roadmap");
  const flipped = REAL_ROADMAP_TEXT.replace(wiLine, wiLine.replace("- [ ]", "- [x]"));
  const appended = REAL_ROADMAP_TEXT.replace(wiLine, `${wiLine.replace("- [ ]", "- [x]")}（证据：抽验注记）`);
  for (const proposed of [flipped, appended]) {
    const out = evaluateGates(
      { type: "write", path: REAL_ROADMAP_FILE, proposedContent: proposed },
      {
        policy: { gates: [{ id: "roadmap-write-guard", match: "{{roadmapPath}}", rule: "roadmap-write-guard", mode: "enforce" }] },
        currentFileState: { text: REAL_ROADMAP_TEXT },
        ctx: { roadmapPath: REAL_ROADMAP_FILE, projectRoot: REPO_ROOT },
      },
    );
    assert.equal(out.decision, "allow", out.reason);
  }
});

/* ── 21. P8 law-self-protection (M2-WI21, 02 §4.7/§2) ─────────────────────── */

import { isLawProtectedPath } from "../assets/src/law-rules.mjs";

const P8_POLICY = {
  gates: [
    { id: "law-self-protection-law", match: "{{projectRoot}}/plugin/dsh/src/law/**", rule: "law-self-protection", mode: "enforce" },
    { id: "law-self-protection-policy", match: "{{projectRoot}}/missions/autonomy.policy.yml", rule: "law-self-protection", mode: "enforce" },
    { id: "law-self-protection-plan-check", match: "{{projectRoot}}/tools/mission-driver/src/plan-check.mjs", rule: "law-self-protection", mode: "enforce" },
    { id: "law-self-protection-gate-check", match: "{{projectRoot}}/tools/mission-driver/src/gate-check.mjs", rule: "law-self-protection", mode: "enforce" },
  ],
};

const P8_CORPUS = [{ text: LEGAL_PLAN, path: "/r/docs/plans/demo/x.md" }];

function p8(path, { actor, plans = P8_CORPUS, projectRoot = "/r" } = {}) {
  return evaluateGates(
    { type: "write", path, proposedContent: "edited", ...(actor ? { actor } : {}) },
    {
      policy: P8_POLICY,
      ctx: { projectRoot, ...(plans !== undefined ? { plans } : {}) },
    },
  );
}

test("p8: the four protected families deny AI writes with the exception channels listed", () => {
  for (const path of [
    "/r/plugin/dsh/src/law/host-adapter.ts",
    "/r/plugin/dsh/src/law/deep/nested/rule.ts",
    "/r/missions/autonomy.policy.yml",
    "/r/tools/mission-driver/src/plan-check.mjs",
    "/r/tools/mission-driver/src/gate-check.mjs",
  ]) {
    for (const actor of [{ id: "ses-exec-1", role: "executor" }, { id: "ses-draft-1", role: "drafter" }, { id: "ses-flow-1", role: "engine" }]) {
      const out = p8(path, { actor });
      assert.equal(out.decision, "deny", `${path} ${actor.role}`);
      assert.match(out.reason, /law-self-protection: .* is a protected law face .* AI writes deny \(02 §4\.7 P8: the enforced may not rewrite the enforcer\)/, `${path} ${actor.role}`);
      assert.match(out.reason, /Legal channels: human actor \(role=human\), CI \(writes outside the pre-execute pipeline\), or an approved project/, path);
    }
  }
  // engine is NOT in the exception set — the literal reverse case
  const engine = p8("/r/missions/autonomy.policy.yml", { actor: { id: "ses-flow-1", role: "engine" } });
  assert.equal(engine.decision, "deny");
  assert.match(engine.reason, /actor role engine is not in the exception set — the literal exceptions are human \/ CI \/ approved project/);
  assert.ok(isLawProtectedPath("/r/plugin/dsh/src/law/host-adapter.ts", "/r"));
  assert.equal(isLawProtectedPath("/r/plugin/dsh/src/engine-bridge.ts", "/r"), false);
  assert.equal(isLawProtectedPath("/r/missions/other.yml", "/r"), false);
  assert.equal(isLawProtectedPath("/outside/r/missions/autonomy.policy.yml", "/r"), false);
});

test("p8: human actor allows; active-plan reference allows with file+line; draft plans and missing corpora do not", () => {
  const human = p8("/r/missions/autonomy.policy.yml", { actor: { id: "ses-human-1", role: "human" } });
  assert.equal(human.decision, "allow");
  assert.match(human.observations[0].reason, /protected-path write by a human actor .*02 §4\.7 literal exception ①/);
  // approved-project: active plan whose body names the target (relative form)
  const activePlan = `---\nstatus: active\nmission: demo\nwork-item: M1-WI1\nverify: [test]\n---\n# Plan\n\n## Phase 1 — Gates\n\nTargets: missions/autonomy.policy.yml gate 注册\n\n- [ ] item\n`;
  const approved = p8("/r/missions/autonomy.policy.yml", { plans: [{ text: activePlan, path: "/r/docs/plans/demo/wi21.md" }] });
  assert.equal(approved.decision, "allow");
  assert.match(approved.observations[0].reason, /approved-project exception — active plan \/r\/docs\/plans\/demo\/wi21.md line 11 names this target \(02 §4\.7 literal exception ③\)/);
  // a draft plan naming the path does not carry the exception
  const draft = p8("/r/missions/autonomy.policy.yml", { plans: [{ text: activePlan.replace("status: active", "status: draft"), path: "/r/docs/plans/demo/wi21.md" }] });
  assert.equal(draft.decision, "deny");
  // corpus not injected → fail-closed (the adversarial face never opens on unobservable facts)
  const noCorpus = evaluateGates(
    { type: "write", path: "/r/missions/autonomy.policy.yml", proposedContent: "x" },
    { policy: P8_POLICY, ctx: { projectRoot: "/r" } },
  );
  assert.equal(noCorpus.decision, "deny");
  assert.match(noCorpus.reason, /plan corpus is not injected on this face — the approved-project exception cannot be evaluated; P8 is the unconditional adversarial face and fails closed/);
  // id-only actor: the human leg degrades to the unverified-writer note, structural legs still deny
  const idOnly = p8("/r/missions/autonomy.policy.yml", { actor: { id: "ses-anyone" } });
  assert.equal(idOnly.decision, "deny");
  assert.match(idOnly.reason, /actor role not verifiable on this face \(id-only\/absent actor — unverified-writer posture, the human exception cannot be claimed\)/);
});

test("p8: out-of-domain faces — non-protected path and missing projectRoot note, never deny", () => {
  const plain = evaluateGates(
    { type: "write", path: "/r/docs/plans/demo/x.md", proposedContent: "x" },
    {
      policy: { gates: [{ id: "sp", match: "action:write", rule: "law-self-protection", mode: "enforce" }] },
      ctx: { projectRoot: "/r", plans: P8_CORPUS },
    },
  );
  assert.equal(plain.decision, "allow");
  assert.match(plain.observations[0].reason, /target is not a protected law face — outside domain/);
  const noRoot = evaluateGates(
    { type: "write", path: "/r/missions/autonomy.policy.yml", proposedContent: "x" },
    {
      policy: { gates: [{ id: "sp", match: "action:write", rule: "law-self-protection", mode: "enforce" }] },
      ctx: {},
    },
  );
  assert.equal(noRoot.decision, "allow");
  assert.match(noRoot.observations[0].reason, /projectRoot not injected on this face — protected-path membership not decidable, outside domain/);
});

test("p8: self-referential consistency — the rule's own landing rides the approved-project leg (live corpus)", () => {
  // the real corpus: every plan under docs/plans/age-autonomy; the WI21 plan
  // itself is status: active and names missions/autonomy.policy.yml in its
  // body — evaluating a policy-file write against the real corpus ALLOWS via
  // exception ③ (the first legal consumer of the rule is its own host plan).
  const plansDir = join(REPO_ROOT, "docs", "plans", "age-autonomy");
  const records = readdirSync(plansDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ text: readFileSync(join(plansDir, f), "utf8"), path: join(plansDir, f) }));
  const out = evaluateGates(
    { type: "write", path: REAL_POLICY_FILE, proposedContent: readFileSync(REAL_POLICY_FILE, "utf8") },
    { policy: P8_POLICY, ctx: { projectRoot: REPO_ROOT, plans: records } },
  );
  assert.equal(out.decision, "allow", out.reason);
  assert.match(out.observations[0].reason, /approved-project exception — active plan .* names this target/);
  // and the host plan ITSELF carries the leg (records narrowed to 0950-1 only)
  const hostOnly = evaluateGates(
    { type: "write", path: REAL_POLICY_FILE, proposedContent: readFileSync(REAL_POLICY_FILE, "utf8") },
    {
      policy: P8_POLICY,
      ctx: { projectRoot: REPO_ROOT, plans: records.filter((r) => basename(r.path).includes("0950-1")) },
    },
  );
  assert.equal(hostOnly.decision, "allow", hostOnly.reason);
  assert.match(hostOnly.observations[0].reason, /approved-project exception — active plan .*2026-08-25-0950-1.* names this target/);
});

test("p8-corpus: the 10-plan frontmatter corpus + 00-guide pass the REAL 18-gate enforce policy with the full ctx — no false kills", () => {
  const real = parsePolicy(readFileSync(REAL_POLICY_FILE, "utf8"));
  assert.equal(real.ok, true);
  const plansDir = join(REPO_ROOT, "docs", "plans", "age-autonomy");
  const ctx = {
    plansDir,
    roadmapPath: REAL_ROADMAP_FILE,
    roadmapText: REAL_ROADMAP_TEXT,
    projectRoot: REPO_ROOT,
    plansRoots: [join(REPO_ROOT, "docs", "plans"), plansDir],
  };
  for (const name of [...FRONTMATTER_CORPUS, "../../../docs/plans/00-plan-authoring-and-execution-guide.md"]) {
    const file = resolve(plansDir, name);
    const text = readFileSync(file, "utf8");
    const out = evaluateGates(
      { type: "write", path: file, proposedContent: text },
      { policy: real.policy, ctx },
    );
    assert.equal(out.decision, "allow", `${name}: ${out.reason}`);
    // the WI21 faces ran and did not false-kill
    const pgObs = out.observations.find((o) => o.rule === "path-guardrail");
    assert.ok(pgObs, `${name}: path-guardrail observation present`);
    if (name.endsWith("00-plan-authoring-and-execution-guide.md")) {
      assert.match(pgObs.reason, /no frontmatter block — not plan-shaped/, `${name}: ${pgObs.reason}`);
    } else {
      assert.match(pgObs.reason, /inside registered plans root/, `${name}: ${pgObs.reason}`);
    }
  }
  // 00-guide has no plan frontmatter — work-item face not applicable
  const guideOut = evaluateGates(
    { type: "write", path: resolve(plansDir, "../../../docs/plans/00-plan-authoring-and-execution-guide.md"), proposedContent: readFileSync(resolve(plansDir, "../../../docs/plans/00-plan-authoring-and-execution-guide.md"), "utf8") },
    { policy: real.policy, ctx },
  );
  assert.equal(guideOut.decision, "allow");
  // outside {{plansDir}} the plan-structure gate does not match at all; the
  // action-face guardrails still ran through the loop assertions above
  assert.equal(guideOut.observations.find((o) => o.rule === "plan-structure"), undefined);
});

/* ── 24. legacy-plan-freeze (M2-WI22 — the retired plan-status-gate's
 *      protection semantics collected into the law kernel, 0950-2 Phase 1) */

import {
  LEGACY_TERMINAL_PLAN_STATUSES,
  legacyPlanStatusOf,
} from "../assets/src/law-rules.mjs";

const FREEZE_POLICY = {
  gates: [{ id: "legacy-plan-freeze", match: "action:write", rule: "legacy-plan-freeze", mode: "enforce" }],
};

const FREEZE_ROOTS = ["/r/docs/plans", "/r/docs/plans/demo"];
const FREEZE_CORPUS = [{ text: LEGAL_PLAN, path: "/r/docs/plans/demo/x.md" }];

function freeze(path, content, { current, actor, roots = FREEZE_ROOTS, plans = FREEZE_CORPUS, projectRoot = "/r" } = {}) {
  return evaluateGates(
    { type: "write", path, proposedContent: content, ...(actor ? { actor } : {}) },
    {
      policy: FREEZE_POLICY,
      ...(current !== undefined ? { currentFileState: current === null ? undefined : { text: current } } : {}),
      // roots/plans: `null` = deliberately NOT injected (the fail-open /
      // fails-closed faces); undefined = the corpus defaults.
      ctx: {
        ...(roots !== null ? { plansRoots: roots } : {}),
        ...(plans !== null ? { plans } : {}),
        projectRoot,
      },
    },
  );
}

const legacyDoc = (status) => `# Plan\n\n> Plan Status: ${status}\n\n## Phase 1 — Work\n\n- [ ] item\n`;

test("freeze: matcher helpers — glyph tolerance inherited from the shared PLAN_STATUS_RE, fence-skipped", () => {
  assert.equal(legacyPlanStatusOf("> Plan Status: completed"), "completed");
  assert.equal(legacyPlanStatusOf("> **Plan Status: Completed**"), "completed");
  assert.equal(legacyPlanStatusOf("> plan status : SUPERSEDED  "), "superseded");
  assert.equal(legacyPlanStatusOf("> **Status: deferred**"), "deferred");
  // charset-restricted capture is load-bearing (ledger-dualread): annotation
  // forms (`cancelled（…）`, the guide's `> Status: additive (…)`) are NOT
  // statuses — the freeze only sees bare status values
  assert.equal(legacyPlanStatusOf("> Plan Status: cancelled（disposition）"), null);
  assert.equal(legacyPlanStatusOf("> Status: additive (annotation)"), null);
  assert.equal(legacyPlanStatusOf("> Plan Status: in progress"), "in progress");
  assert.deepEqual(LEGACY_TERMINAL_PLAN_STATUSES.sort(), ["cancelled", "completed", "deferred", "superseded"]);
  // fenced template examples never count (dual-read read-seam discipline)
  assert.equal(legacyPlanStatusOf("# G\n\n```\n> Plan Status: completed\n```\n"), null);
  // prose mid-line mentions never count (line-anchored)
  assert.equal(legacyPlanStatusOf("- live count of `> Plan Status: completed` header lines\n"), null);
});

test("freeze: every terminal value denies in-domain; non-terminal statuses stay writable", () => {
  for (const v of LEGACY_TERMINAL_PLAN_STATUSES) {
    const out = freeze("/r/docs/plans/demo/old.md", legacyDoc(v));
    assert.equal(out.decision, "deny", v);
    assert.match(out.reason, /gate legacy-plan-freeze \(legacy-plan-freeze\) denied: .*legacy terminal status line \(Plan Status: /);
    assert.match(out.reason, /Legal channels: human actor \(role=human\), CI \(writes outside the pre-execute pipeline\), or an approved project/);
  }
  for (const v of ["active", "in progress", "draft", "planned", "held"]) {
    const out = freeze("/r/docs/plans/demo/old.md", legacyDoc(v));
    assert.equal(out.decision, "allow", v);
    assert.match(out.observations[0].reason, /no legacy terminal status line in play/);
  }
});

test("freeze: un-freeze attempts (rewrite to non-terminal, delete the line) and keep-identical rewrites all deny", () => {
  const rewrite = freeze("/r/docs/plans/demo/old.md", legacyDoc("active"), { current: legacyDoc("completed") });
  assert.equal(rewrite.decision, "deny");
  assert.match(rewrite.reason, /rewrites or deletes that line \(un-freeze attempt\)/);
  const deleted = freeze("/r/docs/plans/demo/old.md", "# Plan\n\n## Phase 1 — Work\n\n- [ ] item\n", { current: legacyDoc("completed") });
  assert.equal(deleted.decision, "deny");
  assert.match(deleted.reason, /un-freeze attempt/);
  // frozen corpus: even a byte-identical rewrite of a terminal legacy plan denies
  const identical = freeze("/r/docs/plans/demo/old.md", legacyDoc("completed"), { current: legacyDoc("completed") });
  assert.equal(identical.decision, "deny");
  assert.match(identical.reason, /carries a legacy terminal status line/);
});

test("freeze: exception channels — human allows, approved project allows with file+line, missing corpus fails closed", () => {
  const human = freeze("/r/docs/plans/demo/old.md", legacyDoc("completed"), { actor: { id: "ses-h", role: "human" } });
  assert.equal(human.decision, "allow");
  assert.match(human.observations[0].reason, /legacy terminal-line write by a human actor .*02 §4\.7 literal exception ①/);
  const activeRef = `---\nstatus: active\nmission: demo\nwork-item: M1-WI1\nverify: [test]\n---\n# Plan\n\n## Phase 1 — Repair\n\nTargets: docs/plans/demo/old.md 定稿\n\n- [ ] item\n`;
  const approved = freeze("/r/docs/plans/demo/old.md", legacyDoc("completed"), {
    plans: [{ text: activeRef, path: "/r/docs/plans/demo/wi22.md" }],
  });
  assert.equal(approved.decision, "allow");
  assert.match(approved.observations[0].reason, /approved-project exception — active plan \/r\/docs\/plans\/demo\/wi22\.md line 11 names this target/);
  const noCorpus = freeze("/r/docs/plans/demo/old.md", legacyDoc("completed"), { plans: null });
  assert.equal(noCorpus.decision, "deny");
  assert.match(noCorpus.reason, /plan corpus is not injected on this face .* fails closed/);
});

test("freeze: out-of-domain faces — non-plan .md, non-.md, missing roots, frontmatter plans stay inert", () => {
  const outside = freeze("/r/docs/notes/old.md", legacyDoc("completed"));
  assert.equal(outside.decision, "allow");
  assert.match(outside.observations[0].reason, /outside every registered plans root — outside domain/);
  const notMd = freeze("/r/docs/plans/demo/old.txt", legacyDoc("completed"));
  assert.equal(notMd.decision, "allow");
  assert.match(notMd.observations[0].reason, /not a \.md write — outside domain/);
  const noRoots = freeze("/r/docs/plans/demo/old.md", legacyDoc("completed"), { roots: null });
  assert.equal(noRoots.decision, "allow");
  assert.match(noRoots.observations[0].reason, /plans roots not injected .* fail-open/);
  const frontmatter = freeze("/r/docs/plans/demo/new.md", LEGAL_PLAN);
  assert.equal(frontmatter.decision, "allow");
  assert.match(frontmatter.observations[0].reason, /no legacy terminal status line in play/);
});

test("freeze: adapter face — real-policy project denies through the pre-execute pipeline and allows the approved project", () => {
  const root = tmpProject();
  try {
    writeMission(root);
    writePolicy(root, `version: 1\ngates:\n  - id: legacy-plan-freeze\n    match: "action:write"\n    rule: legacy-plan-freeze\n    mode: enforce\n`);
    const old = writePlan(root, "docs/plans/demo/old.md", legacyDoc("completed"));
    // corpus absent-of-reference: the mission plansDir holds only the frozen
    // legacy plan itself (LEGAL corpus not written) → deny fires end-to-end
    const denied = evaluateLawCall(
      { name: "write", arguments: { file_path: old, content: legacyDoc("completed") } },
      {},
      fsLawGateIo,
    );
    assert.equal(denied.decision, "deny");
    assert.match(denied.reason, /legacy-plan-freeze/);
    const obs = denied.records.find((r) => r.rule === "legacy-plan-freeze");
    assert.ok(obs, "freeze observation recorded");
    assert.equal(obs.mode, "enforce");
    assert.equal(obs.enforced, true);
    // edit-shaped call with disk state: un-freeze attempt through the adapter
    const unfrozen = evaluateLawCall(
      { name: "edit", arguments: { file_path: old, old_string: "> Plan Status: completed", new_string: "> Plan Status: active" } },
      {},
      fsLawGateIo,
    );
    assert.equal(unfrozen.decision, "deny");
    assert.match(unfrozen.reason, /un-freeze attempt/);
    // approved project: an active plan referencing the target flips it to allow
    writePlan(
      root,
      "docs/plans/demo/wi22-repair.md",
      LEGAL_PLAN.replace("# Plan", "# Plan\n\nTargets: docs/plans/demo/old.md 修复"),
    );
    const approved = evaluateLawCall(
      { name: "write", arguments: { file_path: old, content: legacyDoc("completed") } },
      {},
      fsLawGateIo,
    );
    assert.equal(approved.decision, "allow", approved.reason);
    assert.match(approved.records.find((r) => r.rule === "legacy-plan-freeze").reason, /approved-project exception/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
