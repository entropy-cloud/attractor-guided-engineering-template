/**
 * supervisor-terminal.test.mjs — R1–R4 termination truth table (age-autonomy
 * M3-WI27, plan `docs/plans/age-autonomy/2026-08-26-1411-3` Phase 1 Proof;
 * runs inside the L2 plugin suite `test/*.test.mjs` → `./verify-age.sh`).
 *
 * Coverage matrix (03-supervisor §8, ≥16 cases):
 *   - four rules, positive and negative faces
 *   - order priority: an R1 hit leaves R2–R4 unevaluated (the R1→R4 order is
 *     the written contract, not an implicit sequencing)
 *   - R1 three-way: all-done → completed / unchecked → partial / active with
 *     an unexpired claim → continue (in-flight work is never killed early)
 *   - partial/blocked distinction matrix: R3 held>0 → blocked / R3 held==0 →
 *     partial / R4 → blocked / stacked factors → blocked (stronger signal) /
 *     R1 held>0 → partial (budget exhaustion is the dominant cause — the
 *     deliberate in-adjudication orientation) / compound declared value
 *     normalization (single point, inside the core)
 *   - R2/R3 boundaries: audit-rounds ≥1 vs 0; a draft present never terminals
 *   - R4 injection boundary: N-1 / N rounds; absent fact ⇒ rule skipped
 *   - maxFailures dual-source matrix: policy authoritative / mission flow
 *     fallback / both absent default 3 (resolveMaxFailures, law-policy.mjs)
 *   - idempotent re-evaluation: same snapshot ⇒ same evaluation (restart
 *     re-scan re-derives the same word — Decision 2 residual closure)
 *   - the scan wiring: a real scanned snapshot satisfies the face structurally
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveMaxFailures } from "../assets/src/law-policy.mjs";
import { discoverLawContext, fsLawGateIo } from "../src/law/host-adapter.ts";
import { scanSupervisorSnapshot } from "../src/supervisor/decision-core.ts";
import {
  evaluateTermination,
  normalizeDeclaredTerminal,
  terminalDuty,
} from "../src/supervisor/terminal-rules.ts";

const NOW_MS = Date.parse("2026-08-26T12:00:00.000Z");
const FUTURE_ISO = "2026-08-26T13:00:00.000Z";
const PAST_ISO = "2026-08-26T11:00:00.000Z";
const LIMITS = { maxAuditRounds: 3, maxFailures: 3 };

// ── hand-built snapshot faces ───────────────────────────────────────────────

function face(derived, plans = []) {
  return { derived, plans };
}

function derivedOf({
  draft = [],
  active = [],
  held = [],
  awaitingClosure = [],
  expiredClaims = [],
  unchecked = 0,
  total = 4,
  auditRounds = 1,
} = {}) {
  const open = [...draft, ...active, ...held];
  return {
    draft,
    active,
    held,
    open,
    awaitingClosure,
    expiredClaims,
    roadmapCounts: { total, checked: total - unchecked, unchecked },
    auditRounds,
  };
}

function planRecord(path, fmFields) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fmFields)) lines.push(`${k}: ${v}`);
  lines.push("---", "", "# Plan", "", "## Phase 1 — Work", "", "- [ ] only item", "");
  return { path, text: lines.join("\n") };
}

// ── R1 (budget hard gate) ───────────────────────────────────────────────────

test("R1 positive: budget exhausted, quiesced, roadmap all done, open==0 → completed", () => {
  const evaluation = evaluateTermination(face(derivedOf({ draft: [], active: [], held: [], unchecked: 0, auditRounds: 3 })), LIMITS);
  assert.equal(evaluation.decision, "completed");
  assert.equal(evaluation.rule, "R1");
  assert.ok(evaluation.reasons.every((r) => r.startsWith("R1")));
});

test("R1 three-way ②: budget exhausted, quiesced, roadmap unchecked → partial (never a silent completed)", () => {
  const evaluation = evaluateTermination(face(derivedOf({ unchecked: 2, auditRounds: 3 })), LIMITS);
  assert.equal(evaluation.decision, "partial");
  assert.equal(evaluation.rule, "R1");
});

test("R1 three-way ③: budget exhausted, active plan with an unexpired claim → continue (in-flight work runs to completion)", () => {
  const plans = [planRecord("/p/a1.md", { status: "active", claim: "attempt-run-1-ses-holder-1-ab12cd34", "claim-expires": FUTURE_ISO })];
  const evaluation = evaluateTermination(
    face(derivedOf({ active: ["/p/a1.md"], auditRounds: 3, unchecked: 1 }), plans),
    LIMITS,
  );
  assert.equal(evaluation.decision, "continue");
  assert.equal(evaluation.rule, "R1");
  assert.match(evaluation.reasons.join("; "), /unexpired claims/);
});

test("R1 pending: active plan with an EXPIRED claim is still not quiesced → continue (reclaim is the 1411-2 face)", () => {
  const plans = [planRecord("/p/a1.md", { status: "active", claim: "attempt-run-1-ses-holder-1-ab12cd34", "claim-expires": PAST_ISO })];
  const evaluation = evaluateTermination(
    face(
      derivedOf({
        active: ["/p/a1.md"],
        expiredClaims: [{ path: "/p/a1.md", claim: "attempt-run-1-ses-holder-1-ab12cd34", claimExpires: PAST_ISO }],
        auditRounds: 3,
      }),
      plans,
    ),
    LIMITS,
  );
  assert.equal(evaluation.decision, "continue");
});

test("R1 quiescence: active plans ALL in awaitingClosure satisfy the (active==0 ∨ all awaitingClosure) condition → R1 fires", () => {
  const evaluation = evaluateTermination(
    face(derivedOf({ active: ["/p/a1.md"], awaitingClosure: ["/p/a1.md"], unchecked: 1, auditRounds: 3 })),
    LIMITS,
  );
  assert.equal(evaluation.decision, "partial");
  assert.equal(evaluation.rule, "R1");
});

test("R1 boundary: audit-rounds == maxAuditRounds fires (≥ is inclusive); maxAuditRounds-1 leaves R1 unevaluated", () => {
  // isolation: an active plan with a live claim blocks R2/R3, so only the
  // R1 budget face differs between the two evaluations
  const plans = [planRecord("/p/a1.md", { status: "active", claim: "attempt-run-1-ses-holder-1-ab12cd34", "claim-expires": FUTURE_ISO })];
  const derived = derivedOf({ active: ["/p/a1.md"], unchecked: 1 });
  const atMax = evaluateTermination(face(derivedOf({ active: ["/p/a1.md"], unchecked: 1, auditRounds: 2 }), plans), { ...LIMITS, maxAuditRounds: 2 });
  assert.equal(atMax.decision, "continue");
  assert.equal(atMax.rule, "R1");
  assert.match(atMax.reasons.join("; "), /unexpired claims/);
  const below = evaluateTermination(face(derived, plans), { ...LIMITS, maxAuditRounds: 3 });
  assert.equal(below.decision, "continue");
  assert.equal(below.rule, null);
});

// ── R2 (clean early exit) ───────────────────────────────────────────────────

test("R2 positive: audit-rounds ≥1 (budget NOT exhausted), roadmap all done, open==0 → completed", () => {
  const evaluation = evaluateTermination(face(derivedOf({ unchecked: 0, auditRounds: 1 })), LIMITS);
  assert.equal(evaluation.decision, "completed");
  assert.equal(evaluation.rule, "R2");
});

test("R2 boundary: audit-rounds == 0 with all done and open==0 → continue (≥1 required)", () => {
  const evaluation = evaluateTermination(face(derivedOf({ unchecked: 0, auditRounds: 0 })), LIMITS);
  assert.equal(evaluation.decision, "continue");
  assert.equal(evaluation.rule, null);
});

// ── R3 (explicitly stuck) + the partial/blocked distinction matrix ─────────

test("R3 distinction: held>0 (executable face occupied) → blocked", () => {
  const evaluation = evaluateTermination(face(derivedOf({ held: ["/p/h1.md"], unchecked: 1, auditRounds: 1 })), LIMITS);
  assert.equal(evaluation.decision, "blocked");
  assert.equal(evaluation.rule, "R3");
});

test("R3 distinction: held==0 with unchecked roadmap → partial (pure completion gap)", () => {
  const evaluation = evaluateTermination(face(derivedOf({ unchecked: 2, auditRounds: 1 })), LIMITS);
  assert.equal(evaluation.decision, "partial");
  assert.equal(evaluation.rule, "R3");
});

test("R3 negative: a draft present keeps the loop in review — no early terminal", () => {
  const evaluation = evaluateTermination(face(derivedOf({ draft: ["/p/d1.md"], unchecked: 2, auditRounds: 1 })), LIMITS);
  assert.equal(evaluation.decision, "continue");
  assert.equal(evaluation.rule, null);
});

// ── R4 (stagnation circuit breaker, injected fact — WI30 supplies it) ───────

test("R4 positive: stagnation rounds == threshold → blocked (stagnation trumps an ongoing draft — the WI30 use case)", () => {
  const evaluation = evaluateTermination(
    face(derivedOf({ draft: ["/p/d1.md"], unchecked: 1, auditRounds: 1 })),
    { ...LIMITS, stagnation: { rounds: 3, threshold: 3 } },
  );
  assert.equal(evaluation.decision, "blocked");
  assert.equal(evaluation.rule, "R4");
});

test("R4 boundary: rounds == threshold-1 → continue; absent fact ⇒ rule skipped", () => {
  const base = derivedOf({ draft: ["/p/d1.md"], unchecked: 1, auditRounds: 1 });
  const nMinusOne = evaluateTermination(face(base), { ...LIMITS, stagnation: { rounds: 2, threshold: 3 } });
  assert.equal(nMinusOne.decision, "continue");
  assert.equal(nMinusOne.rule, null);
  const absent = evaluateTermination(face(base), LIMITS);
  assert.equal(absent.decision, "continue");
  assert.equal(absent.rule, null);
});

// ── order priority (03 §8: R1→R4 order is the contract) ────────────────────

test("order priority: R1 hit while R2/R3/R4 conditions also hold → R1 decides, R2–R4 unevaluated (completed face)", () => {
  // all done + open==0 satisfies R2's condition too; stagnation satisfies R4
  const evaluation = evaluateTermination(
    face(derivedOf({ unchecked: 0, auditRounds: 3 })),
    { ...LIMITS, stagnation: { rounds: 5, threshold: 3 } },
  );
  assert.equal(evaluation.decision, "completed");
  assert.equal(evaluation.rule, "R1");
  assert.ok(!evaluation.reasons.some((r) => r.startsWith("R2") || r.startsWith("R4")));
});

test("order priority: R1 partial dominates R3/R4-shaped facts (budget exhaustion is the first-order cause)", () => {
  // unchecked + budget exhausted: R3 would also fire on its own facts
  const evaluation = evaluateTermination(
    face(derivedOf({ unchecked: 2, auditRounds: 3 })),
    { ...LIMITS, stagnation: { rounds: 5, threshold: 3 } },
  );
  assert.equal(evaluation.decision, "partial");
  assert.equal(evaluation.rule, "R1");
});

test("distinction stack: R3 held>0 ∧ stagnation both present → blocked (the stronger signal; R3 fires first in order)", () => {
  const evaluation = evaluateTermination(
    face(derivedOf({ held: ["/p/h1.md"], unchecked: 1, auditRounds: 1 })),
    { ...LIMITS, stagnation: { rounds: 4, threshold: 3 } },
  );
  assert.equal(evaluation.decision, "blocked");
  assert.equal(evaluation.rule, "R3");
  assert.match(evaluation.reasons.join("; "), /heldPlans\(\)==1/);
});

test("distinction orientation: R1 with held>0 stays partial — budget exhaustion is the dominant cause (in-adjudication orientation)", () => {
  const evaluation = evaluateTermination(face(derivedOf({ held: ["/p/h1.md"], unchecked: 1, auditRounds: 3 })), LIMITS);
  assert.equal(evaluation.decision, "partial");
  assert.equal(evaluation.rule, "R1");
});

// ── compound declared value normalization (policy surface untouched) ────────

test("normalization: declared `partial/blocked` resolves to the core's concrete word; declared never overrides a core continue", () => {
  const blockedFace = evaluateTermination(face(derivedOf({ held: ["/p/h1.md"], unchecked: 1, auditRounds: 1 })), LIMITS);
  const normalized = normalizeDeclaredTerminal("partial/blocked", blockedFace);
  assert.equal(normalized.executes, true);
  assert.equal(normalized.word, "blocked");
  assert.match(normalized.reason, /normalized to blocked by rule R3/);

  const continuing = evaluateTermination(face(derivedOf({ draft: ["/p/d1.md"], unchecked: 1, auditRounds: 1 })), LIMITS);
  const deferred = normalizeDeclaredTerminal("partial/blocked", continuing);
  assert.equal(deferred.executes, false);
  assert.equal(deferred.word, "continue");
  assert.match(deferred.reason, /deferred/);
});

// ── the declared TerminalDuty seam (dual entry, one core) ───────────────────

test("terminalDuty: [] while continuing; one receipt-type decision on a rule hit", () => {
  const continuing = terminalDuty(
    { derived: derivedOf({ draft: ["/p/d1.md"], unchecked: 1 }), plans: [], roadmapPath: null, projectRoot: "/p", plansDir: "/p/docs/plans", roadmap: null, scannedAt: "now" },
    { maxAuditRounds: 3 },
    () => NOW_MS,
  );
  assert.equal(continuing.length, 0);

  const hit = terminalDuty(
    { derived: derivedOf({ held: ["/p/h1.md"], unchecked: 1, auditRounds: 2 }), plans: [], roadmapPath: null, projectRoot: "/p", plansDir: "/p/docs/plans", roadmap: null, scannedAt: "now" },
    { maxAuditRounds: 3 },
    () => NOW_MS,
  );
  assert.equal(hit.length, 1);
  assert.equal(hit[0].type, "receipt");
  assert.equal(hit[0].action, "terminal:blocked");
  assert.match(hit[0].reason, /R3/);
});

// ── maxFailures dual-source matrix (resolveMaxFailures, law-policy.mjs) ─────

test("resolveMaxFailures: policy authoritative / mission flow fallback / both absent default 3 / invalid falls through", () => {
  assert.equal(resolveMaxFailures({ limits: { maxFailures: 5 } }, { flow: { maxFailures: 9 } }), 5, "policy wins");
  assert.equal(resolveMaxFailures({ limits: {} }, { flow: { maxFailures: 9 } }), 9, "mission flow fallback");
  assert.equal(resolveMaxFailures({}, {}), 3, "both absent → default 3");
  assert.equal(resolveMaxFailures(null, null), 3, "null inputs → default 3");
  assert.equal(resolveMaxFailures({ limits: { maxFailures: -1 } }, { flow: { maxFailures: "x" } }), 3, "invalid values fall through to the default");
  assert.equal(resolveMaxFailures({ limits: { maxFailures: 0 } }, null), 0, "explicit zero is a legal authoritative value (deny-all breaker)");
});

// ── idempotent re-evaluation + the real-scan wiring ─────────────────────────

test("idempotence: the same snapshot twice → the same evaluation (restart re-scan re-derives the same word)", () => {
  const snapshot = face(derivedOf({ held: ["/p/h1.md"], unchecked: 1, auditRounds: 2 }));
  assert.deepEqual(evaluateTermination(snapshot, LIMITS), evaluateTermination(snapshot, LIMITS));
});

test("scan wiring: a real scanned snapshot satisfies the face structurally (fixture project)", () => {
  const root = mkdtempSync(join(tmpdir(), "supervisor-terminal-"));
  try {
    mkdirSync(join(root, "missions"), { recursive: true });
    writeFileSync(
      join(root, "missions", "autonomy.policy.yml"),
      `version: 1\nlimits:\n  maxAuditRounds: 3\n  maxFailures: 2\ngates:\n  - id: plan-structure\n    match: "{{plansDir}}/**/*.md"\n    rule: plan-structure\n    mode: enforce\n`,
      "utf8",
    );
    writeFileSync(
      join(root, "missions", "demo.json"),
      JSON.stringify({ name: "demo", roadmapPath: "docs/backlog/demo-roadmap.md", plansDir: "docs/plans/demo", commands: { test: "true" }, autonomyPolicy: "missions/autonomy.policy.yml" }),
      "utf8",
    );
    mkdirSync(join(root, "docs", "backlog"), { recursive: true });
    writeFileSync(
      join(root, "docs", "backlog", "demo-roadmap.md"),
      `---\naudit-rounds: 2\n---\n\n# Demo Roadmap\n\n## Work Item Status\n\n### M1 — Demo\n\n- [x] WI1 done\n- [ ] WI2 open\n\n## Deep Audit Record\n`,
      "utf8",
    );
    mkdirSync(join(root, "docs", "plans", "demo"), { recursive: true });
    writeFileSync(
      join(root, "docs", "plans", "demo", "held.md"),
      `---\nstatus: held\nmission: demo\nwork-item: M1-WI2\nhold: "waiting"\nfailures: 2\n---\n\n# Plan\n\n## Phase 1 — Work\n\n- [ ] only item\n`,
      "utf8",
    );
    const lawCtx = discoverLawContext(join(root, "missions"), fsLawGateIo);
    assert.notEqual(lawCtx, null);
    assert.equal(lawCtx.maxFailures, 2, "host adapter resolves maxFailures policy-authoritative");
    const snapshot = scanSupervisorSnapshot({ projectRoot: root, lawCtx, io: fsLawGateIo, clock: () => NOW_MS });
    assert.notEqual(snapshot, null);
    const evaluation = evaluateTermination(snapshot, { maxAuditRounds: lawCtx.maxAuditRounds, maxFailures: lawCtx.maxFailures });
    assert.equal(evaluation.decision, "blocked");
    assert.equal(evaluation.rule, "R3");
    assert.deepEqual(snapshot.derived.held, [join(root, "docs", "plans", "demo", "held.md").split("\\").join("/")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
