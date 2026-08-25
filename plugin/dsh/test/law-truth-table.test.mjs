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
import { parsePolicy, policyAgentNames } from "../assets/src/law-policy.mjs";
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
