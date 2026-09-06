import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validatePlansLedger } from "../src/flow-loader.js";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Bug 2026-09-06-research-orm-plans-invisible (nop-app-iot iot-research):
// DRAFT_PLANS wrote `work-item: 设备管理域 ORM` (unquoted multi-word value) into
// 10 plans. The ledger subset parser rejected every file, planLedgerState
// returned status null, and the plans vanished from draftPlans()/activePlans()
// — REVIEW_PLANS/EXEC_PLANS empty-looped to a false "completed". The
// validate-plans script step is the loud structural gate: it must FAIL the flow
// (→ DRAFT_PLANS) and leave a fix-list report whenever any plan frontmatter is
// parser-rejected or field-set invalid, and PASS only when every ledger parses.

const VALID_PLAN = `---
status: draft
mission: m1
work-item: "多词 域 ORM"
group: "2026-09-06-1400"
verify: [test]
---

# Plan
`;

const MALFORMED_PLAN = `---
status: draft
mission: m1
work-item: 多词 域 ORM
group: "2026-09-06-1400"
verify: [test]
---

# Plan
`;

const EMPTY_VERIFY_PLAN = VALID_PLAN.replace("verify: [test]", "verify: []");

function makeProject(planFiles) {
  const root = mkdtempSync(join(tmpdir(), "md-validate-plans-"));
  const plansDir = join(root, "docs", "plans");
  mkdirSync(plansDir, { recursive: true });
  for (const [name, content] of Object.entries(planFiles)) {
    writeFileSync(join(plansDir, name), content, "utf8");
  }
  return root;
}

function delegatesFor(root) {
  return {
    config: {
      projectRoot: root,
      mission: { plansDir: "docs/plans", commands: { test: "mvn test" } },
    },
  };
}

describe("validate-plans ledger gate (bug 2026-09-06-research-orm-plans-invisible)", () => {
  it("passes when all plan ledgers parse cleanly", async () => {
    const root = makeProject({ "2026-09-06-1400-1-a.md": VALID_PLAN });
    try {
      const r = await validatePlansLedger(delegatesFor(root));
      assert.equal(r.marker, "pass");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails on parser-rejected frontmatter (unquoted multi-word value) and writes the report", async () => {
    const root = makeProject({ "2026-09-06-1400-1-a.md": MALFORMED_PLAN });
    try {
      const r = await validatePlansLedger(delegatesFor(root));
      assert.equal(r.marker, "fail");
      assert.match(r.text, /2026-09-06-1400-1-a\.md/);
      assert.match(r.text, /frontmatter rejected/);
      const report = readFileSync(join(root, "_tmp", "mission-driver-plan-validation.md"), "utf8");
      assert.match(report, /2026-09-06-1400-1-a\.md/);
      assert.match(report, /quote multi-word values/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails on field-set violations (verify: [] vacuous pass)", async () => {
    const root = makeProject({ "2026-09-06-1400-1-a.md": EMPTY_VERIFY_PLAN });
    try {
      const r = await validatePlansLedger(delegatesFor(root));
      assert.equal(r.marker, "fail");
      assert.match(r.text, /verify/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("tolerates non-plan markdown and 00- guides (only frontmatter plans are gated)", async () => {
    const root = makeProject({
      "00-plan-guide.md": "# guide with `> Plan Status: draft` inside a fence — not a plan\n",
      "notes.md": "# free-form notes, no frontmatter\n",
    });
    try {
      const r = await validatePlansLedger(delegatesFor(root));
      assert.equal(r.marker, "pass");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes when plansDir is missing (zero-intrusion)", async () => {
    const root = mkdtempSync(join(tmpdir(), "md-validate-empty-"));
    try {
      const r = await validatePlansLedger(delegatesFor(root));
      assert.equal(r.marker, "pass");
      assert.equal(existsSync(join(root, "_tmp", "mission-driver-plan-validation.md")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
