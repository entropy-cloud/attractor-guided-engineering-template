import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scanPlanLedger,
  scanRoadmapLedger,
  parseLedgerId,
  PHASE_HEADING_RE,
  LEDGER_ID_RE,
} from "../src/ledger-sections.mjs";

const LONG_STEM = "2026-08-25-0635-2-m1-ledger-sections-derivation";
const REVIEW_ID = `#review-2026-08-25-063133-mission-driver-${LONG_STEM}-1-9f8e7d6c`;
const AUDIT_ID = `#audit-2026-08-25-063133-mission-driver-${LONG_STEM}-1-a1b2c3d4`;
const HASH64 = "a".repeat(64);

function fullPlan({ closureExtra = "", deepProse = "" } = {}) {
  return `---
status: active
mission: age-autonomy-implementation
work-item: M1-WI3
verify: [test]
---
# Sample plan

## Current Baseline

prose only

## Phase 1 — Implement scanner

- [x] build scanner
- [ ] write tests
  - [ ] indented sub-item outside the counting domain

## Phase 2

- [x] more work

## Closure Findings

- [x] finding resolved

## Draft Review Record

- dispatch review ${REVIEW_ID} to ses_reviewer_1
- 2026-08-24：iteration 1，共识 acceptable-as-is ${REVIEW_ID}
${deepProse}

## Verification

- pass test run-001 basisHash=${HASH64} exit=0

## Closure

- dispatch audit ${AUDIT_ID} to ses_auditor_1
- accepted ${AUDIT_ID}：审计通过，证据见 Verification${closureExtra}
`;
}

describe("counting-domain scanner — plan", () => {
  it("counts Phase sections (trailing-name and bare headings, em-dash and hyphen) and Closure Findings; indented lines excluded", () => {
    assert.equal(PHASE_HEADING_RE.test("Phase 1 — Implement scanner"), true);
    assert.equal(PHASE_HEADING_RE.test("Phase 2 - Implement scanner"), true);
    assert.equal(PHASE_HEADING_RE.test("Phase 3"), true);
    assert.equal(PHASE_HEADING_RE.test("Phaseer"), false);
    const r = scanPlanLedger(fullPlan());
    assert.deepEqual(r.errors, []);
    assert.equal(r.phases.length, 2);
    assert.equal(r.phases[0].number, 1);
    assert.equal(r.phases[0].title, "Implement scanner");
    assert.deepEqual(
      { total: r.phases[0].total, checked: r.phases[0].checked },
      { total: 2, checked: 1 },
    );
    assert.equal(r.phases[1].title, null);
    assert.deepEqual({ total: r.phases[1].total, checked: r.phases[1].checked }, { total: 1, checked: 1 });
    assert.deepEqual(r.closureFindings, { headingLine: 23, total: 1, checked: 1, unchecked: [] });
    assert.deepEqual(r.counts, { total: 4, checked: 3, unchecked: 1 });
    assert.equal(r.unchecked.length, 1);
    assert.equal(r.unchecked[0].section, "Phase 1");
    assert.equal(r.unchecked[0].line, 16);
  });

  it("skips fenced checkboxes and fenced headings — guide template examples do not pollute (no-frontmatter file is not a ledger)", () => {
    const guideLike = `# Plan Authoring Guide

## Template

\`\`\`md
## Phase 1

- [ ] template item one
- [x] template item two

## Closure

- [ ] template gate
\`\`\`

Prose after the fence.
`;
    const r = scanPlanLedger(guideLike);
    assert.equal(r.hasFrontmatter, false);
    assert.deepEqual(r.counts, { total: 0, checked: 0, unchecked: 0 });
    assert.deepEqual(r.errors, []);
    assert.equal(r.phases.length, 0);
  });

  it("rejects column-0 checkboxes outside the counting domain with line-located errors", () => {
    const bad = `---
status: draft
mission: m
work-item: WI1
---
# t

## Goals

- [ ] a goal checkbox in a prose section

## Closure Gates

- [ ] legacy gate checkbox

## Phase 1

- [x] real item

## Verification

- [ ] stray checkbox
`;
    const r = scanPlanLedger(bad);
    const ood = r.errors.filter((e) => e.code === "out-of-domain-checkbox");
    assert.equal(ood.length, 3);
    assert.deepEqual(ood.map((e) => e.line).sort((a, b) => a - b), [10, 14, 22]);
    assert.deepEqual(r.counts, { total: 1, checked: 1, unchecked: 0 });
  });

  it("tolerates unknown h2 sections as prose (not counted, no error when checkbox-free)", () => {
    const r = scanPlanLedger(`---
status: draft
mission: m
work-item: WI1
---
# t

## Dependencies

free prose, no machine face

## Phase 1

- [x] only item
`);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.counts, { total: 1, checked: 1, unchecked: 0 });
  });
});

describe("counting-domain scanner — roadmap", () => {
  const roadmap = `---
audit-rounds: 2
---
# Roadmap

## Work Item Status

### M1 — P0 Ledger 改造

- [ ] WI3 描述（owner doc 链接）: \`ready\`
- [x] WI1 描述（证据：docs/plans/...）: \`done\`
- [ ] WI5 描述: \`ready\`
  - \`pnpm --prefix tools/mission-driver test\` → 0 失败
  - \`grep -c "^- \\[ \\]" roadmap.md\` → 对账

### M2 — P1 法律

- [ ] WI12 gate 纯函数签名: \`todo\`

## Deep Audit Record

- dispatch audit #audit-2026-08-25-063133-age-roadmap-1-1a2b3c4d to ses_auditor_9
- accepted #audit-2026-08-25-063133-age-roadmap-1-1a2b3c4d findings=none：无新发现
`;

  it("counts Work Item blocks, extracts WI ids and status suffixes, ignores indented gate sub-items", () => {
    const r = scanRoadmapLedger(roadmap);
    assert.deepEqual(r.errors, []);
    assert.equal(r.milestones.length, 2);
    const m1 = r.milestones[0];
    assert.equal(m1.number, 1);
    assert.equal(m1.title, "P0 Ledger 改造");
    assert.deepEqual({ total: m1.total, checked: m1.checked }, { total: 3, checked: 1 });
    assert.equal(m1.workItems[0].id, "WI3");
    assert.equal(m1.workItems[0].status, "ready");
    assert.equal(m1.workItems[0].checked, false);
    assert.equal(m1.workItems[1].status, "done");
    assert.deepEqual(r.counts, { total: 4, checked: 1, unchecked: 3 });
    assert.deepEqual(r.unchecked.map((u) => u.section), ["M1", "M1", "M2"]);
  });

  it("rejects roadmap checkboxes outside Work Item blocks", () => {
    const bad = `---
audit-rounds: 0
---
# Roadmap

## Purpose

- [ ] checkbox in a prose section
`;
    const r = scanRoadmapLedger(bad);
    assert.equal(r.errors.filter((e) => e.code === "out-of-domain-checkbox").length, 1);
  });

  it("parses the roadmap Deep Audit Record with findings=none|items accepted lines", () => {
    const r = scanRoadmapLedger(roadmap);
    const dar = r.deepAuditRecord;
    assert.equal(dar.dispatches.length, 1);
    assert.equal(dar.accepted.length, 1);
    assert.equal(dar.accepted[0].findings, "none");
    assert.deepEqual(dar.pairs, ["#audit-2026-08-25-063133-age-roadmap-1-1a2b3c4d"]);
    const withItems = roadmap.replace("findings=none：无新发现", "findings=items：两项发现");
    assert.equal(scanRoadmapLedger(withItems).deepAuditRecord.accepted[0].findings, "items");
  });
});

describe("id lexing — tail-anchored parsing", () => {
  it("parses ids whose plan stems contain many hyphens and trailing digits", () => {
    const id = parseLedgerId(REVIEW_ID);
    assert.equal(id.kind, "review");
    assert.equal(id.iter, 1);
    assert.equal(id.nonce, "9f8e7d6c");
    assert.equal(id.prefix, `2026-08-25-063133-mission-driver-${LONG_STEM}`);
    const stemEndingInDigit = parseLedgerId("#review-run-x-2026-08-25-0635-2-3-a1b2c3d4");
    assert.equal(stemEndingInDigit.iter, 3);
    assert.equal(stemEndingInDigit.prefix, "run-x-2026-08-25-0635-2");
  });

  it("rejects nonce8 that is not exactly 8 lowercase hex, non-numeric iter, and missing prefix", () => {
    assert.equal(parseLedgerId("#review-r-p-1-a1b2c3"), null);
    assert.equal(parseLedgerId("#review-r-p-1-a1b2c3d4e"), null);
    assert.equal(parseLedgerId("#review-r-p-1-a1b2c3g"), null);
    assert.equal(parseLedgerId("#review-r-p-two-a1b2c3d4"), null);
    assert.equal(parseLedgerId("#note-r-p-1-a1b2c3d4"), null);
    assert.equal(LEDGER_ID_RE.test("#review--1-a1b2c3d4"), false);
  });

  it("rejects a stem-shaped but uppercase-nonce id (lexical subset stays strict)", () => {
    assert.equal(parseLedgerId("#review-r-p-1-A1B2C3D4"), null);
  });
});

describe("append-only section grammars", () => {
  it("parses all three conclusion-line forms and keeps them distinct", () => {
    const r = scanPlanLedger(fullPlan());
    const closure = r.closure;
    assert.equal(closure.accepted[0].id, AUDIT_ID);
    assert.equal(closure.accepted[0].findings, null);
    assert.deepEqual(closure.pairs, [AUDIT_ID]);
    const drr = r.draftReviewRecord;
    assert.equal(drr.dispatches[0].kind, "review");
    assert.equal(drr.dispatches[0].sessionId, "ses_reviewer_1");
    assert.deepEqual(drr.conclusions[0], {
      line: 30,
      date: "2026-08-24",
      iteration: 1,
      verdict: "acceptable-as-is",
      id: REVIEW_ID,
      valid: true,
    });
    assert.deepEqual(drr.pairs, [REVIEW_ID]);
    const pass = r.verification.passes[0];
    assert.deepEqual({ key: pass.key, runId: pass.runId, exit: pass.exit }, { key: "test", runId: "run-001", exit: 0 });
  });

  it("findings lexeme mismatch is a structural error in both directions", () => {
    const planSide = scanPlanLedger(
      fullPlan().replace(`- accepted ${AUDIT_ID}：审计通过，证据见 Verification`, `- accepted ${AUDIT_ID} findings=none：审计通过`),
    );
    assert.ok(planSide.errors.some((e) => e.code === "accepted-findings-mismatch"));
    const roadmapSide = scanRoadmapLedger(`---
audit-rounds: 0
---
# r

## Deep Audit Record

- dispatch audit #audit-run1-road1-1-1a2b3c4d to ses_a
- accepted #audit-run1-road1-1-1a2b3c4d：missing findings token
`);
    assert.ok(roadmapSide.errors.some((e) => e.code === "accepted-findings-mismatch"));
  });

  it("malformed known-prefix lines are rejected: bad nonce, kind mismatch, malformed pass lines", () => {
    const bad = `---
status: draft
mission: m
work-item: WI1
---
# t

## Phase 1

- [x] item

## Draft Review Record

- dispatch review #audit-run1-plan1-1-a1b2c3d4 to ses_r

## Verification

- pass test r1 basisHash=xyz exit=0
- pass test r1 basisHash=${HASH64} exit=ok

## Closure

- dispatch audit #audit-run1-plan1-1-a1b2c3 to ses_a
`;
    const r = scanPlanLedger(bad);
    assert.ok(r.errors.some((e) => e.code === "id-kind-mismatch"));
    assert.equal(r.errors.filter((e) => e.code === "malformed-pass").length, 2);
    assert.ok(r.errors.some((e) => e.code === "malformed-dispatch"));
    assert.equal(r.draftReviewRecord.dispatches[0].valid, false);
    assert.equal(r.closure.dispatches[0].valid, false);
  });

  it("dispatch without a same-id conclusion is a derived-state fact, not a structural error", () => {
    const r = scanPlanLedger(`---
status: active
mission: m
work-item: WI1
---
# t

## Phase 1

- [x] item

## Draft Review Record

- dispatch review ${REVIEW_ID} to ses_reviewer_1

## Verification

## Closure

- dispatch audit ${AUDIT_ID} to ses_auditor_1
`);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.draftReviewRecord.unpairedDispatches, [REVIEW_ID]);
    assert.deepEqual(r.closure.unpairedDispatches, [AUDIT_ID]);
    assert.deepEqual(r.closure.pairs, []);
  });

  it("models= lineage suffix: legal pair parses into the dispatch record; no-suffix lines unchanged", () => {
    const withModels = scanPlanLedger(`---
status: active
mission: m
work-item: WI1
---
# t

## Phase 1

- [x] item

## Draft Review Record

- dispatch review ${REVIEW_ID} to ses_reviewer_1 models={exec:glm-5.2,aud:glm-5.2-auditor}

## Verification

## Closure

- dispatch audit ${AUDIT_ID} to ses_auditor_1 models={exec:agent-a,aud:agent-b}
`);
    assert.deepEqual(withModels.errors, []);
    assert.deepEqual(withModels.draftReviewRecord.dispatches[0].models, { exec: "glm-5.2", aud: "glm-5.2-auditor" });
    assert.deepEqual(withModels.closure.dispatches[0].models, { exec: "agent-a", aud: "agent-b" });
    const without = scanPlanLedger(fullPlan());
    assert.equal(without.closure.dispatches[0].models, undefined);
    assert.equal(without.draftReviewRecord.dispatches[0].models, undefined);
  });

  it("models= lineage suffix: malformed and half-paired suffixes are structural errors, not tolerated prose", () => {
    for (const [label, suffix] of [
      ["half pair (aud missing)", " models={exec:only}"],
      ["half pair (exec missing)", " models={aud:only}"],
      ["no braces", " models=exec:a,aud:b"],
      ["trailing comma slot", " models={exec:a,aud:}"],
    ]) {
      const r = scanPlanLedger(`---
status: active
mission: m
work-item: WI1
---
# t

## Phase 1

- [x] item

## Draft Review Record

## Verification

## Closure

- dispatch audit ${AUDIT_ID} to ses_auditor_1${suffix}
`);
      assert.ok(r.errors.some((e) => e.code === "malformed-dispatch" && /models= lineage suffix/.test(e.message)), label);
      assert.equal(r.closure.dispatches[0].valid, false, label);
    }
  });

  it("tolerates unknown-prefix prose lines in append-only sections (legacy migration corpus)", () => {
    const legacy = `---
status: active
mission: m
work-item: WI1
---
# t

## Phase 1

- [x] item

## Draft Review Record

Status Note: pending

- Independent draft review iteration 1: needs-revision（task ses_old_1）——3 blocking。

## Verification

- pass test run-001 basisHash=${HASH64} exit=0

## Closure

Status Note: pending

Closure Audit Evidence: pending
`;
    const r = scanPlanLedger(legacy);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.draftReviewRecord.conclusions, []);
    assert.equal(r.verification.passes.length, 1);
  });
});

/* ── duplicate append-only anchors (M2-WI22, deep-audit round-1 P2) ── */

describe("duplicate-append-only-anchor structural error (M2-WI22)", () => {
  it("plan face: a second `## Closure` block is a structural error; the first block stays the derived face", () => {
    const dup = fullPlan() + `
## Closure

- dispatch audit ${AUDIT_ID} to ses_auditor_2
- accepted ${AUDIT_ID}：duplicate receipt must vanish from the derived face — and now loudly
`;
    const r = scanPlanLedger(dup);
    const errs = r.errors.filter((e) => e.code === "duplicate-anchor");
    assert.equal(errs.length, 1, `exactly one duplicate-anchor error: ${JSON.stringify(r.errors)}`);
    const lines = dup.split("\n");
    let seenFirst = false;
    let secondLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === "## Closure") {
        if (seenFirst) { secondLine = i + 1; break; }
        seenFirst = true;
      }
    }
    assert.equal(errs[0].line, secondLine, "the error points at the SECOND (duplicate) heading");
    assert.match(errs[0].message, /duplicate append-only anchor `## Closure`/);
    assert.match(errs[0].message, /first anchored at line \d+/);
    // first-anchoring semantics preserved: the derived face is the FIRST block
    assert.equal(r.closure.dispatches.length, 1);
    assert.equal(r.closure.dispatches[0].sessionId, "ses_auditor_1");
    assert.equal(r.closure.accepted[0].id, AUDIT_ID);
  });

  it("plan face: same discipline for duplicate Draft Review Record and Verification anchors", () => {
    for (const anchor of ["Draft Review Record", "Verification"]) {
      const dup = fullPlan() + `\n## ${anchor}\n\n- prose that must not reach the derived face\n`;
      const r = scanPlanLedger(dup);
      const errs = r.errors.filter((e) => e.code === "duplicate-anchor");
      assert.equal(errs.length, 1, anchor);
      assert.match(errs[0].message, new RegExp(`duplicate append-only anchor \`## ${anchor}\``));
    }
  });

  it("plan face: single anchors (the normal shape) produce zero duplicate-anchor errors", () => {
    const r = scanPlanLedger(fullPlan());
    assert.equal(r.errors.filter((e) => e.code === "duplicate-anchor").length, 0);
    assert.deepEqual(r.errors, []);
  });

  it("roadmap face: a second `## Deep Audit Record` block is a structural error", () => {
    const roadmap = (extra = "") => `# Roadmap

## Progress

### M1

- [x] WI1 done — proof

## Deep Audit Record

- dispatch audit ${AUDIT_ID} to ses_auditor_1
- accepted ${AUDIT_ID}：findings=none${extra}
`;
    const single = scanRoadmapLedger(roadmap());
    assert.equal(single.errors.filter((e) => e.code === "duplicate-anchor").length, 0);
    const dup = scanRoadmapLedger(roadmap() + `
## Deep Audit Record

- dispatch audit ${AUDIT_ID} to ses_auditor_2
- accepted ${AUDIT_ID}：findings=none
`);
    const errs = dup.errors.filter((e) => e.code === "duplicate-anchor");
    assert.equal(errs.length, 1);
    assert.match(errs[0].message, /duplicate append-only anchor `## Deep Audit Record`/);
    assert.match(errs[0].message, /first anchored at line \d+/);
    assert.equal(dup.deepAuditRecord.dispatches.length, 1);
    assert.equal(dup.deepAuditRecord.dispatches[0].sessionId, "ses_auditor_1");
    assert.equal(dup.deepAuditRecord.accepted[0].id, AUDIT_ID);
  });

  it("corpus: every live plan and the age-autonomy roadmap carry zero duplicate-anchor errors", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const repoRoot = join(dirname(dirname(fileURLToPath(import.meta.url))), "..", "..");
    const plansDir = join(repoRoot, "docs", "plans");
    const files = [];
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : (e.name.endsWith(".md") ? [p] : []);
    });
    files.push(...walk(plansDir));
    const offenders = [];
    for (const f of files) {
      const r = scanPlanLedger(readFileSync(f, "utf8"));
      const dup = r.errors.filter((e) => e.code === "duplicate-anchor");
      if (dup.length > 0) offenders.push(`${f}: ${dup.map((e) => `line ${e.line}`).join(", ")}`);
    }
    const roadmapPath = join(repoRoot, "docs", "backlog", "age-autonomy-implementation-roadmap.md");
    const rr = scanRoadmapLedger(readFileSync(roadmapPath, "utf8"));
    const roadDup = rr.errors.filter((e) => e.code === "duplicate-anchor");
    if (roadDup.length > 0) offenders.push(`${roadmapPath}: ${roadDup.map((e) => `line ${e.line}`).join(", ")}`);
    assert.deepEqual(offenders, [],
      "the live corpus must carry zero duplicate append-only anchors (zero false kills)");
  });
});
