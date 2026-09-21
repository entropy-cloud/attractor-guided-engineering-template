import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectPlan, inspectPassLineFormat } from "../src/plan-check.mjs";

function tmpPlan(name, content) {
  const dir = mkdtempSync(join(tmpdir(), "plan-check-"));
  const file = join(dir, name);
  writeFileSync(file, content, "utf8");
  return { dir, file };
}

describe("inspectPlan — unchecked items", () => {
  it("flags plans with unchecked checklist items", () => {
    const { file, dir } = tmpPlan("001.md", `# 1 test

> Plan Status: active
> Package: @nop-chaos/flux-runtime

## Execution Plan

### Phase 1 - build

Status: planned

Exit Criteria:

- [ ] task one
- [ ] task two
`);
    try {
      const r = inspectPlan(file);
      assert.equal(r.passed, false);
      assert.equal(r.totalUnchecked, 2);
      assert.equal(r.planStatus, "active");
      assert.ok(r.details.some(d => d.includes("unchecked items")));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("passes a plan with everything checked and closure evidence", () => {
    const { file, dir } = tmpPlan("002.md", `# 2 done

> Plan Status: completed
> Last Reviewed: 2026-06-19

### Phase 1 - done

Status: completed

Exit Criteria:

- [x] task one

## Closure

Status Note: shipped

Closure Audit Evidence:

- pnpm --filter @nop-chaos/flux-runtime test green
- typecheck passes
`);
    try {
      const r = inspectPlan(file);
      assert.equal(r.passed, true);
      assert.equal(r.totalUnchecked, 0);
      assert.equal(r.planStatus, "completed");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("inspectPlan — closure evidence", () => {
  it("flags a completed plan whose Closure section has only a placeholder", () => {
    const { file, dir } = tmpPlan("003.md", `# 3 hollow

> Plan Status: completed

### Phase 1 - x

Status: completed

Exit Criteria:

- [x] done

## Closure

Status Note: *(pending)*

Closure Audit Evidence:

- *(pending)*
`);
    try {
      const r = inspectPlan(file);
      assert.equal(r.passed, false);
      assert.equal(r.planStatus, "completed");
      assert.ok(r.details.includes("missing closure evidence"),
        `expected 'missing closure evidence' in ${JSON.stringify(r.details)}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("passes a completed plan with real evidence items", () => {
    const { file, dir } = tmpPlan("004.md", `# 4 ok

> Plan Status: completed

### Phase 1 - x

Status: completed

Exit Criteria:

- [x] done

## Closure

Status Note: done

Closure Audit Evidence:

- All unit tests pass
`);
    try {
      const r = inspectPlan(file);
      assert.equal(r.passed, true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("flags a hollow Closure even when ## Closure Gates precedes it", () => {
    // Regression: CLOSURE_HEADER_RE must match "## Closure", not "## Closure
    // Gates". The plan template always places Closure Gates before Closure,
    // so a naive /\b/ anchor sampled the Gates items as evidence and let a
    // placeholder-only Closure pass.
    const { file, dir } = tmpPlan("005.md", `# 5 hollow behind gates

> Plan Status: completed

### Phase 1 - x

Status: completed

Exit Criteria:

- [x] done

## Closure Gates

- [x] gate one
- [x] gate two

## Closure

Status Note: *(pending)*

Closure Audit Evidence:

- *(pending)*
`);
    try {
      const r = inspectPlan(file);
      assert.equal(r.passed, false);
      assert.equal(r.planStatus, "completed");
      assert.ok(r.details.includes("missing closure evidence"),
        `expected 'missing closure evidence' in ${JSON.stringify(r.details)}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("inspectPlan — status parsing", () => {
  it("parses both bold and plain Plan Status front matter", () => {
    const bold = `# x\n\n> **Plan Status**: In Progress\n`;
    const plain = `# x\n\n> Plan Status: partially completed\n`;
    for (const [label, content, expected] of [
      ["bold", bold, "in progress"],
      ["plain", plain, "partially completed"],
    ]) {
      const { file, dir } = tmpPlan(`${label}.md`, content);
      try {
        const r = inspectPlan(file);
        assert.equal(r.planStatus, expected);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });
});

describe("inspectPassLineFormat — writer-side linter (WI05 re-exec, 2026-09-10)", () => {
  // The linter runs against the same PASS_RE the engine uses; a divergence
  // here would re-open the silent channel. These tests pin both halves:
  // well-formed lines → no malformed entry, malformed lines → reported with
  // 1-based line number and the offending text.
  const AUDIT_ID = "#audit-run1-plan1-1-a1b2c3d4";
  const REVIEW_ID = "#review-run1-plan1-1-9f8e7d6c";

  function buildPlan(verificationBody) {
    return `---
status: active
mission: m
work-item: WI1
---
# t

## Phase 1

- [x] item

## Draft Review Record

- dispatch review ${REVIEW_ID} to ses_r

## Verification

${verificationBody}

## Closure

- dispatch audit ${AUDIT_ID} to ses_a
- accepted ${AUDIT_ID}
`;
  }

  it("reports zero malformed when every pass line is well-formed (column-0)", () => {
    const body = "- pass test run-1 exit=0\n- pass test run-2 exit=0\n";
    const { file, dir } = tmpPlan("ok.md", buildPlan(body));
    try {
      const r = inspectPassLineFormat(file);
      assert.equal(r.total, 2);
      assert.equal(r.wellFormed, 2);
      assert.deepEqual(r.malformed, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("reports zero malformed when pass lines have leading whitespace (engine tolerates it now)", () => {
    const body = " - pass test run-1 exit=0\n   - pass test run-2 exit=0\n";
    const { file, dir } = tmpPlan("ok-indented.md", buildPlan(body));
    try {
      const r = inspectPassLineFormat(file);
      assert.equal(r.total, 2);
      assert.equal(r.wellFormed, 2);
      assert.deepEqual(r.malformed, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("reports the offending line number + text when shape drifts", () => {
    // Mixed: two well-formed, one missing `exit=`, one with a bad token.
    // Line numbers are 1-based; the exact value depends on the header
    // boilerplate above ## Verification, so we only assert that each
    // reported line number points back at the offending text (round-trip).
    const body =
      "- pass test run-1 exit=0\n" +
      " - pass test run-2 ok\n" +
      "  - pass test run-3 basisHash=xyz exit=0\n" +
      "- pass test run-4 exit=0\n";
    const { file, dir } = tmpPlan("drift.md", buildPlan(body));
    try {
      const allLines = buildPlan(body).split("\n");
      const r = inspectPassLineFormat(file);
      assert.equal(r.total, 4);
      assert.equal(r.wellFormed, 2);
      assert.equal(r.malformed.length, 2);
      for (const m of r.malformed) {
        assert.equal(allLines[m.line - 1], m.text, `line ${m.line} should round-trip back to the offending text`);
      }
      assert.ok(r.malformed.some((m) => m.text.includes("run-2 ok")));
      assert.ok(r.malformed.some((m) => m.text.includes("run-3 basisHash=xyz")));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("ignores pass-like text inside fenced code blocks (writer-side docs)", () => {
    const body = "- pass test run-1 exit=0\n\n```\n- pass test run-2 exit=ok\n```\n";
    const { file, dir } = tmpPlan("fenced.md", buildPlan(body));
    try {
      const r = inspectPassLineFormat(file);
      assert.equal(r.total, 1);
      assert.equal(r.wellFormed, 1);
      assert.deepEqual(r.malformed, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("exposes passLineFormat on inspectPlan output (so --strict catches drift too)", () => {
    const body = "- pass test ok\n"; // malformed: no exit=
    const { file, dir } = tmpPlan("strict.md", buildPlan(body));
    try {
      const r = inspectPlan(file);
      assert.ok(r.passLineFormat, "inspectPlan should surface passLineFormat");
      assert.equal(r.passLineFormat.total, 1);
      assert.equal(r.passLineFormat.malformed.length, 1);
      assert.ok(r.details.some((d) => d.startsWith("pass-line-format:")), `details should include pass-line-format entry, got: ${JSON.stringify(r.details)}`);
      assert.equal(r.passed, false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("inspectPassLineFormat — scope alignment with the engine (2026-09-21)", () => {
  // The engine scans pass lines ONLY inside a real `## Verification` block
  // (scanRegistryLines is block-scoped; anchors are fence-masked). The linter
  // must mirror that: no block → no pass surface → zero total. Scanning the
  // whole body false-killed prose format documentation (live corpus:
  // 00-plan-authoring-and-execution-guide.md line 141 `- pass <commandKey>
  // <runId> exit=<code>` bullet → "zero false kills" batch went red).

  it("plan without a real Verification block → zero total (engine has no scan scope either)", () => {
    const content = `---
status: active
mission: m
work-item: WI1
---
# t

## Phase 1

- [x] item

Prose below a fenced demo must not be linted:

\`\`\`
## Verification

- pass test demo-run exit=0
\`\`\`

- pass lines: \`- pass <commandKey> <runId> exit=<code>\`; a prose bullet, not a receipt.
`;
    const { file, dir } = tmpPlan("no-verification.md", content);
    try {
      const r = inspectPassLineFormat(file);
      assert.equal(r.total, 0);
      assert.equal(r.wellFormed, 0);
      assert.deepEqual(r.malformed, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("fenced demo Verification heading does not open a lint scope (fence-masked anchors)", () => {
    const content = `# guide

\`\`\`
## Verification

- pass test malformed-demo exit=ok
\`\`\`

- pass <commandKey> <runId> exit=<code>
`;
    const { file, dir } = tmpPlan("fenced-heading.md", content);
    try {
      const r = inspectPassLineFormat(file);
      assert.equal(r.total, 0);
      assert.deepEqual(r.malformed, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
