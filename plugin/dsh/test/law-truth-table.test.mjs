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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import {
  evaluateGates,
  registerRule,
} from "../assets/src/law-core.mjs";
import { parsePolicy, policyAgentNames, checkDistinctModelSatisfiability } from "../assets/src/law-policy.mjs";
import { scanPlanLedger, computeBasisHash, deriveCompleted } from "../assets/src/ledger-sections.mjs";
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
  assert.match(out.observations[0].reason, /supervisor-unlock writer identity has no receipt syntax on this face \(mdcontrol\.unlock routing is M3\), not claiming verification/);
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

test("corpus: new-format awaitingClosure plans (0635-3, 0815-1) evaluate to allow with the awaitingClosure note — not completed", () => {
  for (const name of [
    "2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md",
    "2026-08-25-0815-1-m2-law-seam-policy-schema.md",
  ]) {
    const file = join(REPO_ROOT, "docs", "plans", "age-autonomy", name);
    const text = readFileSync(file, "utf8");
    assert.equal(deriveCompleted(text).completed, false, name);
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
    assert.match(pc.reason, /awaitingClosure/, name);
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
