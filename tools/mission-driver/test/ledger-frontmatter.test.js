import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseFrontmatter,
  validatePlanFrontmatter,
  validateRoadmapFrontmatter,
  WRITABLE_PLAN_STATUSES,
  TERMINAL_PLAN_STATUSES,
  DERIVED_PLAN_STATUS,
  PLAN_FRONTMATTER_FIELDS,
} from "../src/ledger-frontmatter.mjs";

const DESIGN_SAMPLE = `---
status: draft            # draft | active | held | cancelled | superseded | deferred
mission: dsh-plugin
work-item: M4-WI14
group: "2026-08-23-2200" # batch tag
failures: 0
verify: [test, build]
agent: "auditor"
# claim 与 claim-expires 仅在执行认领期间存在（见 §4.4），由守夜人写入与回收：
---
# body`;

describe("parseFrontmatter — subset positives", () => {
  it("parses the design §4.1 sample: bare words, quoted strings, ints, comments, flow array", () => {
    const r = parseFrontmatter(DESIGN_SAMPLE);
    assert.equal(r.ok, true);
    assert.equal(r.error, null);
    assert.deepEqual(r.fm, {
      status: "draft",
      mission: "dsh-plugin",
      "work-item": "M4-WI14",
      group: "2026-08-23-2200",
      failures: 0,
      verify: ["test", "build"],
      agent: "auditor",
    });
    assert.deepEqual(r.range, { start: 1, end: 10 });
  });

  it("parses quoted elements inside flow arrays and tolerates commas inside quotes", () => {
    const r = parseFrontmatter('---\nverify: ["a,b", c]\nhold: "it\'s held"\n---\n');
    assert.equal(r.ok, true);
    assert.deepEqual(r.fm.verify, ["a,b", "c"]);
    assert.equal(r.fm.hold, "it's held");
  });

  it("parses an empty flow array as []", () => {
    const r = parseFrontmatter("---\nverify: []\n---\n");
    assert.equal(r.ok, true);
    assert.deepEqual(r.fm.verify, []);
  });

  it("returns ok with empty fm and null range when the file has no frontmatter block", () => {
    const r = parseFrontmatter("# just a title\n\nbody text\n");
    assert.equal(r.ok, true);
    assert.deepEqual(r.fm, {});
    assert.equal(r.range, null);
  });

  it("normalizes CRLF line endings", () => {
    const r = parseFrontmatter("---\r\nstatus: draft\r\n---\r\nbody");
    assert.equal(r.ok, true);
    assert.equal(r.fm.status, "draft");
    assert.deepEqual(r.range, { start: 1, end: 3 });
  });
});

describe("parseFrontmatter — subset discipline (reject, never tolerate)", () => {
  it("rejects block scalars (| and >-) with line/col error", () => {
    for (const bad of ["notes: |\n  folded text", "notes: >-\n  folded text"]) {
      const r = parseFrontmatter(`---\nstatus: draft\n${bad}\n---\n`);
      assert.equal(r.ok, false, bad);
      assert.equal(r.fm, null);
      assert.match(r.error, /line 3, col \d+: block scalars are forbidden/);
    }
  });

  it("rejects inline nested objects and indented (nested) entry lines", () => {
    const inline = parseFrontmatter("---\nmeta: {a: 1}\n---\n");
    assert.equal(inline.ok, false);
    assert.match(inline.error, /line 2, col 6: nested objects are forbidden/);
    const indented = parseFrontmatter("---\nstatus: draft\n  nested: 1\n---\n");
    assert.equal(indented.ok, false);
    assert.match(indented.error, /line 3, col 1: indented entries are forbidden/);
  });

  it("rejects anchors and aliases", () => {
    const anchor = parseFrontmatter("---\nx: &anchor value\n---\n");
    assert.equal(anchor.ok, false);
    assert.match(anchor.error, /anchors are forbidden/);
    const alias = parseFrontmatter("---\ny: *ref\n---\n");
    assert.equal(alias.ok, false);
    assert.match(alias.error, /aliases are forbidden/);
  });

  it("rejects duplicate keys", () => {
    const r = parseFrontmatter("---\nstatus: draft\nstatus: active\n---\n");
    assert.equal(r.ok, false);
    assert.match(r.error, /line 3, col 7: duplicate key "status"/);
  });

  it("rejects unterminated frontmatter, empty values, multi-word bare values, and junk after quotes", () => {
    assert.match(parseFrontmatter("---\nstatus: draft\n").error, /never closed/);
    assert.match(parseFrontmatter("---\nhold:\n---\n").error, /empty value/);
    assert.match(parseFrontmatter('---\nhold: two words unquoted\n---\n').error, /bare values must be single words/);
    assert.match(parseFrontmatter('---\ngroup: "x" junk\n---\n').error, /unexpected content after closing quote/);
  });

  it("rejects nested arrays, multi-line flow arrays, and empty flow elements", () => {
    assert.equal(parseFrontmatter("---\nverify: [[a]]\n---\n").ok, false);
    assert.equal(parseFrontmatter("---\nverify: [a,\nb]\n---\n").ok, false);
    assert.equal(parseFrontmatter("---\nverify: [a, , b]\n---\n").ok, false);
  });
});

describe("validatePlanFrontmatter — field conditional rules", () => {
  it("accepts the minimal valid set (status/mission/work-item) with optional group/agent", () => {
    const r = validatePlanFrontmatter({ status: "draft", mission: "m", "work-item": "M1-WI1", group: "g", agent: "auditor" });
    assert.deepEqual(r, { ok: true, errors: [] });
    assert.deepEqual(validatePlanFrontmatter({ status: "deferred", mission: "m", "work-item": "WI2" }).errors, []);
  });

  it("rejects unknown fields, missing required fields, and empty mission/work-item", () => {
    const r = validatePlanFrontmatter({ status: "draft", mission: "m", "work-item": "WI1", bogus: 1 });
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors, ['unknown field "bogus"']);
    const missing = validatePlanFrontmatter({ group: "g" });
    assert.ok(missing.errors.some((e) => e.includes('missing required field "status"')));
    assert.ok(missing.errors.some((e) => e.includes('missing required field "mission"')));
    assert.ok(validatePlanFrontmatter({ status: "draft", mission: " ", "work-item": "WI1" }).ok === false);
  });

  it("rejects writable `completed` (derived) and off-vocabulary statuses", () => {
    const done = validatePlanFrontmatter({ status: "completed", mission: "m", "work-item": "WI1" });
    assert.equal(done.ok, false);
    assert.ok(done.errors.some((e) => e.includes('"completed" is a derived status')));
    assert.ok(validatePlanFrontmatter({ status: "in-progress", mission: "m", "work-item": "WI1" }).errors.some((e) => e.includes("invalid status")));
  });

  it("holds the hold⇔held invariant in both directions", () => {
    const heldNoHold = validatePlanFrontmatter({ status: "held", mission: "m", "work-item": "WI1" });
    assert.ok(heldNoHold.errors.some((e) => e.includes('"hold" is required while status is "held"')));
    const holdNotHeld = validatePlanFrontmatter({ status: "draft", mission: "m", "work-item": "WI1", hold: "waiting" });
    assert.ok(holdNotHeld.errors.some((e) => e.includes('"hold" is only allowed while status is "held"')));
    assert.equal(validatePlanFrontmatter({ status: "held", mission: "m", "work-item": "WI1", hold: "缺上游裁定" }).ok, true);
  });

  it("enforces claim ⇒ active, pair presence, claim format, and claim-expires ISO-8601", () => {
    const base = { mission: "m", "work-item": "WI1" };
    const claim = "attempt-2026-08-25-063133-mission-driver-ses_abc123-1f2e3d4c";
    const notActive = validatePlanFrontmatter({ ...base, status: "draft", claim, "claim-expires": "2026-08-24T16:30:00Z" });
    assert.ok(notActive.errors.some((e) => e.includes('only allowed while status is "active"')));
    const unpaired = validatePlanFrontmatter({ ...base, status: "active", claim });
    assert.ok(unpaired.errors.some((e) => e.includes("must appear as a pair")));
    const badFormat = validatePlanFrontmatter({ ...base, status: "active", claim: "attempt-x-y-zz", "claim-expires": "2026-08-24T16:30:00Z" });
    assert.ok(badFormat.errors.some((e) => e.includes('"claim" must match attempt-')));
    const badIso = validatePlanFrontmatter({ ...base, status: "active", claim, "claim-expires": "2026-08-24 16:30" });
    assert.ok(badIso.errors.some((e) => e.includes("ISO-8601")));
    assert.equal(validatePlanFrontmatter({ ...base, status: "active", claim, "claim-expires": "2026-08-24T16:30:00Z" }).ok, true);
  });

  it("enforces failures as non-negative integer and verify as single-level command-key array", () => {
    const base = { status: "active", mission: "m", "work-item": "WI1" };
    for (const bad of [-1, 1.5, "0", null]) {
      assert.equal(validatePlanFrontmatter({ ...base, failures: bad }).ok, false, `failures ${JSON.stringify(bad)}`);
    }
    assert.equal(validatePlanFrontmatter({ ...base, failures: 0 }).ok, true);
    assert.equal(validatePlanFrontmatter({ ...base, verify: "test" }).ok, false);
    assert.equal(validatePlanFrontmatter({ ...base, verify: [0] }).ok, false);
    assert.equal(validatePlanFrontmatter({ ...base, verify: ["has space"] }).ok, false);
    assert.equal(validatePlanFrontmatter({ ...base, verify: ["test", "lint:prompts"] }).ok, true);
  });

  // M2-WI44 vacuous-pass block: `verify: []` parses (subset format, pinned
  // above) but must NOT validate — an empty key set would make the §5.2
  // mechanical-verification conjunct vacuously true. Explicit [] is a
  // rejection; omission (undefined) is the legal path to the mission default.
  it("rejects verify: [] (vacuous-pass channel) while omission stays legal", () => {
    const base = { status: "active", mission: "m", "work-item": "WI1" };
    const r = validatePlanFrontmatter({ ...base, verify: [] });
    assert.equal(r.ok, false);
    assert.ok(
      r.errors.some((e) => e.includes('"verify" must be a non-empty array of command keys') && e.includes("omit the field")),
      `expected vacuous-pass rejection wording, got ${JSON.stringify(r.errors)}`,
    );
    assert.deepEqual(validatePlanFrontmatter(base).errors, []);
    assert.deepEqual(validatePlanFrontmatter({ ...base, verify: ["test"] }).errors, []);
  });

  it("validates agent lexical shape; group/agent stay optional", () => {
    const base = { status: "draft", mission: "m", "work-item": "WI1" };
    assert.equal(validatePlanFrontmatter(base).ok, true);
    assert.equal(validatePlanFrontmatter({ ...base, agent: "auditor" }).ok, true);
    assert.equal(validatePlanFrontmatter({ ...base, agent: "not a name" }).ok, false);
    assert.equal(validatePlanFrontmatter({ ...base, group: 7 }).ok, false);
  });

  it("exposes the §5.1 status vocabulary and §4.1 field list as constants", () => {
    assert.deepEqual(WRITABLE_PLAN_STATUSES, ["draft", "active", "held", "cancelled", "superseded", "deferred"]);
    assert.deepEqual(TERMINAL_PLAN_STATUSES, ["cancelled", "superseded", "deferred"]);
    assert.equal(DERIVED_PLAN_STATUS, "completed");
    assert.ok(WRITABLE_PLAN_STATUSES.includes("deferred"));
    assert.ok(!WRITABLE_PLAN_STATUSES.includes(DERIVED_PLAN_STATUS));
    assert.deepEqual(PLAN_FRONTMATTER_FIELDS, [
      "status", "mission", "work-item", "group", "failures", "verify", "agent", "hold", "claim", "claim-expires",
    ]);
  });
});

describe("validateRoadmapFrontmatter — audit-rounds only", () => {
  it("accepts a non-negative integer audit-rounds", () => {
    assert.deepEqual(validateRoadmapFrontmatter({ "audit-rounds": 2 }), { ok: true, errors: [] });
    assert.equal(validateRoadmapFrontmatter({ "audit-rounds": 0 }).ok, true);
  });

  it("rejects non-integer, negative, and missing audit-rounds", () => {
    assert.equal(validateRoadmapFrontmatter({ "audit-rounds": -1 }).ok, false);
    assert.equal(validateRoadmapFrontmatter({ "audit-rounds": 1.5 }).ok, false);
    assert.equal(validateRoadmapFrontmatter({ "audit-rounds": "2" }).ok, false);
    assert.ok(validateRoadmapFrontmatter({}).errors.some((e) => e.includes('missing required field "audit-rounds"')));
  });

  it("rejects unknown roadmap fields (including plan fields)", () => {
    const r = validateRoadmapFrontmatter({ "audit-rounds": 1, status: "draft" });
    assert.deepEqual(r.errors, ['unknown field "status"']);
  });
});
