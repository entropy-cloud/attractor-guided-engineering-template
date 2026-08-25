import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, validatePlanFrontmatter } from "../src/ledger-frontmatter.mjs";
import {
  computeBasisHash,
  deriveCompleted,
  draftPlans,
  activePlans,
  heldPlans,
  closedPlans,
  openPlans,
  awaitingClosure,
} from "../src/ledger-sections.mjs";

const STEM = "2026-08-25-0635-2-m1-ledger-sections-derivation";
const AUDIT_ID = `#audit-2026-08-25-063133-mission-driver-${STEM}-1-a1b2c3d4`;

// The Verification/Closure sections are outside the basisHash domain, so the
// {{HASH}} placeholder never influences the hash it is replaced with.
function buildPlan(opts = {}) {
  const {
    status = "active",
    verifyLine = "",
    phaseItems = ["- [x] implement", "- [x] test"],
    closureFindings = "",
    drr = "- dispatch review #review-2026-08-25-063133-mission-driver-demo-1-9f8e7d6c to ses_r",
    passes = ["- pass test run-001 basisHash={{HASH}} exit=0"],
    closureDispatch = `- dispatch audit ${AUDIT_ID} to ses_a`,
    closureAccepted = `- accepted ${AUDIT_ID}：审计通过`,
  } = opts;
  const text = `---
status: ${status}
mission: age-autonomy-implementation
work-item: M1-WI3${verifyLine ? `\n${verifyLine}` : ""}
---
# Demo

## Goals

prose goal

## Phase 1

${phaseItems.join("\n")}
${closureFindings ? `\n## Closure Findings\n\n${closureFindings}\n` : ""}
## Draft Review Record

${drr}

## Verification

${passes.join("\n")}

## Closure

${[closureDispatch, closureAccepted].filter((l) => l !== null).join("\n")}
`;
  return text.replaceAll("{{HASH}}", computeBasisHash(text));
}

const COMPLETE = buildPlan();
const PATH = "docs/plans/demo.md";

describe("deriveCompleted — §5.2 truth table (five conjuncts)", () => {
  it("all five conjuncts satisfied → completed", () => {
    const r = deriveCompleted({ path: PATH, text: COMPLETE }, { defaultVerifyKeys: ["test"] });
    assert.equal(r.completed, true);
    assert.deepEqual(r.reasons, []);
    assert.equal(r.conjuncts.statusActive && r.conjuncts.allChecked && r.conjuncts.mechanicalVerification && r.conjuncts.auditReceipt && r.conjuncts.dispatchRegister, true);
  });

  it("conjunct 1 broken: status != active → not completed", () => {
    const r = deriveCompleted({ path: PATH, text: buildPlan({ status: "draft" }) }, { defaultVerifyKeys: ["test"] });
    assert.equal(r.completed, false);
    assert.ok(r.reasons.includes("status-not-active"));
  });

  it("conjunct 2 broken: unchecked Phase item → not completed", () => {
    const r = deriveCompleted(
      { path: PATH, text: buildPlan({ phaseItems: ["- [x] implement", "- [ ] test"] }) },
      { defaultVerifyKeys: ["test"] },
    );
    assert.equal(r.completed, false);
    assert.ok(r.reasons.includes("unchecked-items:1"));
    assert.equal(r.conjuncts.allChecked, false);
  });

  it("conjunct 3 broken (missing key): injected key without a pass line → missing-pass", () => {
    const r = deriveCompleted(
      { path: PATH, text: buildPlan({ passes: ["- pass test run-001 basisHash={{HASH}} exit=0"] }) },
      { defaultVerifyKeys: ["test", "build"] },
    );
    assert.equal(r.conjuncts.mechanicalVerification, false);
    assert.ok(r.reasons.includes("missing-pass:build"));
    assert.equal(r.completed, false);
  });

  it("conjunct 3 broken (stale hash): pass line whose basisHash differs from the current basis → basis-hash-mismatch", () => {
    const stale = buildPlan({ passes: ["- pass test run-001 basisHash=" + "0".repeat(64) + " exit=0"] });
    const r = deriveCompleted({ path: PATH, text: stale }, { defaultVerifyKeys: ["test"] });
    assert.equal(r.conjuncts.mechanicalVerification, false);
    assert.ok(r.reasons.includes("basis-hash-mismatch:test"));
    assert.deepEqual(r.verification.staleKeys, ["test"]);
  });

  it("conjunct 3 broken (red run): pass line with exit=1 does not satisfy the key", () => {
    const red = buildPlan({ passes: ["- pass test run-001 basisHash={{HASH}} exit=1"] });
    const r = deriveCompleted({ path: PATH, text: red }, { defaultVerifyKeys: ["test"] });
    assert.equal(r.conjuncts.mechanicalVerification, false);
    assert.ok(r.reasons.includes("missing-pass:test"));
  });

  it("conjunct 4 broken: dispatch without same-id accepted → no-audit-receipt (and feeds awaitingClosure)", () => {
    const noReceipt = buildPlan({ closureAccepted: null });
    const r = deriveCompleted({ path: PATH, text: noReceipt }, { defaultVerifyKeys: ["test"] });
    assert.equal(r.conjuncts.auditReceipt, false);
    assert.ok(r.reasons.includes("no-audit-receipt"));
    assert.deepEqual(awaitingClosure([{ path: PATH, text: noReceipt }], { defaultVerifyKeys: ["test"] }), [PATH]);
    assert.equal(r.completed, false);
  });

  it("conjunct 5 broken independently: paired dispatch+accepted whose id is lexically invalid → invalid-dispatch-register", () => {
    const badId = `#audit-2026-08-25-063133-mission-driver-${STEM}-1-a1b2c3`;
    const paired = buildPlan({
      closureDispatch: `- dispatch audit ${badId} to ses_a`,
      closureAccepted: `- accepted ${badId}：审计通过`,
    });
    const r = deriveCompleted({ path: PATH, text: paired }, { defaultVerifyKeys: ["test"] });
    assert.equal(r.conjuncts.auditReceipt, true);
    assert.equal(r.conjuncts.dispatchRegister, false);
    assert.ok(r.reasons.includes("invalid-dispatch-register"));
    assert.equal(r.completed, false);
  });
});

describe("deriveCompleted — verify keys resolution", () => {
  it("verify absent and no defaultVerifyKeys injected → explicit no-verify-keys failure", () => {
    const r = deriveCompleted({ path: PATH, text: COMPLETE });
    assert.equal(r.conjuncts.mechanicalVerification, false);
    assert.ok(r.reasons.includes("no-verify-keys"));
    assert.equal(r.completed, false);
  });

  it("verify absent + injected defaultVerifyKeys: every injected key needs a pass line", () => {
    const both = buildPlan({
      passes: [
        "- pass test run-001 basisHash={{HASH}} exit=0",
        "- pass build run-001 basisHash={{HASH}} exit=0",
      ],
    });
    assert.equal(deriveCompleted({ path: PATH, text: both }, { defaultVerifyKeys: ["test", "build"] }).completed, true);
  });

  it("explicit plan verify overrides the injected default set", () => {
    const onlyTest = buildPlan({ verifyLine: "verify: [test]" });
    const r = deriveCompleted({ path: PATH, text: onlyTest }, { defaultVerifyKeys: ["test", "build"] });
    assert.deepEqual(r.verification.keys, ["test"]);
    assert.equal(r.completed, true);
  });
});

// M2-WI44 vacuous-pass block (deep-audit R2): `verify: []` used to make the
// mechanical-verification conjunct vacuously TRUE (empty keys → missingKeys=[]
// → zero pass lines needed). Two defense layers: the validator rejects the
// empty array (ledger-frontmatter face), and deriveCompleted treats an
// explicit empty set as no-verify-keys — fail-closed, never falling back to
// injected defaults, covering inputs that never saw the validator (external
// writes, old files, callers bypassing the read seam).
describe("deriveCompleted — M2-WI44 verify:[] vacuous-pass block", () => {
  const FULL_RECEIPTS_EMPTY_VERIFY = buildPlan({ verifyLine: "verify: []" });

  it("verify:[] + full receipts → validator rejects AND derivation stays incomplete (no-verify-keys)", () => {
    const fm = parseFrontmatter(FULL_RECEIPTS_EMPTY_VERIFY).fm;
    const v = validatePlanFrontmatter(fm);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes('"verify" must be a non-empty array')));
    const r = deriveCompleted({ path: PATH, text: FULL_RECEIPTS_EMPTY_VERIFY });
    assert.equal(r.completed, false);
    assert.equal(r.conjuncts.mechanicalVerification, false);
    assert.ok(r.reasons.includes("no-verify-keys"));
  });

  it("verify:[] fed straight into deriveCompleted (validator bypassed) → still completed:false", () => {
    const r = deriveCompleted({ path: PATH, text: FULL_RECEIPTS_EMPTY_VERIFY });
    assert.equal(r.completed, false);
    assert.ok(r.reasons.includes("no-verify-keys"));
    assert.equal(r.verification.keys, undefined);
  });

  it("verify:[] takes precedence over injected defaultVerifyKeys — fail-closed, no fallback", () => {
    const r = deriveCompleted({ path: PATH, text: FULL_RECEIPTS_EMPTY_VERIFY }, { defaultVerifyKeys: ["test"] });
    assert.equal(r.verification.keys, undefined);
    assert.equal(r.conjuncts.mechanicalVerification, false);
    assert.ok(r.reasons.includes("no-verify-keys"));
    assert.ok(!r.reasons.includes("missing-pass:test"));
    assert.equal(r.completed, false);
  });

  it("green path unharmed: verify: [test] with receipts still completes", () => {
    const r = deriveCompleted({ path: PATH, text: buildPlan({ verifyLine: "verify: [test]" }) });
    assert.equal(r.conjuncts.mechanicalVerification, true);
    assert.equal(r.completed, true);
  });
});

describe("deriveCompleted — derived status never rewrites frontmatter", () => {
  it("completed is derived while status stays the writable 'active'", () => {
    const r = deriveCompleted({ path: PATH, text: COMPLETE }, { defaultVerifyKeys: ["test"] });
    assert.equal(r.completed, true);
    assert.equal(r.status, "active");
    assert.ok(COMPLETE.includes("status: active"));
  });
});

describe("computeBasisHash — normalization and stability", () => {
  it("is invariant under trailing-whitespace noise and CRLF rewrites", () => {
    const noisier = COMPLETE.replace("- [x] implement", "- [x] implement   ").replace(/\n/g, "\r\n");
    assert.equal(computeBasisHash(noisier), computeBasisHash(COMPLETE));
  });

  it("changes when counting-domain content changes (tick or added phase line)", () => {
    const ticked = buildPlan({ phaseItems: ["- [x] implement", "- [x] test"] });
    const unticked = buildPlan({ phaseItems: ["- [x] implement", "- [ ] test"] });
    assert.notEqual(computeBasisHash(ticked), computeBasisHash(unticked));
    const withLine = COMPLETE.replace("- [x] implement", "- [x] implement\n- [x] extra phase item");
    assert.notEqual(computeBasisHash(withLine), computeBasisHash(COMPLETE));
  });

  it("ignores prose edits outside the domain (Goals section, Verification pass lines)", () => {
    const editedProse = COMPLETE.replace("prose goal", "edited prose goal 2");
    assert.equal(computeBasisHash(editedProse), computeBasisHash(COMPLETE));
    const editedPass = COMPLETE.replace("run-001", "run-002");
    assert.equal(computeBasisHash(editedPass), computeBasisHash(COMPLETE));
  });
});

describe("scan predicates — mutual exclusion and derived states", () => {
  const records = [
    { path: "draft.md", text: buildPlan({ status: "draft" }) },
    { path: "active-open.md", text: buildPlan({ phaseItems: ["- [x] a", "- [ ] b"] }) },
    { path: "awaiting.md", text: buildPlan({ closureAccepted: null }) },
    { path: "done.md", text: COMPLETE },
    { path: "held.md", text: `---\nstatus: held\nmission: m\nwork-item: WI1\nhold: "blocked"\n---\n# t\n\n## Phase 1\n\n- [x] a\n` },
    { path: "cancelled.md", text: buildPlan({ status: "cancelled" }) },
    { path: "legacy.md", text: "# old format\n\n> Plan Status: completed\n" },
  ];
  const opts = { defaultVerifyKeys: ["test"] };

  it("draftPlans: draft only; legacy (no frontmatter) is out of the predicate domain", () => {
    assert.deepEqual(draftPlans(records), ["draft.md"]);
  });

  it("activePlans excludes the derived-completed plan but keeps open and awaiting plans", () => {
    assert.deepEqual(activePlans(records, opts), ["active-open.md", "awaiting.md"]);
  });

  it("heldPlans: held only", () => {
    assert.deepEqual(heldPlans(records), ["held.md"]);
  });

  it("closedPlans = derived completed ∨ writable terminal statuses", () => {
    assert.deepEqual(closedPlans(records, opts), ["done.md", "cancelled.md"]);
  });

  it("openPlans = draft ∪ active ∪ held", () => {
    assert.deepEqual(openPlans(records, opts), ["draft.md", "active-open.md", "awaiting.md", "held.md"]);
  });

  it("awaitingClosure hits the all-checked/no-receipt middle state and misses the completed one", () => {
    assert.deepEqual(awaitingClosure(records, opts), ["awaiting.md"]);
    const r = deriveCompleted({ path: "done.md", text: COMPLETE }, opts);
    assert.equal(r.conjuncts.allChecked && !r.conjuncts.auditReceipt, false);
  });
});
