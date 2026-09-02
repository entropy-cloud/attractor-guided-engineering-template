// M2-WI41 regression net (plan 2026-08-25-0925-1, bug
// docs/bugs/2026-08-25-ledger-plan-closure-deadlock.md D2): closureScriptCheck
// must be receipt-aware — a frontmatter plan whose counting domain is fully
// ticked may only pass to BUILD_VERIFY when the 01 §5.2 completion formula
// (deriveCompleted) holds; otherwise it fails into CLOSURE_AUDIT (the only
// ## Closure receipt writer) carrying each derivation reason.
// Phase 2 additionally pins the engine read-path defaultVerifyKeys injection
// (01 §4.1 "verify missing → mission default" = ["test"]).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { SCRIPT_REGISTRY, createExpressionFunctions } from "../src/flow-loader.js";
import { inspectPlan, missionDefaultVerifyKeys } from "../src/plan-check.mjs";
import { planLedgerState } from "../src/ledger-dualread.mjs";
import { computeBasisHash, closedPlans } from "../src/ledger-sections.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_CHECK_CLI = join(TOOL_ROOT, "src", "plan-check.mjs");

const STEM = "2026-08-25-0925-1-m2-wi41-closure-routing-deadlock";
const AUDIT_ID = `#audit-2026-08-25-205251-mission-driver-${STEM}-1-a1b2c3d4`;
const REVIEW_ID = `#review-2026-08-25-205251-mission-driver-${STEM}-1-9f8e7d6c`;

// The Verification/Closure sections sit outside the basisHash domain, so the
// {{HASH}} placeholder never influences the hash it is replaced with.
function buildFixture(opts = {}) {
  const {
    status = "active",
    verifyLine = "verify: [test]",
    phaseItems = ["- [x] implement", "- [x] verify"],
    closureFindings = "",
    passes = [],
    closureDispatch = `- dispatch audit ${AUDIT_ID} to ses_a`,
    closureAccepted = `- accepted ${AUDIT_ID}：审计通过`,
  } = opts;
  const text = `---
status: ${status}
mission: age-autonomy-implementation
work-item: M2-WI41${verifyLine ? `\n${verifyLine}` : ""}
---
# Fixture

## Phase 1

${phaseItems.join("\n")}
${closureFindings ? `\n## Closure Findings\n\n${closureFindings}\n` : ""}
## Draft Review Record

- dispatch review ${REVIEW_ID} to ses_r

## Verification

${passes.length ? passes.join("\n") : ""}

## Closure

${[closureDispatch, closureAccepted].filter((l) => l !== null).join("\n")}
`;
  return text.replaceAll("{{HASH}}", computeBasisHash(text));
}

function tmpPlan(name, content) {
  const dir = mkdtempSync(join(tmpdir(), "wi41-routing-"));
  const file = join(dir, name);
  writeFileSync(file, content, "utf8");
  return { dir, file };
}

function runClosureCheck(file, { projectRoot, mission } = {}) {
  const flowVars = new Map([["PLAN_FILE", file]]);
  return SCRIPT_REGISTRY["closure-script-check"](
    { config: { projectRoot, mission } },
    flowVars,
  );
}

describe("M2-WI41 Phase 1 — closureScriptCheck receipt-aware routing (three states)", () => {
  it("① all-ticked, no receipt, no pass line → fail routing to CLOSURE_AUDIT with both reasons", async () => {
    const { file, dir } = tmpPlan("state1.md", buildFixture({ closureDispatch: null, closureAccepted: null }));
    try {
      const r = await runClosureCheck(file);
      assert.equal(r.marker, "fail");
      assert.ok(r.text.includes("no-audit-receipt"), `text: ${r.text}`);
      assert.ok(r.text.includes("missing-pass:test"), `text: ${r.text}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("② + paired dispatch/accepted receipt → still fail (missing-pass:test only)", async () => {
    const { file, dir } = tmpPlan("state2.md", buildFixture({ passes: [] }));
    try {
      const r = await runClosureCheck(file);
      assert.equal(r.marker, "fail");
      assert.ok(r.text.includes("missing-pass:test"));
      assert.ok(!r.text.includes("no-audit-receipt"), `receipt satisfied: ${r.text}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("① fail text and SCRIPT_CHECK_DETAILS carry the derivation reasons itemized", async () => {
    const { file, dir } = tmpPlan("details.md", buildFixture({ closureDispatch: null, closureAccepted: null }));
    try {
      const flowVars = new Map([["PLAN_FILE", file]]);
      const r = await SCRIPT_REGISTRY["closure-script-check"]({ config: {} }, flowVars);
      assert.equal(r.marker, "fail");
      assert.equal(flowVars.get("SCRIPT_CHECK_RESULT"), "FAIL");
      const details = flowVars.get("SCRIPT_CHECK_DETAILS");
      assert.ok(details.includes("missing-pass:test"), `details: ${details}`);
      assert.ok(details.includes("no-audit-receipt"), `details: ${details}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("③ + successful pass line → pass (formula satisfied, routes to BUILD_VERIFY)", async () => {
    const text = buildFixture({ passes: ["- pass test run-001 basisHash={{HASH}} exit=0"] });
    const { file, dir } = tmpPlan("state3.md", text);
    try {
      assert.equal(planLedgerState(text).completed, true);
      const r = await runClosureCheck(file);
      assert.equal(r.marker, "pass");
      assert.match(r.text, /PASSED/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("④ rework: Closure Findings item added and ticked after ③ retains successful verification", async () => {
    const step3 = buildFixture({ passes: ["- pass test run-001 basisHash={{HASH}} exit=0"] });
    const staleHash = computeBasisHash(step3);
    const step4 = buildFixture({
      closureFindings: "- [x] address closure-audit rework finding",
      passes: [`- pass test run-001 basisHash=${staleHash} exit=0`],
    });
    const { file, dir } = tmpPlan("state4.md", step4);
    try {
      assert.equal(planLedgerState(step4).completed, true);
      const r = await runClosureCheck(file);
      assert.equal(r.marker, "pass");
      assert.ok(!r.text.includes("no-audit-receipt"), `receipt still paired: ${r.text}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("⑤ legacy plans keep the receipt-blind behavior byte-identical", async () => {
    const legacyCompleted = `# legacy done

> Plan Status: completed

### Phase 1 - x

Status: completed

Exit Criteria:

- [x] done

## Closure

Status Note: done

Closure Audit Evidence:

- All unit tests pass
`;
    const legacyActive = `# legacy active

> Plan Status: active

### Phase 1 - x

Exit Criteria:

- [x] done
`;
    const a = tmpPlan("legacy-a.md", legacyCompleted);
    const b = tmpPlan("legacy-b.md", legacyActive);
    try {
      const ra = await runClosureCheck(a.file);
      assert.equal(ra.marker, "pass", `legacy completed + evidence: ${ra.text}`);
      const rb = await runClosureCheck(b.file);
      assert.equal(rb.marker, "pass", `legacy active all-ticked stays receipt-blind: ${rb.text}`);
    } finally {
      rmSync(a.dir, { recursive: true, force: true });
      rmSync(b.dir, { recursive: true, force: true });
    }
  });

  it("inspectPlan exposes the additive derived view (frontmatter only)", () => {
    const fm = buildFixture({ closureDispatch: null, closureAccepted: null });
    const { file, dir } = tmpPlan("view.md", fm);
    try {
      const r = inspectPlan(file, { defaultVerifyKeys: undefined });
      assert.equal(r.format, "frontmatter");
      assert.equal(r.derivedCompleted, false);
      assert.ok(r.completionReasons.includes("missing-pass:test"));
      assert.ok(r.completionReasons.includes("no-audit-receipt"));
      assert.deepEqual(r.verifyKeys, ["test"]);
      assert.equal(r.verifyKeysSource, "frontmatter");
      // existing fields keep their semantics
      assert.equal(r.totalUnchecked, 0);
      assert.equal(r.planStatus, "active");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("⑥ live corpus 0635-3: routing mirrors the derived state (D2 release, both directions)", async () => {
    const live = join(
      REPO_ROOT, "docs", "plans", "age-autonomy",
      "2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md",
    );
    const text = readFileSync(live, "utf8");
    const state = planLedgerState(text);
    assert.equal(state.format, "frontmatter");
    assert.ok(state.derived.conjuncts.allChecked, "0635-3 is the all-ticked D2 victim corpus");
    const r = await runClosureCheck(live, { projectRoot: REPO_ROOT });
    // Before recovery: fail into CLOSURE_AUDIT (deadlock broken). After the
    // engine re-run lands receipts + pass lines: pass. Either way the routing
    // decision must track deriveCompleted — never a silent pass.
    assert.equal(r.marker, state.completed ? "pass" : "fail");
    if (!state.completed) {
      for (const reason of state.derived.reasons) {
        assert.ok(r.text.includes(reason), `fail text must carry "${reason}": ${r.text}`);
      }
      if (!state.derived.conjuncts.auditReceipt) {
        assert.ok(r.text.includes("no-audit-receipt"));
      }
      if (!state.derived.conjuncts.mechanicalVerification) {
        assert.match(r.text, /missing-pass:test|basis-hash-mismatch:test|no-verify-keys/);
      }
    }
  });
});

describe("M2-WI41 Phase 2 — defaultVerifyKeys engine read-path injection", () => {
  const COMPLETE_NO_VERIFY = buildFixture({
    verifyLine: "",
    passes: ["- pass test run-001 basisHash={{HASH}} exit=0"],
  });

  it("missionDefaultVerifyKeys: ['test'] iff commands.test is a non-empty command", () => {
    assert.deepEqual(missionDefaultVerifyKeys({ commands: { test: "pnpm test" } }), ["test"]);
    assert.equal(missionDefaultVerifyKeys({ commands: {} }), null);
    assert.equal(missionDefaultVerifyKeys({ commands: { test: "   " } }), null);
    assert.equal(missionDefaultVerifyKeys({}), null);
    assert.equal(missionDefaultVerifyKeys(null), null);
  });

  it("omitted verify + full evidence: with injection the closure check passes (verify-omission deadlock killed)", async () => {
    assert.equal(planLedgerState(COMPLETE_NO_VERIFY).completed, false, "no injection → cannot derive completed");
    assert.equal(
      planLedgerState(COMPLETE_NO_VERIFY, { defaultVerifyKeys: ["test"] }).completed,
      true,
    );
    const { file, dir } = tmpPlan("inj-complete.md", COMPLETE_NO_VERIFY);
    try {
      const r = await runClosureCheck(file, { mission: { commands: { test: "pnpm test" } } });
      assert.equal(r.marker, "pass", `text: ${r.text}`);
      const view = inspectPlan(file, { defaultVerifyKeys: ["test"] });
      assert.equal(view.derivedCompleted, true);
      assert.equal(view.verifyKeysSource, "mission-default");
      assert.deepEqual(view.verifyKeys, ["test"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("omitted verify + mission without commands.test → degenerates to no injection (no-verify-keys pinned)", async () => {
    const { file, dir } = tmpPlan("noinj.md", COMPLETE_NO_VERIFY);
    try {
      const r = await runClosureCheck(file, { mission: {} });
      assert.equal(r.marker, "fail");
      assert.ok(r.text.includes("no-verify-keys"), `text: ${r.text}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("predicate face: activePlans drops the derived-completed omitted-verify plan only when the default exists", () => {
    const root = mkdtempSync(join(tmpdir(), "wi41-pred-"));
    try {
      mkdirSync(join(root, "plans"), { recursive: true });
      writeFileSync(join(root, "plans", "a-complete.md"), COMPLETE_NO_VERIFY);
      writeFileSync(
        join(root, "plans", "b-open.md"),
        buildFixture({ verifyLine: "", phaseItems: ["- [x] i", "- [ ] todo"] }),
      );
      const withDefault = createExpressionFunctions({
        projectRoot: root,
        mission: { plansDir: "plans", commands: { test: "pnpm test" } },
      });
      assert.deepEqual(withDefault.activePlans().map((f) => basename(f)), ["b-open.md"]);
      assert.deepEqual(withDefault.draftPlans(), []);
      const without = createExpressionFunctions({
        projectRoot: root,
        mission: { plansDir: "plans" },
      });
      assert.deepEqual(without.activePlans().map((f) => basename(f)), ["a-complete.md", "b-open.md"]);
      const records = [
        { path: "a", text: readFileSync(join(root, "plans", "a-complete.md"), "utf8") },
        { path: "b", text: readFileSync(join(root, "plans", "b-open.md"), "utf8") },
      ];
      assert.deepEqual(closedPlans(records, { defaultVerifyKeys: ["test"] }), ["a"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("queue predicates detect frontmatter and legacy plans without cross-format leakage", () => {
    const root = mkdtempSync(join(tmpdir(), "ledger-dual-read-"));
    const previousMode = process.env.MISSION_DRIVER_LEDGER;
    try {
      delete process.env.MISSION_DRIVER_LEDGER;
      const plans = join(root, "plans");
      const nested = join(plans, "nested");
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(plans, "legacy-draft.md"), "# old\n\n> Plan Status: draft\n");
      writeFileSync(join(plans, "legacy-active.md"), "# old\n\n> Plan Status: active\n");
      writeFileSync(join(plans, "frontmatter-draft.md"), buildFixture({ status: "draft" }));
      writeFileSync(join(nested, "frontmatter-active.md"), buildFixture({ phaseItems: ["- [ ] work"] }));
      writeFileSync(join(nested, "frontmatter-completed.md"), COMPLETE_NO_VERIFY);
      writeFileSync(join(nested, "frontmatter-terminal.md"), buildFixture({ status: "deferred" }));
      writeFileSync(join(nested, "00-guide.md"), "# guide\n");

      const fns = createExpressionFunctions({
        projectRoot: root,
        mission: { plansDir: "plans", commands: { test: "pnpm test" } },
      });
      assert.deepEqual(
        fns.draftPlans().map((f) => basename(f)).sort(),
        ["frontmatter-draft.md", "legacy-draft.md"],
      );
      assert.deepEqual(
        fns.activePlans().map((f) => basename(f)).sort(),
        ["frontmatter-active.md", "legacy-active.md"],
      );
    } finally {
      if (previousMode === undefined) delete process.env.MISSION_DRIVER_LEDGER;
      else process.env.MISSION_DRIVER_LEDGER = previousMode;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not fall back to legacy parsing when an opened frontmatter block is malformed", () => {
    const malformed = "---\nstatus: active\nmission: m\nwork-item: WI1\n";
    const missingStatus = "---\nmission: m\nwork-item: WI1\n---\n> Plan Status: active\n";
    const indentedMalformed = " ---\nstatus: active\nmission: m\nwork-item: WI1\n> Plan Status: active\n";
    for (const text of [malformed, missingStatus, indentedMalformed]) {
      const state = planLedgerState(text);
      assert.equal(state.format, "frontmatter");
      assert.equal(state.normalized, null);
      assert.ok(state.rejected, "frontmatter problem must be surfaced instead of legacy fallback");
    }
    const indentedValid = " ---\nstatus: active\nmission: m\nwork-item: WI1\n---\n";
    assert.equal(planLedgerState(indentedValid).format, "frontmatter");
    assert.equal(planLedgerState(indentedValid).normalized, "active");
  });

  it("CLI: the owning mission's commands.test is injected as mission-default verify keys", () => {
    const root = mkdtempSync(join(tmpdir(), "wi41-cli-"));
    try {
      mkdirSync(join(root, "missions"), { recursive: true });
      mkdirSync(join(root, "plans"), { recursive: true });
      writeFileSync(join(root, "rm.md"), "# rm\n");
      writeFileSync(
        join(root, "missions", "t.json"),
        JSON.stringify({ name: "t", roadmapPath: "rm.md", plansDir: "plans", commands: { test: "echo ok" } }),
      );
      const planFile = join(root, "plans", "no-verify.md");
      writeFileSync(planFile, COMPLETE_NO_VERIFY);
      const res = spawnSync(process.execPath, [PLAN_CHECK_CLI, planFile], { encoding: "utf8", timeout: 15000 });
      const out = JSON.parse(res.stdout);
      assert.equal(res.status, 0, `stderr: ${res.stderr}`);
      assert.equal(out.passed, true);
      assert.deepEqual(out.verifyKeys, ["test"]);
      assert.equal(out.verifyKeysSource, "mission-default");
      assert.equal(out.derivedCompleted, true);
      assert.deepEqual(out.completionReasons, []);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
