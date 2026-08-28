/**
 * supervisor-failures.test.mjs — failure attribution buckets + circuit breaker
 * truth table (age-autonomy M3-WI27, plan
 * `docs/plans/age-autonomy/2026-08-26-1411-3` Phase 2 Proof; runs inside the
 * L2 plugin suite `test/*.test.mjs` → `./verify-age.sh`).
 *
 * Coverage matrix (02-rule-law §4.6 increment + 03-supervisor §7):
 *   - three buckets each count once at their wired failure points
 *     (verification-red ← mechanical-verification red run;
 *     claim-expired-no-output ← reclaim actually clearing a claim;
 *     executor-error ← executor dispatch create/re-issue failure)
 *   - not-counted negatives: CAS conflict (infrastructure noise),
 *     observation-only records, dual-driver idempotent skips, reclaim noop
 *     (nothing cleared), no-keys skip (config face, not a red run)
 *   - circuit-breaker held write: status+hold+failures same-write shape,
 *     live claim cleared in the same write (claim-validity ⑤), law
 *     self-check passes (writer-identity T5, zero rule changes)
 *   - all-held terminalization THROUGH the Phase 1 evaluation core (R3
 *     blocked — dual-entry same-source discipline)
 *   - single held never blocks the others (03 §4 Queue ≠ approval)
 *   - reset edge: held→active same-write failures=0 passes writer-identity;
 *     the non-reset variant is denied by the EXISTING rule (zero changes)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { discoverLawContext, fsLawGateIo } from "../src/law/host-adapter.ts";
import { evaluateGates } from "../assets/src/law-core.mjs";
import { scanPlanLedger } from "../assets/src/ledger-sections.mjs";
import { sha256Text } from "../assets/src/law-core.mjs";
import { fsMeterWriterIo, SUPERVISOR_ACTOR } from "../src/supervisor/writer.ts";
import { scanSupervisorSnapshot } from "../src/supervisor/decision-core.ts";
import { dispatchPlanReview, reclaimClaim, runMechanicalVerification } from "../src/supervisor/exec-arm.ts";
import { evaluateTermination } from "../src/supervisor/terminal-rules.ts";
import { applyCircuitBreaker, FAILURE_BUCKETS, recordPlanFailure } from "../src/supervisor/failures.ts";
import { createFakeAgentsService } from "./helpers/fake-agents.mjs";

const NOW_MS = Date.parse("2026-08-26T12:00:00.000Z");
const PAST_ISO = "2026-08-26T11:00:00.000Z";
const EXPIRED_CLAIM = "attempt-run-1-ses-holder-1-ab12cd34";

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "supervisor-failures-"));
}

function writePolicy(root, { testCommand = "echo ok" } = {}) {
  mkdirSync(join(root, "missions"), { recursive: true });
  writeFileSync(
    join(root, "missions", "autonomy.policy.yml"),
    `version: 1
limits:
  maxAuditRounds: 3
  maxFailures: 3
gates:
  - id: plan-structure
    match: "{{plansDir}}/**/*.md"
    rule: plan-structure
    mode: enforce
  - id: writer-identity
    match: "{{plansDir}}/**/*.md"
    rule: writer-identity
    mode: enforce
  - id: plan-completed
    match: "{{plansDir}}/**/*.md"
    rule: plan-completed
    mode: enforce
  - id: claim-taken
    match: "{{plansDir}}/**/*.md"
    rule: claim-validity
    mode: enforce
  - id: roadmap-write-guard
    match: "{{roadmapPath}}"
    rule: roadmap-write-guard
    mode: enforce
  - id: meter-guard
    match: "{{roadmapPath}}"
    rule: audit-rounds-overflow
    mode: enforce
  - id: append-only-records
    match: "{{plansDir}}/**/*.md"
    rule: record-append-only
    mode: enforce
  - id: append-only-records-roadmap
    match: "{{roadmapPath}}"
    rule: record-append-only
    mode: enforce
agents:
  reviewer:
    mode: fresh
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
  executor:
    mode: pooled
    poolKey: "executor:{projectRoot}"
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
dispatch:
  plan-review: reviewer
  mechanical-verification: executor
  execute: executor
`,
    "utf8",
  );
  writeFileSync(
    join(root, "missions", "demo.json"),
    JSON.stringify({
      name: "demo",
      roadmapPath: "docs/backlog/demo-roadmap.md",
      plansDir: "docs/plans/demo",
      commands: { test: testCommand },
      autonomyPolicy: "missions/autonomy.policy.yml",
    }),
    "utf8",
  );
}

function writeRoadmap(root, { auditRounds = 1, wi1Checked = true } = {}) {
  const file = join(root, "docs", "backlog", "demo-roadmap.md");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `---
audit-rounds: ${auditRounds}
---

# Demo Roadmap

## Work Item Status

### M1 — Demo milestone

- [${wi1Checked ? "x" : " "}] WI1 first item
- [ ] WI2 second item

## Deep Audit Record
`,
    "utf8",
  );
  return file;
}

function planText({ status = "active", ticked = false, claim = null, expires = null, failures = null } = {}) {
  const fm = [
    "---",
    `status: ${status}`,
    "mission: demo",
    "work-item: M1-WI1",
    failures !== null ? `failures: ${failures}` : null,
    status === "held" ? 'hold: "waiting"' : null,
    claim !== null ? `claim: ${claim}` : null,
    expires !== null ? `claim-expires: ${expires}` : null,
    "---",
  ]
    .filter((l) => l !== null)
    .join("\n");
  return `${fm}
# Plan

## Phase 1 — Work

- [${ticked ? "x" : " "}] only item

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
  assert.notEqual(ctx, null);
  return ctx;
}

function failuresOf(path) {
  const scan = scanPlanLedger(readFileSync(path, "utf8"));
  return typeof scan.fm.failures === "number" ? scan.fm.failures : null;
}

const hitOf = (target) => ({
  type: "dispatch",
  posture: "execute",
  face: "trigger",
  action: "mechanical-verification",
  target,
  reason: "test",
  trigger: { index: 0, when: "test", exit: "dispatch", exitValue: "mechanical-verification", domain: "plan" },
  occurrence: { key: `t#verification@deadbeef`, type: "verification" },
  errors: [],
});

// ── bucket counting: three failure sources, each counts once ────────────────

test("three buckets: verification-red / claim-expired-no-output / executor-error each attribute exactly once at their wired points", async () => {
  const root = tmpProject();
  try {
    writePolicy(root, { testCommand: "exit 1" }); // red verify fixture command
    writeRoadmap(root);
    const lawCtx = lawCtxOf(root);
    assert.equal(lawCtx.maxFailures, 3, "host adapter resolves the policy-authoritative bound");

    // plan A: full-tick, no claim (awaitingClosure shape) — verification-red point
    const planA = writePlan(root, "docs/plans/demo/a.md", planText({ ticked: true }));
    // plan B: active, NOT full-tick, expired claim — reclaim points
    const planB = writePlan(
      root,
      "docs/plans/demo/b.md",
      planText({ ticked: false, claim: EXPIRED_CLAIM, expires: PAST_ISO }),
    );

    const receipts = [];
    const receipt = (r) => receipts.push(r);
    const opts = { projectRoot: root, lawCtx, io: fsMeterWriterIo, clock: () => NOW_MS, receipt };

    // ① verification-red: red run → +1, no pass lines
    const red = await runMechanicalVerification(hitOf(planA), {
      ...opts,
      runId: "run-1",
    });
    assert.equal(red.status, "failed");
    assert.equal(failuresOf(planA), 1);
    assert.ok(!/- pass /.test(readFileSync(planA, "utf8")), "no pass lines on red");

    // ② claim-expired-no-output: reclaim actually clears the expired claim → +1 (degraded re-dispatch, no agents face)
    const reclaim = await reclaimClaim(
      { ...hitOf(planB), action: "reclaim-claim", occurrence: { key: "b#reclaim@deadbeef", type: "reclaim" } },
      { ...opts, runId: "run-1" },
    );
    assert.equal(reclaim.status, "degraded", "no agents face — clear + deferred re-dispatch");
    assert.equal(failuresOf(planB), 1);
    assert.ok(!/claim:/.test(readFileSync(planB, "utf8")), "claim cleared in the reclaim");

    // ③ executor-error: the re-dispatch create fails → +1 (claim already cleared → no second expiry count)
    const throwing = createFakeAgentsService({ script: [], createError: new Error("agent create boom") });
    const failedDispatch = await reclaimClaim(
      { ...hitOf(planB), action: "reclaim-claim", occurrence: { key: "b#reclaim@feedface", type: "reclaim" } },
      { ...opts, runId: "run-1", agents: throwing.service },
    );
    assert.equal(failedDispatch.status, "failed");
    assert.equal(failuresOf(planB), 2, "executor-error counted; the noop clear did NOT re-count claim-expired");

    // per-bucket receipts each exactly once
    for (const bucket of FAILURE_BUCKETS) {
      assert.equal(receipts.filter((r) => r.event === `failure-attributed:${bucket}`).length, 1, `${bucket} attributed once`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── not-counted negatives (noise prevention, 02 §4.6) ───────────────────────

test("not counted: a CAS-conflicted attribution write counts nothing (infrastructure noise)", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const lawCtx = lawCtxOf(root);
    const plan = writePlan(root, "docs/plans/demo/a.md", planText({}));
    const before = readFileSync(plan, "utf8");

    // rigged io: every plan-path read returns content whose BASIS domain
    // (frontmatter + Phase — the writePlanFailures CAS face, computeBasisHash)
    // differs between the read and the re-read → the CAS compare never
    // matches → the writer abandons with 'conflict'
    let seq = 0;
    const rigged = {
      ...fsMeterWriterIo,
      readTextFile(p) {
        if (p === plan) return before.replace("- [ ] only item", (m) => `${m} <!-- rig ${seq++} -->`);
        return fsMeterWriterIo.readTextFile(p);
      },
      writeTextAtomic() {
        throw new Error("must never write on a conflicted basis");
      },
    };
    const receipts = [];
    const out = recordPlanFailure({ planPath: plan, bucket: "executor-error", lawCtx, io: rigged, receipt: (r) => receipts.push(r) });
    assert.equal(out.status, "conflict");
    assert.equal(out.failures, null);
    assert.equal(readFileSync(plan, "utf8"), before, "file untouched");
    assert.ok(receipts.some((r) => r.event === "failure-attribution-skipped:executor-error"), "skip receipt explains the noise-prevention posture");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("not counted: observation-only records and no-keys skips never touch failures", async () => {
  const root = tmpProject();
  try {
    writePolicy(root); // commands.test = echo ok (green)
    writeRoadmap(root);
    const lawCtx = lawCtxOf(root);
    const plan = writePlan(root, "docs/plans/demo/a.md", planText({ ticked: true }));
    const before = readFileSync(plan, "utf8");

    // no-keys face: verify plan unresolvable → 'skipped' (config face), NOT a red run
    writeFileSync(join(root, "missions", "demo.json"), JSON.stringify({ name: "demo", roadmapPath: "docs/backlog/demo-roadmap.md", plansDir: "docs/plans/demo", commands: {}, autonomyPolicy: "missions/autonomy.policy.yml" }), "utf8");
    const ctxNoCommands = lawCtxOf(root);
    const receipts = [];
    const skipped = await runMechanicalVerification(hitOf(plan), {
      projectRoot: root,
      lawCtx: ctxNoCommands,
      io: fsMeterWriterIo,
      clock: () => NOW_MS,
      receipt: (r) => receipts.push(r),
      runId: "run-1",
    });
    assert.equal(skipped.status, "skipped");
    assert.equal(failuresOf(plan), null, "no verify keys resolvable — nothing attributed");
    assert.ok(receipts.some((r) => r.event === "mechanical-verification-no-keys"));

    // observation-only face: receipts appended, ledger untouched
    assert.equal(readFileSync(plan, "utf8"), before);
    void lawCtx;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("not counted: dual-driver idempotent skip (occurrence already registered) attributes nothing", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/a.md", planText({}));
    const fake = createFakeAgentsService({ script: ["ok"] });
    const receipts = [];
    const opts = {
      projectRoot: root,
      lawCtx: lawCtxOf(root),
      io: fsMeterWriterIo,
      clock: () => NOW_MS,
      receipt: (r) => receipts.push(r),
      runId: "run-1",
      agents: fake.service,
    };
    const hit = {
      ...hitOf(plan),
      action: "plan-review",
      trigger: { index: 2, when: "test", exit: "dispatch", exitValue: "plan-review", domain: "plan" },
      occurrence: { key: `${plan}#review@deadbeef`, type: "review" },
    };
    const first = await dispatchPlanReview(hit, opts);
    assert.equal(first.status, "dispatched", `first occurrence dispatches: ${first.detail}`);
    assert.equal(failuresOf(plan), null, "a successful dispatch attributes nothing");
    const second = await dispatchPlanReview(hit, opts);
    assert.equal(second.status, "skipped", "the re-driven occurrence is dedup-skipped (dual-driver idempotency)");
    assert.equal(failuresOf(plan), null, "the skipped occurrence attributes NOTHING — counting it would double-attribute one occurrence");
    assert.equal(fake.state.creates.length, 1, "no second agent session");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── circuit breaker: held write shape + law self-check ──────────────────────

test("circuit breaker: failures ≥ maxFailures → ONE atomic write status=held + hold + failures re-pin + claim cleared", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const lawCtx = lawCtxOf(root);
    const plan = writePlan(
      root,
      "docs/plans/demo/a.md",
      planText({ failures: 3, claim: EXPIRED_CLAIM, expires: PAST_ISO }),
    );
    const receipts = [];
    const out = applyCircuitBreaker({ lawCtx, io: fsMeterWriterIo, receipt: (r) => receipts.push(r) });
    assert.deepEqual(out.held, [plan.split("\\").join("/")]);
    const text = readFileSync(plan, "utf8");
    const scan = scanPlanLedger(text);
    assert.equal(scan.fm.status, "held");
    assert.equal(scan.fm.failures, 3, "failures re-pinned in the same write (evidence face, 01 §5.1 T5)");
    assert.match(scan.fm.hold, /^failures 3 ≥ maxFailures 3 — circuit breaker/);
    assert.ok(!/claim:/.test(text) && !/claim-expires:/.test(text), "claim pair cleared in the same write (claim-validity ⑤)");
    assert.ok(receipts.some((r) => r.event === "circuit-breaker:held"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("circuit breaker: a single held plan never blocks the others (03 §4 Queue ≠ approval)", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const lawCtx = lawCtxOf(root);
    const guilty = writePlan(root, "docs/plans/demo/guilty.md", planText({ failures: 3 }));
    const healthy = writePlan(root, "docs/plans/demo/healthy.md", planText({}));
    const healthyBefore = readFileSync(healthy, "utf8");
    const out = applyCircuitBreaker({ lawCtx, io: fsMeterWriterIo });
    assert.equal(out.held.length, 1);
    assert.equal(scanPlanLedger(readFileSync(healthy, "utf8")).fm.status, "active", "healthy plan untouched — still executable/reviewable");
    assert.equal(readFileSync(healthy, "utf8"), healthyBefore);
    void guilty;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("circuit breaker: all held ∧ no executable open plan → Phase 1 core terminalizes blocked (R3)", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root, { auditRounds: 2 }); // ≥1: R3 face armed
    const lawCtx = lawCtxOf(root);
    writePlan(root, "docs/plans/demo/a.md", planText({ failures: 3 }));
    writePlan(root, "docs/plans/demo/b.md", planText({ failures: 3 }));
    const out = applyCircuitBreaker({ lawCtx, io: fsMeterWriterIo });
    assert.equal(out.held.length, 2);
    assert.equal(out.alreadyHeld, 2, "post-pass census counts the held corpus");

    // the ALL-held terminal face rides the SAME evaluation core (dual-entry
    // same-source discipline): rescan → R1–R4 → blocked
    const snapshot = scanSupervisorSnapshot({ projectRoot: root, lawCtx, io: fsLawGateIo, clock: () => NOW_MS });
    const evaluation = evaluateTermination(snapshot, { maxAuditRounds: lawCtx.maxAuditRounds, maxFailures: lawCtx.maxFailures });
    assert.equal(evaluation.decision, "blocked");
    assert.equal(evaluation.rule, "R3");
    assert.match(evaluation.reasons.join("; "), /heldPlans\(\)==2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("circuit breaker: below the bound nothing trips (inert pass, idempotent over already-held)", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const lawCtx = lawCtxOf(root);
    const low = writePlan(root, "docs/plans/demo/low.md", planText({ failures: 2 }));
    const heldAlready = writePlan(root, "docs/plans/demo/held.md", planText({ status: "held", failures: 3 }));
    const heldBefore = readFileSync(heldAlready, "utf8");
    const out = applyCircuitBreaker({ lawCtx, io: fsMeterWriterIo });
    assert.deepEqual(out.held, []);
    assert.equal(scanPlanLedger(readFileSync(low, "utf8")).fm.status, "active", "failures 2 < maxFailures 3 — no trip");
    assert.equal(readFileSync(heldAlready, "utf8"), heldBefore, "already-held plan not re-written (idempotent)");
    assert.equal(out.alreadyHeld, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── the reset edge: held→active same-write failures=0 (writer-identity, zero rule changes) ──

test("reset edge: unlock same-write failures=0 passes the EXISTING writer-identity face; a non-reset unlock is denied", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/a.md", planText({ status: "held", failures: 3 }));
    const path = join(root, "docs", "plans", "demo", "a.md");
    const current = readFileSync(path, "utf8");

    const propose = (fields) => {
      const lines = current
        .split("\n")
        .filter((l) => !/^(status|failures|hold):/.test(l));
      const insertAt = lines.indexOf("---") + 1;
      lines.splice(insertAt, 0, ...fields);
      return lines.join("\n");
    };

    const gate = (proposed) =>
      evaluateGates(
        { type: "write", path, proposedContent: proposed, baseHash: sha256Text(current), actor: { ...SUPERVISOR_ACTOR } },
        { policy: lawCtxOf(root).policy, currentFileState: { text: current }, ctx: { plansDir: lawCtxOf(root).plansDir, roadmapPath: lawCtxOf(root).roadmapPath, agentNames: lawCtxOf(root).agentNames, commands: lawCtxOf(root).commands, maxAuditRounds: 3, projectRoot: root, plansRoots: [], now: NOW_MS } },
      );

    const clean = gate(propose(["status: active", "failures: 0"]));
    assert.equal(clean.decision, "allow", `unlock with failures reset: ${JSON.stringify(clean.notes)}`);
    const writerObservation = clean.observations.find((o) => o.rule === "writer-identity");
    assert.ok(writerObservation, "writer-identity observed the transition");
    assert.match(writerObservation.reason ?? "", /held→active with failures reset/);

    const malformed = gate(propose(["status: active", "failures: 3"]));
    assert.equal(malformed.decision, "deny", "unlock WITHOUT the failures reset stays denied — the existing enforcement face, zero rule changes");
    assert.match(malformed.reason ?? "", /must reset failures to 0 and remove hold/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
