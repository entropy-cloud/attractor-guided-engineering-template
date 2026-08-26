/**
 * supervisor-dispatch.test.mjs — dispatch resolution chain truth table
 * (age-autonomy M3-WI26, plan `docs/plans/age-autonomy/2026-08-26-1411-2`
 * Phase 2 Proof).
 *
 * Coverage matrix:
 *   - mapping resolution: six dispatch types × plan `agent:` override /
 *     default / undefined-name three states (02 §4.9)
 *   - DSH-form ModelSelection three fields (agentProvider/agentModel/
 *     reasoningEffort — the native-executor documented-gap fill) + the
 *     independent-form config.js channel seam
 *   - requireDistinctModel runtime enforcement three states (satisfied /
 *     refused / declared-downgrade with honest models= lineage — 0815-2 WI14
 *     residual closure; sameModelPair shared with the static check)
 *   - dispatch-line registration through the writer pipeline (law self-check:
 *     record-append-only allow face + closure-audit-binding grammar +
 *     audit-rounds-overflow budget on the deep-audit meter-increment write)
 *   - occurrenceKey idempotency: ledger re-scan answers "already dispatched"
 *     (review / audit / deep-audit unpaired / draft-plans receipt registry)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { discoverLawContext, fsLawGateIo } from "../src/law/host-adapter.ts";
import { sameModelPair } from "../assets/src/law-policy.mjs";
import { scanPlanLedger, scanRoadmapLedger } from "../assets/src/ledger-sections.mjs";
import {
  appendSectionLines,
  appendToSection,
} from "../src/supervisor/writer.ts";
import {
  dispatchAlreadyRegistered,
  dshModelSelectionOf,
  enforceDistinctModel,
  independentChannelOf,
  nextCounterOf,
  nextDispatchId,
  resolveDispatch,
} from "../src/supervisor/dispatch-resolve.ts";
import { DshNativeExecutor } from "../src/native-executor.ts";
import { createFakeAgentsService } from "./helpers/fake-agents.mjs";

// the real policy face (agents/dispatch pairs mirror missions/autonomy.policy.yml)
const POLICY = {
  agents: {
    drafter: { mode: "pooled", poolKey: "drafter:{projectRoot}", model: { provider: "zhipuai", model: "glm-5.2", reasoningEffort: "default" } },
    reviewer: { mode: "fresh", model: { provider: "zhipuai", model: "glm-5.2", reasoningEffort: "default" } },
    auditor: { mode: "fresh", model: { provider: "zhipuai", model: "glm-5.2", reasoningEffort: "high" }, requireDistinctModel: true, downgrade: "single-model" },
    executor: { mode: "pooled", poolKey: "executor:{projectRoot}", model: { provider: "zhipuai", model: "glm-5.2", reasoningEffort: "default" } },
  },
  dispatch: {
    "plan-review": "reviewer",
    "closure-audit": "auditor",
    "deep-audit": "auditor",
    "mechanical-verification": "executor",
    execute: "executor",
    "draft-plans": "drafter",
  },
};

// a distinct-auditor policy variant (no downgrade, different auditor model)
const DISTINCT_AUDITOR_POLICY = {
  ...POLICY,
  agents: {
    ...POLICY.agents,
    auditor: { mode: "fresh", model: { provider: "zhipuai", model: "glm-5.2-audit", reasoningEffort: "high" }, requireDistinctModel: true },
  },
};

// same-model auditor WITHOUT the downgrade declaration → runtime refusal face
const UNDECLARED_SAME_MODEL_POLICY = {
  ...POLICY,
  agents: {
    ...POLICY.agents,
    auditor: { mode: "fresh", model: { provider: "zhipuai", model: "glm-5.2", reasoningEffort: "high" }, requireDistinctModel: true },
  },
};

const executorBinding = resolveDispatch({ dispatchType: "execute", policy: POLICY }).ok
  ? resolveDispatch({ dispatchType: "execute", policy: POLICY }).resolution.binding
  : null;

// ── mapping resolution matrix ────────────────────────────────────────────────

test("six dispatch types resolve through the policy dispatch: mapping (defaults)", () => {
  const expected = {
    "plan-review": "reviewer",
    "closure-audit": "auditor",
    "deep-audit": "auditor",
    "mechanical-verification": "executor",
    execute: "executor",
    "draft-plans": "drafter",
  };
  for (const [dtype, agent] of Object.entries(expected)) {
    const out = resolveDispatch({ dispatchType: dtype, policy: POLICY });
    assert.equal(out.ok, true, dtype);
    assert.equal(out.resolution.agentName, agent, dtype);
    assert.equal(out.resolution.source, "dispatch-default", dtype);
    assert.equal(out.resolution.binding.mode, POLICY.agents[agent].mode, `${dtype} mode passthrough`);
  }
});

test("plan frontmatter agent: override reroutes the dispatch (legal name)", () => {
  const out = resolveDispatch({ dispatchType: "mechanical-verification", policy: POLICY, planAgent: "reviewer" });
  assert.equal(out.ok, true);
  assert.equal(out.resolution.agentName, "reviewer");
  assert.equal(out.resolution.source, "plan-agent-override");
  assert.ok(out.resolution.notes.some((n) => /overrides the dispatch: default/.test(n)));
});

test("plan frontmatter agent: absent → dispatch: default applies", () => {
  const out = resolveDispatch({ dispatchType: "plan-review", policy: POLICY, planAgent: null });
  assert.equal(out.ok, true);
  assert.equal(out.resolution.agentName, "reviewer");
  assert.equal(out.resolution.source, "dispatch-default");
});

test("plan frontmatter agent: UNDEFINED name → dispatch: default + explicit note (01 §4.1)", () => {
  const out = resolveDispatch({ dispatchType: "plan-review", policy: POLICY, planAgent: "nonexistent-agent" });
  assert.equal(out.ok, true);
  assert.equal(out.resolution.agentName, "reviewer", "undefined name never reroutes");
  assert.equal(out.resolution.source, "dispatch-default+unknown-plan-agent");
  assert.ok(out.resolution.notes.some((n) => /not a policy agents: name/.test(n)));
});

test("unresolvable faces refuse THAT dispatch (missing mapping / undefined agent / model-less def)", () => {
  const noMapping = resolveDispatch({ dispatchType: "execute", policy: { agents: POLICY.agents } });
  assert.equal(noMapping.ok, false);
  assert.match(noMapping.reason, /no policy dispatch: mapping/);
  const dangling = resolveDispatch({ dispatchType: "plan-review", policy: { agents: POLICY.agents, dispatch: { "plan-review": "ghost" } } });
  assert.equal(dangling.ok, false);
  assert.match(dangling.reason, /not defined under policy agents/);
  const modelless = resolveDispatch({
    dispatchType: "plan-review",
    policy: { agents: { reviewer: { mode: "fresh" } }, dispatch: { "plan-review": "reviewer" } },
  });
  assert.equal(modelless.ok, false);
  assert.match(modelless.reason, /no resolvable model/);
});

// ── ModelSelection composition (DSH three fields + independent seam) ────────

test("DSH ModelSelection three fields: auditor binding carries reasoningEffort=high", () => {
  const out = resolveDispatch({ dispatchType: "closure-audit", policy: POLICY });
  const sel = dshModelSelectionOf(out.resolution.binding);
  assert.equal(sel.agentProvider, "zhipuai");
  assert.equal(sel.agentModel, "glm-5.2");
  assert.equal(sel.reasoningEffort, "high", "auditor policy declares reasoningEffort: high");
  const exec = dshModelSelectionOf(executorBinding);
  assert.equal(exec.reasoningEffort, "default");
});

test("independent-form channel seam: model maps, variant/agentFile stay undefined with notes", () => {
  const out = resolveDispatch({ dispatchType: "plan-review", policy: POLICY });
  const channel = independentChannelOf(out.resolution.binding);
  assert.equal(channel.model, "glm-5.2");
  assert.equal(channel.variant, undefined);
  assert.equal(channel.agentFile, undefined);
  assert.ok(channel.notes.some((n) => /driver credential env/.test(n)));
  assert.ok(channel.notes.some((n) => /reasoningEffort/.test(n)));
});

// ── requireDistinctModel runtime enforcement (three states) ─────────────────

test("distinct-model: satisfied when the auditor pair differs from the executor pair", () => {
  const resolution = resolveDispatch({ dispatchType: "closure-audit", policy: DISTINCT_AUDITOR_POLICY }).resolution;
  const executor = resolveDispatch({ dispatchType: "execute", policy: DISTINCT_AUDITOR_POLICY }).resolution.binding;
  const out = enforceDistinctModel({ dispatchType: "closure-audit", policy: DISTINCT_AUDITOR_POLICY, resolution, executorBinding: executor });
  assert.equal(out.status, "satisfied");
  assert.match(out.lineage, /^ models=\{exec:zhipuai\/glm-5\.2,aud:zhipuai\/glm-5\.2-audit\}$/);
});

test("distinct-model: refused when the pairs are equal and NO downgrade is declared", () => {
  const resolution = resolveDispatch({ dispatchType: "deep-audit", policy: UNDECLARED_SAME_MODEL_POLICY }).resolution;
  const executor = resolveDispatch({ dispatchType: "execute", policy: UNDECLARED_SAME_MODEL_POLICY }).resolution.binding;
  const out = enforceDistinctModel({ dispatchType: "deep-audit", policy: UNDECLARED_SAME_MODEL_POLICY, resolution, executorBinding: executor });
  assert.equal(out.status, "refused");
  assert.match(out.reason, /requireDistinctModel unsatisfied at dispatch time/);
  assert.match(out.reason, /declare the explicit downgrade/);
});

test("distinct-model: declared single-model downgrade proceeds with the honest lineage (02 §4.9)", () => {
  const resolution = resolveDispatch({ dispatchType: "closure-audit", policy: POLICY }).resolution;
  const out = enforceDistinctModel({ dispatchType: "closure-audit", policy: POLICY, resolution, executorBinding });
  assert.equal(out.status, "downgraded");
  assert.match(out.reason, /single-model deployment declared/);
  assert.match(out.lineage, /^ models=\{exec:zhipuai\/glm-5\.2,aud:zhipuai\/glm-5\.2\}$/);
});

test("distinct-model: floor is inert for non-audit dispatch types and unflagged agents", () => {
  const review = resolveDispatch({ dispatchType: "plan-review", policy: POLICY }).resolution;
  const out = enforceDistinctModel({ dispatchType: "plan-review", policy: POLICY, resolution: review, executorBinding });
  assert.equal(out.status, "satisfied");
  assert.match(out.reason, /no requireDistinctModel floor/);
});

test("sameModelPair: the ONE shared comparison (extracted from checkDistinctModelSatisfiability)", () => {
  assert.equal(sameModelPair({ provider: "p", model: "m" }, { provider: "p", model: "m" }), true);
  assert.equal(sameModelPair({ provider: "p", model: "m" }, { provider: "p", model: "m2" }), false);
  assert.equal(sameModelPair({ provider: "p", model: "m" }, { provider: "p2", model: "m" }), false);
  assert.equal(sameModelPair(undefined, { provider: "p", model: "m" }), false);
  assert.equal(sameModelPair({ provider: "p" }, { provider: "p", model: undefined }), false);
});

// ── fixtures for the writer pipeline (law self-check on real files) ─────────

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "supervisor-dispatch-"));
}

function writeFullPolicy(root, { maxAuditRounds = 3 } = {}) {
  mkdirSync(join(root, "missions"), { recursive: true });
  writeFileSync(
    join(root, "missions", "autonomy.policy.yml"),
    `version: 1
limits:
  maxAuditRounds: ${maxAuditRounds}
gates:
  - id: plan-structure
    match: "{{plansDir}}/**/*.md"
    rule: plan-structure
    mode: enforce
  - id: closure-audit-binding
    match: "{{plansDir}}/**/*.md"
    rule: closure-audit-binding
    mode: enforce
  - id: roadmap-audit-binding
    match: "{{roadmapPath}}"
    rule: roadmap-audit-binding
    mode: enforce
  - id: claim-taken
    match: "{{plansDir}}/**/*.md"
    rule: claim-validity
    mode: enforce
  - id: meter-guard
    match: "{{roadmapPath}}"
    rule: audit-rounds-overflow
    mode: enforce
  - id: roadmap-write-guard
    match: "{{roadmapPath}}"
    rule: roadmap-write-guard
    mode: enforce
  - id: append-only-records
    match: "{{plansDir}}/**/*.md"
    rule: record-append-only
    mode: enforce
  - id: append-only-records-roadmap
    match: "{{roadmapPath}}"
    rule: record-append-only
    mode: enforce
triggers:
  - when: "plan.status=draft and review-dispatch-missing"
    dispatch: plan-review
agents:
  drafter:
    mode: pooled
    poolKey: "drafter:{projectRoot}"
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
  reviewer:
    mode: fresh
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
  auditor:
    mode: fresh
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: high }
    requireDistinctModel: true
    downgrade: single-model
  executor:
    mode: pooled
    poolKey: "executor:{projectRoot}"
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
dispatch:
  plan-review: reviewer
  closure-audit: auditor
  deep-audit: auditor
  mechanical-verification: executor
  execute: executor
  draft-plans: drafter
`,
    "utf8",
  );
  writeFileSync(
    join(root, "missions", "demo.json"),
    JSON.stringify({
      name: "demo",
      roadmapPath: "docs/backlog/demo-roadmap.md",
      plansDir: "docs/plans/demo",
      commands: { test: "true" },
      autonomyPolicy: "missions/autonomy.policy.yml",
    }),
    "utf8",
  );
}

function writeRoadmap(root, { auditRounds = 1, darLines = [] } = {}) {
  const file = join(root, "docs", "backlog", "demo-roadmap.md");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `---
audit-rounds: ${auditRounds}
---

# Demo Roadmap

### M1 — Demo milestone

- [x] WI1 first item
- [ ] WI2 second item

## Deep Audit Record
${darLines.join("\n")}
`,
    "utf8",
  );
  return file;
}

function planText({ status = "active", checked = true } = {}) {
  return `---
status: ${status}
mission: demo
work-item: M1-WI1
---

# Plan

## Phase 1 — Work

- [${checked ? "x" : " "}] only item

## Draft Review Record

## Verification

## Closure
`;
}

function writePlan(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, "utf8");
  return p;
}

function lawCtxOf(root) {
  const ctx = discoverLawContext(join(root, "missions"), fsLawGateIo);
  assert.notEqual(ctx, null, "fixture law context must resolve");
  return ctx;
}

// ── dispatch-line registration through the writer (law self-check) ──────────

test("dispatch audit line lands in ## Closure through the law self-check (append-only allow + grammar)", () => {
  const root = tmpProject();
  try {
    writeFullPolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/a.md", planText({}));
    const id = nextDispatchId({ kind: "audit", runId: "mdsupervisor", stem: "a", counter: 1, nonce: "aaaaaaaa" });
    const out = appendSectionLines({
      path: plan,
      section: "Closure",
      lines: [`- dispatch audit ${id} to ses-aud-1 models={exec:zhipuai/glm-5.2,aud:zhipuai/glm-5.2}`],
      lawCtx: lawCtxOf(root),
      now: () => Date.parse("2026-08-26T12:00:00.000Z"),
    });
    assert.equal(out.status, "written", out.reason ?? "");
    const text = readFileSync(plan, "utf8");
    assert.match(text, new RegExp(`- dispatch audit ${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} to ses-aud-1 models=`));
    const scan = scanPlanLedger(text);
    assert.equal(scan.errors.length, 0, "written line is grammar-clean");
    assert.equal(scan.closure.dispatches.length, 1);
    assert.deepEqual(scan.closure.dispatches[0].models, { exec: "zhipuai/glm-5.2", aud: "zhipuai/glm-5.2" }, "models= lineage parses (01 §4.2)");
    // occurrence dedup: the ledger now answers "already dispatched"
    const dup = dispatchAlreadyRegistered({ occurrenceType: "audit", planText: text, roadmapText: null, receiptLines: [], occurrenceKey: "k" });
    assert.equal(dup.already, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch review line lands in ## Draft Review Record; second occurrence refuses by ledger re-scan", () => {
  const root = tmpProject();
  try {
    writeFullPolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/d.md", planText({ status: "draft", checked: false }));
    const before = dispatchAlreadyRegistered({ occurrenceType: "review", planText: readFileSync(plan, "utf8"), roadmapText: null, receiptLines: [], occurrenceKey: "k" });
    assert.equal(before.already, false);
    const id = nextDispatchId({ kind: "review", runId: "mdsupervisor", stem: "d", counter: 1, nonce: "bbbbbbbb" });
    const out = appendSectionLines({
      path: plan,
      section: "Draft Review Record",
      lines: [`- dispatch review ${id} to ses-rev-1`],
      lawCtx: lawCtxOf(root),
      now: () => Date.parse("2026-08-26T12:00:00.000Z"),
    });
    assert.equal(out.status, "written", out.reason ?? "");
    const text = readFileSync(plan, "utf8");
    const after = dispatchAlreadyRegistered({ occurrenceType: "review", planText: text, roadmapText: null, receiptLines: [], occurrenceKey: "k" });
    assert.equal(after.already, true, "the dispatch line itself is the registry (03 §5 — no second store)");
    assert.equal(nextCounterOf([id], `#review-mdsupervisor-d-`), 2, "next iteration derives from existing lines");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("malformed dispatch line is law-DENIED at the writer (closure-audit-binding grammar face) — nothing lands", () => {
  const root = tmpProject();
  try {
    writeFullPolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/a.md", planText({}));
    const before = readFileSync(plan, "utf8");
    const out = appendSectionLines({
      path: plan,
      section: "Closure",
      lines: ["- dispatch audit #not-a-valid-id to ses-aud-1"],
      lawCtx: lawCtxOf(root),
      now: () => Date.parse("2026-08-26T12:00:00.000Z"),
    });
    assert.equal(out.status, "denied");
    assert.match(out.reason ?? "", /malformed-dispatch/, "the law self-check denies a grammar-breaking dispatch line before it lands (plan-structure surfaces the scan error; closure-audit-binding owns the same face)");
    assert.equal(readFileSync(plan, "utf8"), before, "denied append leaves the file byte-identical");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deep-audit registration: DAR dispatch line + audit-rounds increment in ONE atomic write (budget gate allows)", () => {
  const root = tmpProject();
  try {
    writeFullPolicy(root);
    const roadmap = writeRoadmap(root, { auditRounds: 1 });
    const id = nextDispatchId({ kind: "audit", runId: "mdsupervisor", stem: "demo-roadmap", counter: 2, nonce: "cccccccc" });
    const out = appendSectionLines({
      path: roadmap,
      section: "Deep Audit Record",
      lines: [`- dispatch audit ${id} to ses-aud-9 models={exec:zhipuai/glm-5.2,aud:zhipuai/glm-5.2}`],
      setFrontmatter: { "audit-rounds": 2 },
      lawCtx: lawCtxOf(root),
      now: () => Date.parse("2026-08-26T12:00:00.000Z"),
    });
    assert.equal(out.status, "written", out.reason ?? "");
    const text = readFileSync(roadmap, "utf8");
    assert.match(text, /audit-rounds: 2/, "meter incremented in the same write (01 §3.1)");
    const scan = scanRoadmapLedger(text);
    assert.equal(scan.errors.length, 0, JSON.stringify(scan.errors));
    assert.equal(scan.fm["audit-rounds"], 2);
    // unpaired dispatch in flight → deep-audit occurrence refuses re-dispatch
    const dup = dispatchAlreadyRegistered({ occurrenceType: "deep-audit", planText: null, roadmapText: text, receiptLines: [], occurrenceKey: "k" });
    assert.equal(dup.already, true, "unpaired DAR dispatch line marks the audit in flight");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deep-audit registration out of budget is law-DENIED (audit-rounds-overflow face)", () => {
  const root = tmpProject();
  try {
    writeFullPolicy(root, { maxAuditRounds: 1 });
    const roadmap = writeRoadmap(root, { auditRounds: 1 });
    const before = readFileSync(roadmap, "utf8");
    const id = nextDispatchId({ kind: "audit", runId: "mdsupervisor", stem: "demo-roadmap", counter: 2, nonce: "dddddddd" });
    const out = appendSectionLines({
      path: roadmap,
      section: "Deep Audit Record",
      lines: [`- dispatch audit ${id} to ses-aud-9`],
      setFrontmatter: { "audit-rounds": 2 },
      lawCtx: lawCtxOf(root),
      now: () => Date.parse("2026-08-26T12:00:00.000Z"),
    });
    assert.equal(out.status, "denied");
    assert.match(out.reason ?? "", /audit-rounds-overflow/);
    assert.equal(readFileSync(roadmap, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── occurrence idempotency: draft-plans receipt registry ─────────────────────

test("draft-plans occurrence dedups against the receipt record (the one type with no ledger grammar)", () => {
  const key = "/p/docs/backlog/r.md#draft@abcd1234";
  const fresh = dispatchAlreadyRegistered({ occurrenceType: "draft", planText: null, roadmapText: "# r", receiptLines: [], occurrenceKey: key });
  assert.equal(fresh.already, false);
  const recorded = dispatchAlreadyRegistered({
    occurrenceType: "draft",
    planText: null,
    roadmapText: "# r",
    receiptLines: [JSON.stringify({ event: "dispatch:draft-plans", detail: "…", occurrenceKey: key })],
    occurrenceKey: key,
  });
  assert.equal(recorded.already, true, "the durable receipt JSONL answers for draft-plans occurrences");
});

test("nextDispatchId shape + counter derivation (01 §4.4 tail-anchored grammar)", () => {
  const id = nextDispatchId({ kind: "audit", runId: "run-9", stem: "plan-stem", counter: 3, nonce: "1e2f3a4b" });
  assert.equal(id, "#audit-run-9-plan-stem-3-1e2f3a4b");
  assert.equal(nextCounterOf(["#audit-run-9-plan-stem-1-11111111", "#audit-run-9-plan-stem-3-22222222"], "#audit-run-9-plan-stem-"), 4);
  assert.equal(nextCounterOf([], "#audit-run-9-plan-stem-"), 1);
  assert.throws(() => nextDispatchId({ kind: "audit", runId: "r", stem: "s", counter: 1, nonce: "ZZZ" }));
});

// ── appendToSection pure face ────────────────────────────────────────────────

test("appendToSection: inserts before trailing blanks, creates missing sections at EOF, preserves bytes", () => {
  const text = `---
status: draft
mission: demo
work-item: M1-WI1
---

# Plan

## Phase 1 — Work

- [ ] item

## Draft Review Record

## Verification
`;
  const out = appendToSection(text, "Draft Review Record", ["- dispatch review #review-r-d-1-aaaa1111 to ses-1"]);
  assert.match(out, /## Draft Review Record\n- dispatch review #review-r-d-1-aaaa1111 to ses-1\n\n## Verification/, "inserted at section end, blank separator preserved");
  const created = appendToSection(text, "Closure", ["- dispatch audit #audit-r-d-1-aaaa1111 to ses-1"]);
  assert.equal(created.slice(0, text.length), text, "existing bytes (incl. the trailing newline) preserved verbatim when creating the section");
  assert.match(created, /\n## Closure\n- dispatch audit #audit-r-d-1-aaaa1111 to ses-1$/);
  assert.equal(appendToSection("# no frontmatter\n", "Closure", ["- x"]), null, "outside the writer domain");
});

// ── native-executor ModelSelection channel (documented-gap fill) ─────────────

test("native-executor: config.nativeModelSelection flows agentOptions + installs the ModelSelection face", async () => {
  const { service, state } = createFakeAgentsService({ script: ["ok"] });
  const setupCtxCalls = [];
  const recordingService = {
    ...service,
    async create(options) {
      if (typeof options.setup === "function") {
        const fakeCtx = { on: (name) => { setupCtxCalls.push(name); return () => {} } };
        await options.setup(fakeCtx);
      }
      return service.create({ ...options, setup: undefined });
    },
  };
  const ex = new DshNativeExecutor({
    agents: recordingService,
    config: {
      projectRoot: "/tmp/proj",
      nativeModelSelection: { provider: "zhipuai", model: "glm-5.2", reasoningEffort: "high" },
    },
  });
  const r = await ex.executeAgent("PING", "go", "sys", null, undefined, undefined);
  assert.equal(r.ok, true);
  const create = state.creates[0];
  assert.deepEqual(create.agentOptions, { provider: "zhipuai", model: "glm-5.2" }, "agentProvider/agentModel ride agentOptions");
  assert.ok(setupCtxCalls.includes("system-prompt/assemble") && setupCtxCalls.includes("agent/request"), "reasoningEffort rides the dsh-agent ModelSelection install (three-field channel)");
  await ex.dispose();
});

test("native-executor: without nativeModelSelection the legacy resolution chain is unchanged", async () => {
  const { service, state } = createFakeAgentsService({ script: ["ok"] });
  const ex = new DshNativeExecutor({
    agents: service,
    config: { projectRoot: "/tmp/proj", nativeProvider: "prov-x", nativeModel: "model-y" },
  });
  await ex.executeAgent("PING", "go", "sys", null, undefined, undefined);
  assert.deepEqual(state.creates[0].agentOptions, { provider: "prov-x", model: "model-y" });
  await ex.dispose();
});
