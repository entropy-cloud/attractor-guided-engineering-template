// Dual-read wiring tests (age-autonomy M1-WI7, plan 0635-3 Phase 3):
// env breaker MISSION_DRIVER_LEDGER × {frontmatter, legacy, none} plan files,
// legacy completed ⇒ closed, and roadmap checkbox-priority/suffix-fallback.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readPlanStatus, planLedgerState, ledgerReadMode, PLAN_STATUS_RE } from "../src/ledger-dualread.mjs";
import { parseRoadmapMarkdown, roadmapAllDone } from "../src/roadmap-check.mjs";
import { inspectPlan } from "../src/plan-check.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const FM_PLAN = `---
status: active
mission: demo-mission
work-item: M1-WI1
group: "2026-08-25-0635"
verify: [test]
---

# A frontmatter plan

## Phase 1 — build

- [x] task one
- [ ] task two

## Verification

- pass test run-1 basisHash=0000000000000000000000000000000000000000000000000000000000000000 exit=0

## Closure

- dispatch audit #audit-run-1-2026-08-25-0635-3-demo-plan-1-1a2b3c4d to ses_auditor_1
- accepted #audit-run-1-2026-08-25-0635-3-demo-plan-1-1a2b3c4d：ok
`;

const LEGACY_PLAN = `# A legacy plan

> Plan Status: completed
> Last Reviewed: 2026-06-19

### Phase 1 - done

Status: completed

- [x] task one

## Closure

Status Note: done

Closure Audit Evidence:

- tests green
`;

const GUIDE_LIKE = `# Plan Authoring Guide

Template fenced example:

\`\`\`md
> Plan Status: draft
- [ ] example item
\`\`\`

Prose only.
`;

const LEGACY_ACTIVE = `# x

> Plan Status: active

### Phase 1 - x

- [ ] work
`;

const origEnv = process.env.MISSION_DRIVER_LEDGER;

describe("ledgerReadMode", () => {
  afterEach(() => {
    if (origEnv === undefined) delete process.env.MISSION_DRIVER_LEDGER;
    else process.env.MISSION_DRIVER_LEDGER = origEnv;
  });

  it("defaults to auto when unset/blank", () => {
    delete process.env.MISSION_DRIVER_LEDGER;
    assert.equal(ledgerReadMode(), "auto");
    process.env.MISSION_DRIVER_LEDGER = "  ";
    assert.equal(ledgerReadMode(), "auto");
  });

  it("accepts the three sanctioned values (case-insensitive)", () => {
    for (const [raw, want] of [["auto", "auto"], ["LEGACY", "legacy"], ["Frontmatter", "frontmatter"]]) {
      process.env.MISSION_DRIVER_LEDGER = raw;
      assert.equal(ledgerReadMode(), want);
    }
  });

  it("throws on an invalid value (typo must fail loud, not silently auto)", () => {
    process.env.MISSION_DRIVER_LEDGER = "fronmatter";
    assert.throws(() => ledgerReadMode(), /MISSION_DRIVER_LEDGER/);
  });
});

describe("readPlanStatus — auto mode three branches", () => {
  beforeEach(() => { process.env.MISSION_DRIVER_LEDGER = "auto"; });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.MISSION_DRIVER_LEDGER;
    else process.env.MISSION_DRIVER_LEDGER = origEnv;
  });

  it("frontmatter plan wins (status from fm, not any prose line)", () => {
    const r = readPlanStatus(FM_PLAN);
    assert.equal(r.format, "frontmatter");
    assert.equal(r.status, "active");
  });

  it("legacy plan falls back to the > Plan Status: line", () => {
    const r = readPlanStatus(LEGACY_PLAN);
    assert.equal(r.format, "legacy");
    assert.equal(r.status, "completed");
  });

  it("guide-like file with only fenced template examples is not a plan", () => {
    const r = readPlanStatus(GUIDE_LIKE);
    assert.equal(r.format, "none");
    assert.equal(r.status, null);
    assert.equal(r.rejected, null);
  });

  it("PLAN_STATUS_RE tolerates bold and case variants", () => {
    assert.equal("**Plan Status** In Progress".match(PLAN_STATUS_RE), null); // no colon → no match
    const m = "> **Plan Status**: In Progress".match(PLAN_STATUS_RE);
    assert.equal(m[1].trim(), "In Progress");
  });
});

describe("readPlanStatus — legacy rollback channel", () => {
  beforeEach(() => { process.env.MISSION_DRIVER_LEDGER = "legacy"; });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.MISSION_DRIVER_LEDGER;
    else process.env.MISSION_DRIVER_LEDGER = origEnv;
  });

  it("legacy plan still reads via the legacy line", () => {
    const r = readPlanStatus(LEGACY_ACTIVE);
    assert.equal(r.format, "legacy");
    assert.equal(r.status, "active");
  });

  it("frontmatter plan becomes invisible (frozen, never misparsed)", () => {
    const r = readPlanStatus(FM_PLAN);
    assert.equal(r.format, "none");
    assert.equal(r.status, null);
  });
});

describe("readPlanStatus — frontmatter tightening mode", () => {
  beforeEach(() => { process.env.MISSION_DRIVER_LEDGER = "frontmatter"; });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.MISSION_DRIVER_LEDGER;
    else process.env.MISSION_DRIVER_LEDGER = origEnv;
  });

  it("frontmatter plan reads normally", () => {
    const r = readPlanStatus(FM_PLAN);
    assert.equal(r.format, "frontmatter");
    assert.equal(r.status, "active");
  });

  it("legacy-only plan is rejected, not silently legacy-parsed", () => {
    const r = readPlanStatus(LEGACY_PLAN);
    assert.equal(r.format, "none");
    assert.equal(r.status, null);
    assert.match(r.rejected, /rejected-in-frontmatter-mode/);
  });
});

describe("planLedgerState — closed semantics", () => {
  beforeEach(() => { process.env.MISSION_DRIVER_LEDGER = "auto"; });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.MISSION_DRIVER_LEDGER;
    else process.env.MISSION_DRIVER_LEDGER = origEnv;
  });

  it("legacy `> Plan Status: completed` ⇒ completed + terminal (closed forever)", () => {
    const s = planLedgerState(LEGACY_PLAN);
    assert.equal(s.completed, true);
    assert.equal(s.terminal, true);
    assert.equal(s.normalized, "completed");
  });

  it("frontmatter terminal (cancelled) ⇒ closed, not active", () => {
    const s = planLedgerState(FM_PLAN.replace("status: active", "status: cancelled"));
    assert.equal(s.completed, false);
    assert.equal(s.terminal, true);
  });

  it("frontmatter active with unchecked items ⇒ not completed (reasons explain)", () => {
    const s = planLedgerState(FM_PLAN);
    assert.equal(s.completed, false);
    assert.ok(s.derived.reasons.includes("unchecked-items:1"));
  });

  it("frontmatter active, all checked, verify pass + receipt ⇒ derived completed", () => {
    const text = FM_PLAN.replace("- [ ] task two", "- [x] task two");
    const s = planLedgerState(text);
    // Historical basisHash is accepted but ignored; the successful command receipt completes the plan.
    assert.equal(s.completed, true);
  });
});

describe("inspectPlan — dual-read counting", () => {
  beforeEach(() => { process.env.MISSION_DRIVER_LEDGER = "auto"; });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.MISSION_DRIVER_LEDGER;
    else process.env.MISSION_DRIVER_LEDGER = origEnv;
  });

  it("new-format plan counts only the counting domain", () => {
    const dir = mkdtempSync(join(tmpdir(), "dualread-"));
    const file = join(dir, "2026-08-25-0900-1-demo.md");
    writeFileSync(file, FM_PLAN + "\nExample outside domain (indented):\n  - [ ] not counted\n", "utf8");
    try {
      const r = inspectPlan(file);
      assert.equal(r.format, "frontmatter");
      assert.equal(r.totalChecked, 1);
      assert.equal(r.totalUnchecked, 1);
      assert.equal(r.planStatus, "active");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("legacy plan keeps whole-document counting", () => {
    const dir = mkdtempSync(join(tmpdir(), "dualread-"));
    const file = join(dir, "legacy.md");
    writeFileSync(file, LEGACY_ACTIVE, "utf8");
    try {
      const r = inspectPlan(file);
      assert.equal(r.format, "legacy");
      assert.equal(r.totalUnchecked, 1);
      assert.equal(r.planStatus, "active");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("guide-like file: no counting domain ⇔ 0 unchecked (--strict passes)", () => {
    const dir = mkdtempSync(join(tmpdir(), "dualread-"));
    const file = join(dir, "guide.md");
    writeFileSync(file, GUIDE_LIKE, "utf8");
    try {
      const r = inspectPlan(file, { strict: true });
      assert.equal(r.format, "none");
      assert.equal(r.totalUnchecked, 0);
      assert.equal(r.passed, true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

const FM_ROADMAP = `---
audit-rounds: 0
---

# Roadmap

## Work Item Status

### M1 — first

- [x] WI1 done thing
- [ ] WI2 open thing

### M2 — second

- [ ] WI3 later thing
`;

const LEGACY_TABLE_ROADMAP = `# Legacy Roadmap

## Work Item Status

| Work Item | Status | Owner |
| --------- | ------ | ----- |
| M1/WI1 alpha | done | docs/x.md |
| M1/WI2 beta | todo | docs/y.md |

## Status Values

| Status | Meaning |
| --- | --- |
| todo | Not started |
`;

describe("roadmap dual-read", () => {
  beforeEach(() => { process.env.MISSION_DRIVER_LEDGER = "auto"; });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.MISSION_DRIVER_LEDGER;
    else process.env.MISSION_DRIVER_LEDGER = origEnv;
  });

  it("auto: frontmatter roadmap resolves via checkbox Work Items", () => {
    const { phases, overallProgress } = parseRoadmapMarkdown(FM_ROADMAP);
    assert.equal(phases.length, 3);
    assert.deepEqual(phases.map((p) => p.status), ["done", "todo", "todo"]);
    assert.equal(overallProgress, 0.33);
  });

  it("auto: legacy table roadmap (no frontmatter) falls back to the table parser", () => {
    const { phases } = parseRoadmapMarkdown(LEGACY_TABLE_ROADMAP);
    assert.equal(phases.length, 2);
    assert.deepEqual(phases.map((p) => p.status), ["done", "todo"]);
  });

  it("roadmapAllDone: checkbox roadmap all-checked ⇒ true; one open ⇒ false", () => {
    assert.equal(roadmapAllDone(FM_ROADMAP), false);
    const allDone = FM_ROADMAP.replace("- [ ] WI2 open thing", "- [x] WI2 open thing").replace("- [ ] WI3 later thing", "- [x] WI3 later thing");
    assert.equal(roadmapAllDone(allDone), true);
  });

  it("legacy mode ignores the checkbox channel (rollback parity)", () => {
    process.env.MISSION_DRIVER_LEDGER = "legacy";
    // No legacy block in FM_ROADMAP → no items → not all done, no crash
    assert.equal(roadmapAllDone(FM_ROADMAP), false);
    const { phases } = parseRoadmapMarkdown(LEGACY_TABLE_ROADMAP);
    assert.equal(phases.length, 2);
  });

  it("frontmatter mode on a legacy roadmap returns no phases (tightening)", () => {
    process.env.MISSION_DRIVER_LEDGER = "frontmatter";
    const { phases } = parseRoadmapMarkdown(LEGACY_TABLE_ROADMAP);
    assert.equal(phases.length, 0);
  });
});
