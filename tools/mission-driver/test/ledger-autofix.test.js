import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autoRepairFrontmatter } from "../src/ledger-autofix.mjs";
import { planLedgerState } from "../src/ledger-dualread.mjs";

// Mechanical-class auto-repair for the validate-plans gate: quoting bare
// multi-word / flow-char scalar values is lossless and deterministic, so the
// gate repairs it in place instead of burning a DRAFT_PLANS round-trip.
// Semantic classes (status vocabulary, Closure structure, unknown keys) must
// NEVER be touched here — they need a fact judgment (im-deep-analysis loop,
// 2026-09-21: 36 legacy ledgers, all quoting-class, looped the flow).

const PLAN = (workItem) => `---
status: draft
mission: m1
work-item: ${workItem}
verify: [test]
---

# Plan
`;

describe("autoRepairFrontmatter — mechanical quoting", () => {
  it("quotes a bare multi-word value and reports the line", () => {
    const r = autoRepairFrontmatter(PLAN("多词 域 ORM"));
    assert.equal(r.changed, true);
    assert.equal(r.repairs.length, 1);
    assert.equal(r.repairs[0].line, 4);
    assert.match(r.text, /work-item: "多词 域 ORM"/);
  });

  it("output re-parses cleanly under planLedgerState (integration with the real parser)", () => {
    const fixed = autoRepairFrontmatter(PLAN("多词 域 ORM")).text;
    const s = planLedgerState(fixed, { defaultVerifyKeys: ["test"] });
    assert.equal(s.rejected, null);
    assert.deepEqual(s.fieldErrors, []);
    assert.equal(s.status, "draft");
  });

  it("is idempotent — second run is a no-op", () => {
    const once = autoRepairFrontmatter(PLAN("多词 域 ORM"));
    const twice = autoRepairFrontmatter(once.text);
    assert.equal(twice.changed, false);
    assert.deepEqual(twice.repairs, []);
  });

  it("leaves single-word, already-quoted, and array values untouched", () => {
    const content = `---
status: draft
mission: m1
work-item: "already quoted 多词"
group: g1
verify: [test, build]
---

# Plan
`;
    const r = autoRepairFrontmatter(content);
    assert.equal(r.changed, false);
  });

  it("quotes bare values containing flow-syntax characters", () => {
    const r = autoRepairFrontmatter(PLAN("a,b [x]"));
    assert.equal(r.changed, true);
    assert.match(r.text, /work-item: "a,b \[x\]"/);
  });

  it("escapes embedded double quotes and backslashes so the result re-parses to the same value", () => {
    const r = autoRepairFrontmatter(PLAN('say "hi" now\\ok'));
    assert.equal(r.changed, true);
    assert.match(r.text, /work-item: "say \\"hi\\" now\\\\ok"/);
    const s = planLedgerState(r.text, {});
    assert.equal(s.rejected, null);
    assert.equal(s.fieldsValid, true);
  });

  it("skips bare values carrying an inline comment (quoting would fold it into the value)", () => {
    const content = PLAN("多词 域 # note");
    const r = autoRepairFrontmatter(content);
    assert.equal(r.changed, false);
  });

  it("preserves CRLF line endings", () => {
    const crlf = PLAN("多词 域 ORM").replace(/\n/g, "\r\n");
    const r = autoRepairFrontmatter(crlf);
    assert.equal(r.changed, true);
    assert.match(r.text, /work-item: "多词 域 ORM"\r\n/);
    // no line was dropped or merged: CRLF count identical to the input
    const count = (t) => (t.match(/\r\n/g) || []).length;
    assert.equal(count(r.text), count(crlf));
  });

  it("leaves non-frontmatter and unclosed-frontmatter content untouched", () => {
    for (const bad of ["# just prose\n", "---\nstatus: draft\n"]) {
      const r = autoRepairFrontmatter(bad);
      assert.equal(r.changed, false);
      assert.equal(r.text, bad);
    }
  });

  it("never repairs semantic classes — status vocabulary passes through untouched", () => {
    const r = autoRepairFrontmatter(PLAN("多词 域 ORM").replace("status: draft", "status: done"));
    assert.equal(r.changed, true); // quoting happened…
    assert.match(r.text, /status: done/); // …but the semantic field was not touched
  });
});
