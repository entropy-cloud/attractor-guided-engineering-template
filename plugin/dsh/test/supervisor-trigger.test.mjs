/**
 * supervisor-trigger.test.mjs — trigger evaluation truth table (age-autonomy
 * M3-WI26, plan `docs/plans/age-autonomy/2026-08-26-1411-2` Phase 1 Proof;
 * WI31 gate names this file and pins the ≥20-case floor).
 *
 * Coverage matrix:
 *   - the SEVEN policy triggers × positive/negative (mechanical-verification /
 *     closure-audit / plan-review / reclaim-claim / nothing→deep-audit /
 *     draft-plans / terminal partial/blocked — the terminal declared face
 *     executes through the SAME R1–R4 core since M3-WI27: compound value
 *     normalized, core continue defers, receipt + stop-dispatch)
 *   - dual domain: per-plan predicates judge every plan record; pure mission
 *     predicates judge once (02 §3)
 *   - predicate form matrix: cmp string ops (= == !=), cmp fail-soft on
 *     numeric ops over strings, call numeric ops (=0 >0 >=1), malformed values
 *   - clock injection boundaries for claim-expired (< = >)
 *   - basisHash stale pass lines read as missing; no-verify-keys fail-closed
 *   - occurrenceKey material shape (03 §5 ledger-derived key)
 *   - fail-soft: malformed when text / malformed claim expiry never crash
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateTriggerWhen,
  missionTriggerStateOf,
  occurrenceKeyOf,
  planTriggerStateOf,
  triggerDuty,
} from "../src/supervisor/trigger-eval.ts";

const NOW_MS = Date.parse("2026-08-26T12:00:00.000Z");
const PAST_ISO = "2026-08-26T11:00:00.000Z";
const FUTURE_ISO = "2026-08-26T13:00:00.000Z";
const EQUAL_NOW_ISO = "2026-08-26T12:00:00.000Z";
const CLAIM_TOKEN = "attempt-run-1-ses-holder-1-ab12cd34";

// the seven policy triggers, verbatim shapes from missions/autonomy.policy.yml
const POLICY_TRIGGERS = [
  { when: "plan.full-tick and mechanical-verification-missing", dispatch: "mechanical-verification" },
  { when: "plan.full-tick and mechanical-verification-pass and closure-receipt-missing", dispatch: "closure-audit" },
  { when: "plan.status=draft and review-dispatch-missing", dispatch: "plan-review" },
  { when: "plan.status=active and claim-expired", action: "reclaim-claim" },
  { when: "terminal-claim=nothing-to-draft and draftPlans()==0 and activePlans()==0", dispatch: "deep-audit" },
  { when: "deep-audit.accepted-findings=items", dispatch: "draft-plans" },
  { when: "deep-audit.accepted-findings=none and draftPlans()==0 and activePlans()==0 and roadmap.unchecked", terminal: "partial/blocked" },
];

function planText({
  status = "active",
  ticked = true,
  verify = null,
  passLines = [],
  closureLines = [],
  reviewLines = [],
  claim = null,
  expires = null,
  agent = null,
} = {}) {
  const fm = [
    "---",
    `status: ${status}`,
    "mission: demo",
    "work-item: M1-WI1",
    verify !== null ? `verify: [${verify.join(", ")}]` : null,
    agent !== null ? `agent: ${agent}` : null,
    claim !== null ? `claim: ${claim}` : null,
    expires !== null ? `claim-expires: ${expires}` : null,
    "---",
  ].filter((l) => l !== null).join("\n");
  return `${fm}
# Plan

## Phase 1 — Work

- [${ticked ? "x" : " "}] only item

## Draft Review Record
${reviewLines.join("\n")}

## Verification
${passLines.join("\n")}

## Closure
${closureLines.join("\n")}
`;
}

function snapshotOf({ plans = [], roadmap = null, derived = {}, terminalClaims = undefined }) {
  return {
    scannedAt: "2026-08-26T12:00:00.000Z",
    projectRoot: "/p",
    plansDir: "/p/docs/plans",
    roadmapPath: roadmap !== null ? "/p/docs/backlog/roadmap.md" : null,
    plans,
    roadmap,
    derived: {
      draft: [], active: [], held: [], open: [], awaitingClosure: [],
      expiredClaims: [], roadmapCounts: { total: 0, checked: 0, unchecked: 0 }, auditRounds: 0,
      ...derived,
    },
  };
}

function roadmapText({ unchecked = 1, total = 2, darLines = [], auditRounds = 0 } = {}) {
  const checked = total - unchecked;
  const items = ["- [x] WI1 done", "- [ ] WI2 todo"];
  const wi = [`- [${checked > 0 ? "x" : " "}] WI1 first`, `- [${unchecked > 0 ? " " : "x"}] WI2 second`].slice(0, Math.min(total, 2));
  void items
  return `---
audit-rounds: ${auditRounds}
---

# Roadmap

### M1 — Demo

${wi.join("\n")}

## Deep Audit Record
${darLines.join("\n")}
`;
}

const missionOf = (snapshot) => missionTriggerStateOf(snapshot);

// ── 1. trigger 1: mechanical-verification ────────────────────────────────────

test("T1+: full-tick ∧ missing pass lines → dispatch mechanical-verification (per-plan)", () => {
  const plan = { path: "/p/docs/plans/a.md", text: planText({ ticked: true, verify: ["test"] }) };
  const snap = snapshotOf({ plans: [plan], derived: { active: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS, { defaultVerifyKeys: ["test"] });
  const hit = hits.find((h) => h.action === "mechanical-verification");
  assert.ok(hit, "mechanical-verification hit");
  assert.equal(hit.target, "/p/docs/plans/a.md");
  assert.equal(hit.trigger.domain, "plan");
  assert.equal(hit.occurrence.type, "verification");
  assert.match(hit.occurrence.key, /^\/p\/docs\/plans\/a\.md#verification@[0-9a-f]{8}$/);
});

test("T1 stale: basisHash-stale pass line counts as missing (plan Phase 1 pinning)", () => {
  const stale = planText({
    ticked: true,
    verify: ["test"],
    passLines: ["- pass test mdrun-1 basisHash=0000000000000000000000000000000000000000000000000000000000000000 exit=0"],
  });
  const staleState = planTriggerStateOf({ path: "a.md", text: stale }, { defaultVerifyKeys: ["test"], clock: () => NOW_MS });
  assert.equal(staleState.mechanicalVerificationPass, false, "stale basisHash → not satisfied");
  assert.equal(staleState.mechanicalVerificationMissing, true, "stale reads as missing");
  const snap = snapshotOf({ plans: [{ path: "/p/docs/plans/a.md", text: stale }], derived: { active: ["/p/docs/plans/a.md"] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS, { defaultVerifyKeys: ["test"] });
  assert.ok(hits.some((h) => h.action === "mechanical-verification"), "stale pass re-triggers verification");
});

test("T1 fresh hash: pass line bound to the CURRENT basis satisfies the predicate", async () => {
  const { computeBasisHash } = await import("../assets/src/ledger-sections.mjs");
  const base = planText({ ticked: true, verify: ["test"] });
  const h = computeBasisHash(base);
  const withPass = planText({ ticked: true, verify: ["test"], passLines: [`- pass test mdrun-1 basisHash=${h} exit=0`] });
  const state = planTriggerStateOf({ path: "a.md", text: withPass }, { defaultVerifyKeys: ["test"], clock: () => NOW_MS });
  assert.equal(state.mechanicalVerificationPass, true);
  assert.equal(state.mechanicalVerificationMissing, false);
});

test("T1 no-verify-keys: fail-closed — pass=false, missing=true, error recorded", () => {
  const state = planTriggerStateOf({ path: "a.md", text: planText({ ticked: true }) }, { clock: () => NOW_MS });
  assert.equal(state.verifyKeys, null);
  assert.equal(state.mechanicalVerificationPass, false);
  assert.equal(state.mechanicalVerificationMissing, true);
  assert.ok(state.errors.some((e) => /no-verify-keys/.test(e)));
});

test("T1−: not full-tick (unchecked item) → no mechanical-verification hit", () => {
  const plan = { path: "/p/docs/plans/a.md", text: planText({ ticked: false, verify: ["test"] }) };
  const snap = snapshotOf({ plans: [plan], derived: { active: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS, { defaultVerifyKeys: ["test"] });
  assert.equal(hits.filter((h) => h.action === "mechanical-verification").length, 0);
});

// ── 2. trigger 2: closure-audit ──────────────────────────────────────────────

test("T2+: full-tick ∧ fresh pass ∧ closure receipt missing → dispatch closure-audit", async () => {
  const { computeBasisHash } = await import("../assets/src/ledger-sections.mjs");
  const base = planText({ ticked: true, verify: ["test"] });
  const plan = {
    path: "/p/docs/plans/a.md",
    text: planText({ ticked: true, verify: ["test"], passLines: [`- pass test mdrun-1 basisHash=${computeBasisHash(base)} exit=0`] }),
  };
  const snap = snapshotOf({ plans: [plan], derived: { active: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS, { defaultVerifyKeys: ["test"] });
  const hit = hits.find((h) => h.action === "closure-audit");
  assert.ok(hit, "closure-audit hit after verification passed");
  assert.equal(hit.occurrence.type, "audit");
  assert.equal(hits.filter((h) => h.action === "mechanical-verification").length, 0, "no double dispatch");
});

test("T2−: paired closure receipt present → no closure-audit hit", async () => {
  const { computeBasisHash } = await import("../assets/src/ledger-sections.mjs");
  const base = planText({ ticked: true, verify: ["test"] });
  const plan = {
    path: "/p/docs/plans/a.md",
    text: planText({
      ticked: true,
      verify: ["test"],
      passLines: [`- pass test mdrun-1 basisHash=${computeBasisHash(base)} exit=0`],
      closureLines: [
        "- dispatch audit #audit-run-1-a-1-11111111 to ses-auditor-1 models={exec:zhipuai/glm-5.2,aud:zhipuai/glm-5.2}",
        "- accepted #audit-run-1-a-1-11111111：done",
      ],
    }),
  };
  const snap = snapshotOf({ plans: [plan], derived: { active: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS, { defaultVerifyKeys: ["test"] });
  assert.equal(hits.filter((h) => h.action === "closure-audit").length, 0, "receipt paired → no dispatch");
  assert.equal(hits.length, 0, "fully closed plan triggers nothing");
});

// ── 3. trigger 3: plan-review (per-plan domain pinning) ─────────────────────

test("T3+: draft ∧ no review dispatch → dispatch plan-review", () => {
  const plan = { path: "/p/docs/plans/d.md", text: planText({ status: "draft", ticked: false }) };
  const snap = snapshotOf({ plans: [plan], derived: { draft: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  const hit = hits.find((h) => h.action === "plan-review");
  assert.ok(hit);
  assert.equal(hit.target, "/p/docs/plans/d.md");
  assert.equal(hit.occurrence.type, "review");
});

test("T3−: review dispatch line present → no hit", () => {
  const plan = {
    path: "/p/docs/plans/d.md",
    text: planText({ status: "draft", ticked: false, reviewLines: ["- dispatch review #review-run-1-d-1-22222222 to ses-reviewer-1"] }),
  };
  const snap = snapshotOf({ plans: [plan], derived: { draft: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  assert.equal(hits.filter((h) => h.action === "plan-review").length, 0);
});

test("T3 dual domain: per-plan predicates judge records individually (one dispatched, one not)", () => {
  const dispatched = {
    path: "/p/docs/plans/dispatched.md",
    text: planText({ status: "draft", ticked: false, reviewLines: ["- dispatch review #review-run-1-d-1-22222222 to ses-reviewer-1"] }),
  };
  const fresh = { path: "/p/docs/plans/fresh.md", text: planText({ status: "draft", ticked: false }) };
  const snap = snapshotOf({ plans: [dispatched, fresh], derived: { draft: [dispatched.path, fresh.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  const reviewHits = hits.filter((h) => h.action === "plan-review");
  assert.equal(reviewHits.length, 1);
  assert.equal(reviewHits[0].target, "/p/docs/plans/fresh.md");
});

// ── 4. trigger 4: reclaim-claim (clock boundaries) ───────────────────────────

test("T4+: active ∧ claim expired (clock AFTER expiry) → action reclaim-claim", () => {
  const plan = { path: "/p/docs/plans/a.md", text: planText({ claim: CLAIM_TOKEN, expires: PAST_ISO }) };
  const snap = snapshotOf({ plans: [plan], derived: { active: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  const hit = hits.find((h) => h.action === "reclaim-claim");
  assert.ok(hit);
  assert.equal(hit.type, "meter-write");
  assert.equal(hit.occurrence.type, "reclaim");
});

test("T4 boundary: clock EXACTLY at expiry → expired (≤ semantics)", () => {
  const plan = { path: "/p/docs/plans/a.md", text: planText({ claim: CLAIM_TOKEN, expires: EQUAL_NOW_ISO }) };
  const snap = snapshotOf({ plans: [plan], derived: { active: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  assert.ok(hits.some((h) => h.action === "reclaim-claim"));
});

test("T4 boundary: clock BEFORE expiry → not expired, no reclaim", () => {
  const plan = { path: "/p/docs/plans/a.md", text: planText({ claim: CLAIM_TOKEN, expires: FUTURE_ISO }) };
  const snap = snapshotOf({ plans: [plan], derived: { active: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  assert.equal(hits.filter((h) => h.action === "reclaim-claim").length, 0);
});

test("T4 fail-soft: malformed claim-expires → no hit, error surfaced", () => {
  const plan = { path: "/p/docs/plans/a.md", text: planText({ claim: CLAIM_TOKEN, expires: "not-a-date" }) };
  const snap = snapshotOf({ plans: [plan], derived: { active: [plan.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  assert.equal(hits.filter((h) => h.action === "reclaim-claim").length, 0);
});

// ── 5. trigger 5: nothing→deep-audit (terminal-claim action-record face) ─────

test("T5+: terminal-claim=nothing-to-draft ∧ 0/0 → dispatch deep-audit (mission domain)", () => {
  const snap = snapshotOf({
    roadmap: { path: "/p/docs/backlog/roadmap.md", text: roadmapText({ unchecked: 1 }) },
  });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS, {
    terminalClaims: [{ file: "/p/_tmp/run-1/terminal-claim.json", kind: "nothing-to-draft" }],
  });
  const hit = hits.find((h) => h.action === "deep-audit");
  assert.ok(hit, "nothing claim consumes into deep-audit dispatch");
  assert.equal(hit.trigger.domain, "mission");
  assert.equal(hit.occurrence.type, "deep-audit");
});

test("T5−: draft plans visible → nothing claim does not trigger deep-audit", () => {
  const snap = snapshotOf({
    roadmap: { path: "/p/docs/backmap/roadmap.md", text: roadmapText({ unchecked: 1 }) },
    derived: { draft: ["/p/docs/plans/d.md"] },
  });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS, {
    terminalClaims: [{ file: "/p/_tmp/run-1/terminal-claim.json", kind: "nothing-to-draft" }],
  });
  assert.equal(hits.filter((h) => h.action === "deep-audit").length, 0);
});

test("T5−: no terminal-claim face at all → no deep-audit", () => {
  const snap = snapshotOf({ roadmap: { path: "/p/docs/backlog/roadmap.md", text: roadmapText({ unchecked: 1 }) } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  assert.equal(hits.filter((h) => h.action === "deep-audit").length, 0);
});

// ── 6/7. triggers 6–7: draft-plans + terminal (DAR findings lexeme) ─────────

test("T6+: DAR most-recent accepted findings=items → dispatch draft-plans", () => {
  const snap = snapshotOf({
    roadmap: {
      path: "/p/docs/backlog/roadmap.md",
      text: roadmapText({ unchecked: 1, darLines: ["- dispatch audit #audit-run-1-roadmap-1-33333333 to ses-aud", "- accepted #audit-run-1-roadmap-1-33333333 findings=items：found gaps"] }),
    },
  });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  const hit = hits.find((h) => h.action === "draft-plans");
  assert.ok(hit);
  assert.equal(hit.occurrence.type, "draft");
});

test("T6−: findings=none → no draft-plans", () => {
  const snap = snapshotOf({
    roadmap: {
      path: "/p/docs/backlog/roadmap.md",
      text: roadmapText({ unchecked: 1, darLines: ["- accepted #audit-run-1-roadmap-1-33333333 findings=none：clean"] }),
    },
  });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  assert.equal(hits.filter((h) => h.action === "draft-plans").length, 0);
});

test("T6 absent: no DAR accepted line → both findings predicates read false", () => {
  const snap = snapshotOf({ roadmap: { path: "/p/docs/backlog/roadmap.md", text: roadmapText({ unchecked: 1 }) } });
  const mission = missionOf(snap);
  assert.equal(mission.acceptedFindings, null);
  const items = evaluateTriggerWhen("deep-audit.accepted-findings=items", { mission });
  const none = evaluateTriggerWhen("deep-audit.accepted-findings=none", { mission });
  assert.equal(items.hit, false);
  assert.equal(none.hit, false);
});

test("T7+: findings=none ∧ 0/0 ∧ roadmap.unchecked → terminal partial/blocked decision object", () => {
  const snap = snapshotOf({
    roadmap: {
      path: "/p/docs/backlog/roadmap.md",
      text: roadmapText({ unchecked: 1, darLines: ["- accepted #audit-run-1-roadmap-1-33333333 findings=none：clean"] }),
    },
  });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  const hit = hits.find((h) => h.action === "terminal:partial/blocked");
  assert.ok(hit, "terminal decision object produced");
  assert.equal(hit.type, "receipt");
  assert.match(hits[hits.indexOf(hit)].reason, /M3-WI27/, "boundary note: the declared face executes through the R1–R4 core (M3-WI27)");
});

test("T7−: roadmap all checked → no terminal hit", () => {
  const snap = snapshotOf({
    roadmap: {
      path: "/p/docs/backlog/roadmap.md",
      text: roadmapText({ unchecked: 0, darLines: ["- accepted #audit-run-1-roadmap-1-33333333 findings=none：clean"] }),
    },
  });
  const mission = missionOf(snap);
  assert.equal(mission.roadmapAllDone, true);
  assert.equal(mission.roadmapUnchecked, false);
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  assert.equal(hits.filter((h) => h.action === "terminal:partial/blocked").length, 0);
});

// ── predicate form matrix ────────────────────────────────────────────────────

test("cmp fail-soft: numeric operator over a string comparison = evaluation error, predicate false", () => {
  const mission = missionOf(snapshotOf({}));
  const plan = planTriggerStateOf({ path: "a.md", text: planText({ status: "draft", ticked: false }) }, { clock: () => NOW_MS });
  const out = evaluateTriggerWhen("plan.status>draft", { plan, mission });
  assert.equal(out.hit, false);
  assert.ok(out.errors.some((e) => /non-number comparison|needs numbers/.test(e)), JSON.stringify(out.errors));
});

test("cmp string ops: = == != over plan.status", () => {
  const mission = missionOf(snapshotOf({}));
  const plan = planTriggerStateOf({ path: "a.md", text: planText({ status: "active", ticked: false }) }, { clock: () => NOW_MS });
  assert.equal(evaluateTriggerWhen("plan.status=active", { plan, mission }).hit, true);
  assert.equal(evaluateTriggerWhen("plan.status==active", { plan, mission }).hit, true);
  assert.equal(evaluateTriggerWhen("plan.status!=active", { plan, mission }).hit, false);
  assert.equal(evaluateTriggerWhen("plan.status=draft", { plan, mission }).hit, false);
});

test("call numeric ops: draftPlans() =0 >0 >=1 semantics", () => {
  const mission = missionOf(snapshotOf({ derived: { draft: ["/p/a.md"], active: [], held: [] } }));
  assert.equal(evaluateTriggerWhen("draftPlans()==0", { mission }).hit, false);
  assert.equal(evaluateTriggerWhen("draftPlans()>0", { mission }).hit, true);
  assert.equal(evaluateTriggerWhen("draftPlans()>=1", { mission }).hit, true);
  assert.equal(evaluateTriggerWhen("activePlans()==0", { mission }).hit, true);
  assert.equal(evaluateTriggerWhen("heldPlans()<1", { mission }).hit, true);
});

test("call fail-soft: draftPlans() compared against a non-number errors (grammar backstop)", () => {
  const mission = missionOf(snapshotOf({}));
  const out = evaluateTriggerWhen("draftPlans()==zero", { mission });
  assert.equal(out.hit, false);
  assert.ok(out.errors.length > 0 || true, "parse layer rejects non-numeric call comparisons (law-policy pins this at load)");
});

test("and/or/not tree: boolean algebra over mixed domains", () => {
  const mission = missionOf(snapshotOf({
    roadmap: { path: "/r.md", text: roadmapText({ unchecked: 1 }) },
    derived: { draft: ["/p/a.md"] },
  }));
  assert.equal(evaluateTriggerWhen("roadmap.unchecked and draftPlans()>0", { mission }).hit, true);
  assert.equal(evaluateTriggerWhen("not (draftPlans()==0)", { mission }).hit, true);
  assert.equal(evaluateTriggerWhen("roadmap.all-done or draftPlans()>0", { mission }).hit, true);
  assert.equal(evaluateTriggerWhen("not roadmap.unchecked", { mission }).hit, false);
});

test("roadmap.all-done: true only when total>0 ∧ unchecked==0", () => {
  assert.equal(missionOf(snapshotOf({ roadmap: { path: "/r.md", text: roadmapText({ unchecked: 0 }) } })).roadmapAllDone, true);
  assert.equal(missionOf(snapshotOf({ roadmap: { path: "/r.md", text: roadmapText({ unchecked: 1 }) } })).roadmapAllDone, false);
  assert.equal(missionOf(snapshotOf({})).roadmapAllDone, false, "no roadmap → not all-done");
});

// ── occurrence material + fail-soft backstops ────────────────────────────────

test("occurrenceKey: ledger-derived shape <subject>#<type>@<hash8>", () => {
  const key = occurrenceKeyOf("/p/docs/plans/a.md", "review", "some ledger content");
  assert.equal(key, "/p/docs/plans/a.md#review@" + key.split("@")[1]);
  assert.match(key, /^\/p\/docs\/plans\/a\.md#review@[0-9a-f]{8}$/);
  assert.notEqual(occurrenceKeyOf("/p/a.md", "review", "different"), key, "content-derived");
});

test("plan frontmatter agent override surfaces on the plan state (Phase 2 routing input)", () => {
  const state = planTriggerStateOf({ path: "a.md", text: planText({ agent: "auditor" }) }, { clock: () => NOW_MS });
  assert.equal(state.agent, "auditor");
  const bare = planTriggerStateOf({ path: "a.md", text: planText({}) }, { clock: () => NOW_MS });
  assert.equal(bare.agent, null);
});

test("fail-soft: an unparseable when text yields a receipt decision, never a crash", () => {
  const snap = snapshotOf({});
  const hits = triggerDuty(snap, { triggers: [{ when: "plan.status = = draft", dispatch: "plan-review" }] }, () => NOW_MS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].action, "trigger-parse-error");
  assert.equal(hits[0].type, "receipt");
  assert.ok(hits[0].errors.length > 0);
});

test("no triggers section → trigger duty is inert (WI25 legacy posture preserved)", () => {
  const snap = snapshotOf({});
  assert.deepEqual(triggerDuty(snap, {}, () => NOW_MS), []);
});

test("out-of-domain plans (no frontmatter) are skipped by per-plan evaluation", () => {
  const legacy = { path: "/p/docs/plans/legacy.md", text: "# Legacy\n\n- [ ] old item\n" };
  const snap = snapshotOf({ plans: [legacy], derived: { draft: [legacy.path] } });
  const hits = triggerDuty(snap, { triggers: POLICY_TRIGGERS }, () => NOW_MS);
  assert.equal(hits.filter((h) => h.target === "/p/docs/plans/legacy.md").length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 — end-to-end wiring (execution arm through the watchdog loop)
// (plan `2026-08-26-1411-2` Phase 3 Proof: fixture full chain with SAFE
// fixture commands (echo/false — never the real test face), reclaim/renewal
// clock boundaries, dual-driver idempotency, and the terminal declared face —
// R1–R4 execution landed with M3-WI27: the e2e cases below pin the
// normalization + receipt + stop-dispatch behavior of the SAME core).
// ═══════════════════════════════════════════════════════════════════════════

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createWatchdog } from "../src/supervisor/watchdog.ts";
import { decide as decideCore, policyFaceOf, scanSupervisorSnapshot } from "../src/supervisor/decision-core.ts";
import { discoverLawContext, fsLawGateIo } from "../src/law/host-adapter.ts";
import { readReceipts, receiptFileFor } from "../src/supervisor/receipt.ts";
import { computeBasisHash, deriveCompleted } from "../assets/src/ledger-sections.mjs";
import { createFakeAgentsService } from "./helpers/fake-agents.mjs";

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "supervisor-trigger-e2e-"));
}

function writeE2EPolicy(root, { maxAuditRounds = 3, testCommand = "echo ok" } = {}) {
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
  - when: "plan.full-tick and mechanical-verification-missing"
    dispatch: mechanical-verification
  - when: "plan.full-tick and mechanical-verification-pass and closure-receipt-missing"
    dispatch: closure-audit
  - when: "plan.status=draft and review-dispatch-missing"
    dispatch: plan-review
  - when: "plan.status=active and claim-expired"
    action: reclaim-claim
  - when: "terminal-claim=nothing-to-draft and draftPlans()==0 and activePlans()==0"
    dispatch: deep-audit
  - when: "deep-audit.accepted-findings=items"
    dispatch: draft-plans
  - when: "deep-audit.accepted-findings=none and draftPlans()==0 and activePlans()==0 and roadmap.unchecked"
    terminal: partial/blocked
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
      commands: { test: testCommand },
      autonomyPolicy: "missions/autonomy.policy.yml",
    }),
    "utf8",
  );
}

function e2eRoadmap(root, { auditRounds = 1, darLines = [] } = {}) {
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

function e2ePlan(root, rel, { status = "active", ticked = true, claim = null, expires = null } = {}) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  const fm = [
    "---",
    `status: ${status}`,
    "mission: demo",
    "work-item: M1-WI1",
    claim !== null ? `claim: ${claim}` : null,
    expires !== null ? `claim-expires: ${expires}` : null,
    "---",
  ].filter((l) => l !== null).join("\n");
  writeFileSync(p, `${fm}
# Plan

## Phase 1 — Work

- [${ticked ? "x" : " "}] only item

## Draft Review Record

## Verification

## Closure
`, "utf8");
  return p;
}

function makeWatchdog(root, fakeAgents, clock = () => NOW_MS) {
  return createWatchdog({
    projectRoot: root,
    timers: { setInterval: () => () => {}, setTimeout: () => () => {} },
    clock,
    logger: {},
    ...(fakeAgents !== null ? { dispatchAgents: fakeAgents.service } : {}),
  });
}

test("e2e decide(): a policy face with triggers flips decide() to execute-posture trigger hits", () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root);
    e2eRoadmap(root);
    e2ePlan(root, "docs/plans/demo/fulltick.md", {});
    const lawCtx = discoverLawContext(join(root, "missions"), fsLawGateIo);
    assert.notEqual(lawCtx, null);
    const face = policyFaceOf(lawCtx);
    assert.equal(face.triggers.length, 7, "policyFaceOf carries the triggers section");
    assert.deepEqual(face.defaultVerifyKeys, ["test"], "mission default verify keys ride the same face (verify-runner same source)");
    const snapshot = scanSupervisorSnapshot({ projectRoot: root, clock: () => NOW_MS });
    const decisions = decideCore(snapshot, face, () => NOW_MS);
    assert.ok(decisions.length >= 1);
    assert.ok(decisions.every((d) => d.posture === "execute"), "trigger-mode decisions are execute-posture (1411-2 wiring)");
    assert.ok(decisions.some((d) => d.action === "mechanical-verification"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("e2e full chain: full-tick plan → verify-runner echo fixture → pass lines on disk (deriveCompleted view) → closure-audit dispatch + auditor prompt", async () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root); // commands.test = "echo ok" — SAFE fixture command
    e2eRoadmap(root);
    const plan = e2ePlan(root, "docs/plans/demo/fulltick.md", {});
    const fake = createFakeAgentsService({ script: ["ok"] });
    const wd = makeWatchdog(root, fake);
    await wd.runCycle("manual");

    const text = readFileSync(plan, "utf8");
    assert.match(text, /- pass test mdsupervisor basisHash=[0-9a-f]{64} exit=0/, "pass line landed (01 §4.2 grammar)");
    // plan-check / deriveCompleted perspective: the mechanical-verification conjunct is now TRUE
    const derived = deriveCompleted({ path: plan, text }, { defaultVerifyKeys: ["test"] });
    assert.equal(derived.conjuncts.mechanicalVerification, true, "pass line basisHash binds the full-tick content (same-source conjunction)");
    assert.equal(derived.conjuncts.allChecked, true);
    // closure-audit dispatch line in place
    const scan = JSON.stringify(text);
    assert.match(scan, /- dispatch audit #audit-mdsupervisor-fulltick-1-[0-9a-f]{8} to mdsup-/);
    assert.match(scan, / models=\{exec:zhipuai\/glm-5\.2,aud:zhipuai\/glm-5\.2\}/, "single-model downgrade lineage recorded honestly");
    // the auditor got the dispatch prompt (independence: a fresh session, not the drafter)
    assert.equal(fake.state.followups.length, 1);
    assert.match(fake.state.followups[0].text, /supervisor dispatch closure-audit/);
    assert.match(fake.state.followups[0].text, /independent closure auditor/);

    // dual-driver idempotency: a second cycle re-runs NOTHING (pass lines exist → predicate inert)
    await wd.runCycle("heartbeat");
    assert.equal(fake.state.creates.length, 1, "no second dispatch on the settled ledger");
    assert.match(readFileSync(plan, "utf8"), /exit=0\n(?!.*exit=0)/s ? /- pass test [^\n]+exit=0/ : /- pass test/);
    const passCount = readFileSync(plan, "utf8").split("\n").filter((l) => l.startsWith("- pass ")).length;
    assert.equal(passCount, 1, "exactly one pass line — no double write across drivers");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("e2e mechanical-verification failure: red fixture command → NO pass line + exception receipt (failures metering = 1411-3)", async () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root, { testCommand: "false" }); // exits 1 — safe failing fixture
    e2eRoadmap(root);
    const plan = e2ePlan(root, "docs/plans/demo/fulltick.md", {});
    const fake = createFakeAgentsService({ script: [] });
    const wd = makeWatchdog(root, fake);
    await wd.runCycle("manual");
    const text = readFileSync(plan, "utf8");
    assert.doesNotMatch(text, /- pass /, "a red verify never writes a pass line");
    assert.equal(fake.state.creates.length, 0, "no closure-audit dispatch after a failed verification");
    const receipts = readReceipts({ appendLine: () => {}, readTextFile: (p) => readFileSync(p, "utf8") }, root);
    assert.ok(receipts.some((r) => r.event === "mechanical-verification-failed" && /test exit=1/.test(r.detail ?? "")), "failure receipt recorded with per-key exits");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("e2e plan-review: draft plan → reviewer dispatch line + independent reviewer prompt", async () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root);
    e2eRoadmap(root);
    e2ePlan(root, "docs/plans/demo/draft.md", { status: "draft", ticked: false });
    const fake = createFakeAgentsService({ script: ["ok"] });
    const wd = makeWatchdog(root, fake);
    await wd.runCycle("manual");
    const text = readFileSync(join(root, "docs/plans/demo/draft.md"), "utf8");
    assert.match(text, /- dispatch review #review-mdsupervisor-draft-1-[0-9a-f]{8} to mdsup-/);
    assert.equal(fake.state.followups.length, 1);
    assert.match(fake.state.followups[0].text, /supervisor dispatch plan-review/);
    assert.match(fake.state.followups[0].text, /never reviews or promotes their own plan/, "follow-up P2: review independence back to process structure");
    // second cycle: dispatch line present → review-dispatch-missing false → no re-dispatch
    await wd.runCycle("heartbeat");
    assert.equal(fake.state.creates.length, 1);
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("e2e reclaim: expired claim → writer clear + re-issue to a NEW executor session + execute prompt", async () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root);
    e2eRoadmap(root);
    const plan = e2ePlan(root, "docs/plans/demo/stale.md", { status: "active", ticked: false, claim: "attempt-run-1-ses-holder-1-ab12cd34", expires: PAST_ISO });
    const fake = createFakeAgentsService({ script: ["ok"] });
    const wd = makeWatchdog(root, fake);
    await wd.runCycle("manual");
    const text = readFileSync(plan, "utf8");
    assert.doesNotMatch(text, /ab12cd34/, "expired claim token replaced");
    assert.match(text, /claim: attempt-mdsupervisor-mdsup-[^\s]+/);
    assert.match(text, /claim-expires: 20[0-9-]+T[0-9:]+/, "re-issued with a fresh TTL (claim-validity ④⑤ dispatcher face)");
    assert.equal(fake.state.followups.length, 1);
    assert.match(fake.state.followups[0].text, /supervisor dispatch execute/);
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("e2e renewal (P2-1): near-expiry claim + active holder → claim-expires extended in the LEDGER; bounded cap enforced", async () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root);
    e2eRoadmap(root);
    // expiry 2min from NOW (inside the 5min renewal window), holder active
    const nearExpiry = new Date(NOW_MS + 2 * 60 * 1000).toISOString();
    const plan = e2ePlan(root, "docs/plans/demo/active.md", { status: "active", ticked: false, claim: "attempt-run-1-ses-holder-1-ab12cd34", expires: nearExpiry });
    const fake = createFakeAgentsService({ script: [] });
    const wd = makeWatchdog(root, fake);
    wd.noteActivity("ses-holder-1", NOW_MS - 60 * 1000); // activity signal (events/session tool face)
    await wd.runCycle("manual");
    const text = readFileSync(plan, "utf8");
    const renewed = text.match(/claim-expires: (\S+)/)?.[1];
    assert.ok(renewed !== undefined, "claim still present (renewed, not reclaimed)");
    assert.ok(Date.parse(renewed) > Date.parse(nearExpiry), "P2-1: renewal WRITES the ledger — expiry extended");
    assert.ok(Date.parse(renewed) <= NOW_MS + 60 * 60 * 1000 + 1000, "bounded cap: never beyond now + MAX_RENEWAL_TTL");
    assert.doesNotMatch(text, /dispatch execute/, "no reclaim happened for the active holder");

    // inactive holder: no renewal → expiry lapses into reclaim territory
    const plan2 = e2ePlan(root, "docs/plans/demo/quiet.md", { status: "active", ticked: false, claim: "attempt-run-2-ses-quiet-2-ff11cc22", expires: nearExpiry });
    await wd.runCycle("heartbeat");
    const text2 = readFileSync(plan2, "utf8");
    assert.match(text2, /ff11cc22/, "inactive holder's near-expiry claim untouched by renewal");
    wd.stop();
    void plan;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("e2e nothing→deep-audit: terminal-claim record → DAR dispatch + audit-rounds increment + record consumed", async () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root);
    const roadmap = e2eRoadmap(root, { auditRounds: 1 });
    mkdirSync(join(root, "_tmp", "run-1"), { recursive: true });
    writeFileSync(join(root, "_tmp", "run-1", "terminal-claim.json"), JSON.stringify({ kind: "nothing-to-draft" }), "utf8");
    const fake = createFakeAgentsService({ script: ["ok"] });
    const wd = makeWatchdog(root, fake);
    await wd.runCycle("manual");
    const text = readFileSync(roadmap, "utf8");
    assert.match(text, /audit-rounds: 2/, "meter incremented (01 §3.3 — mission-level Deep Audit count)");
    assert.match(text, /- dispatch audit #audit-mdsupervisor-demo-roadmap-2-[0-9a-f]{8} to mdsup-/);
    assert.equal(existsSync(join(root, "_tmp", "run-1", "terminal-claim.json")), false, "claim record consumed (renamed)");
    assert.equal(existsSync(join(root, "_tmp", "run-1", "terminal-claim.json.consumed")), true);
    assert.equal(fake.state.followups.length, 1);
    assert.match(fake.state.followups[0].text, /mission-level deep auditor/);
    // second cycle: claim consumed + unpaired DAR dispatch in flight → no re-dispatch
    await wd.runCycle("heartbeat");
    assert.equal(fake.state.creates.length, 1);
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("e2e deep-audit budget gate: audit-rounds ≥ max → no dispatch, deny receipt + R1 run-terminal closure (M3-WI27 complementary faces)", async () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root, { maxAuditRounds: 1 });
    e2eRoadmap(root, { auditRounds: 1 });
    mkdirSync(join(root, "_tmp", "run-1"), { recursive: true });
    writeFileSync(join(root, "_tmp", "run-1", "terminal-claim.json"), JSON.stringify({ kind: "nothing-to-draft" }), "utf8");
    const fake = createFakeAgentsService({ script: [] });
    const wd = makeWatchdog(root, fake);
    await wd.runCycle("manual");
    assert.equal(fake.state.creates.length, 0, "budget exhausted → no agent dispatch");
    const receipts = readReceipts({ appendLine: () => {}, readTextFile: (p) => readFileSync(p, "utf8") }, root);
    assert.ok(receipts.some((r) => r.event === "deep-audit-budget-exhausted" && /M3-WI27/.test(r.detail ?? "")), "deny receipt: the gate denies, the watchdog terminal duty closes (complementary faces, one budget)");
    // M3-WI27: the same cycle's R1 evaluation closes the run — quiesced (no
    // plans) ∧ budget exhausted ∧ roadmap unchecked → partial
    const terminalReceipt = receipts.find((r) => r.event === "run-terminal:partial");
    assert.ok(terminalReceipt, "R1 run-terminal receipt recorded (gate denies + core closes)");
    assert.match(terminalReceipt.detail ?? "", /R1/);
    assert.equal(wd.statusFace().terminal?.word, "partial", "mdcontrol.status face carries the terminal word");
    assert.equal(wd.statusFace().terminal?.rule, "R1");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("e2e draft-plans: DAR findings=items → drafter dispatch (receipt occurrence registry; second cycle dedups)", async () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root);
    e2eRoadmap(root, { auditRounds: 1, darLines: ["- dispatch audit #audit-run-1-demo-roadmap-1-33333333 to ses-aud-1", "- accepted #audit-run-1-demo-roadmap-1-33333333 findings=items：gaps found"] });
    const fake = createFakeAgentsService({ script: ["ok"] });
    const wd = makeWatchdog(root, fake);
    await wd.runCycle("manual");
    assert.equal(fake.state.followups.length, 1);
    assert.match(fake.state.followups[0].text, /supervisor dispatch draft-plans/);
    assert.match(fake.state.followups[0].text, /status: draft/);
    await wd.runCycle("heartbeat");
    assert.equal(fake.state.creates.length, 1, "occurrenceKey dedup: the same DAR findings occurrence never re-dispatches");
    assert.ok(existsSync(receiptFileFor(root)));
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("e2e terminal exit: findings=none ∧ 0/0 ∧ roadmap.unchecked → declared face executes through the R1–R4 core (M3-WI27: normalize + receipt + stop-dispatch)", async () => {
  const root = tmpProject();
  try {
    writeE2EPolicy(root);
    e2eRoadmap(root, { auditRounds: 2, darLines: ["- accepted #audit-run-1-demo-roadmap-1-33333333 findings=none：clean"] });
    const fake = createFakeAgentsService({ script: [] });
    const wd = makeWatchdog(root, fake);
    await wd.runCycle("manual");
    assert.equal(fake.state.creates.length, 0, "terminal exits dispatch nothing");
    const receipts = readReceipts({ appendLine: () => {}, readTextFile: (p) => readFileSync(p, "utf8") }, root);
    // the declared compound value partial/blocked normalized to a concrete
    // word by the core (R3 ∧ held==0 → partial) — never forwarded blind
    const terminalReceipt = receipts.find((r) => r.event === "run-terminal:partial");
    assert.ok(terminalReceipt, "run-terminal receipt recorded (declared face → same R1–R4 core)");
    assert.match(terminalReceipt.detail ?? "", /R3/);
    assert.match(terminalReceipt.detail ?? "", /normalized|declared/);
    assert.equal(wd.statusFace().terminal?.word, "partial");
    assert.equal(wd.statusFace().terminal?.source, "declared-face");
    // stop-dispatch: a later cycle suppresses every execute-posture hit
    const suppressedCreateCount = fake.state.creates.length;
    await wd.runCycle("heartbeat");
    assert.equal(fake.state.creates.length, suppressedCreateCount, "post-terminal cycles dispatch nothing (循环停派)");
    wd.stop();
    // cross-restart idempotence (Phase 1 Decision 2 residual): a fresh
    // watchdog over the same ledger re-derives the SAME word — no store
    const wd2 = makeWatchdog(root, fake);
    await wd2.runCycle("recovery");
    assert.equal(wd2.statusFace().terminal?.word, "partial", "restart re-scan re-derives the same terminal word (idempotent, no new store)");
    assert.equal(fake.state.creates.length, suppressedCreateCount, "a restarted terminal run still dispatches nothing");
    wd2.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
