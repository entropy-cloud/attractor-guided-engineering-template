// Field-set validator production wiring tests (age-autonomy M2-WI42, plan
// 2026-08-25-0925-2 Phase 1): validatePlanFrontmatter rides the read seam
// (readPlanStatus frontmatter branch → planLedgerState pass-through), so the
// three engine read faces consume it from ONE place —
//   ① plan-check: field errors become `field:` details → exit 1 (deep-audit
//      R1 live probes: handwritten `status: completed`, unknown key / typo)
//   ② flow-loader: scan warns once per offending file, queue membership
//      unchanged (kill silence, not the queue)
//   ③ monitor: plans list entries expose fieldErrors
// validateRoadmapFrontmatter rides parseRoadmapMarkdown's hasFm point (monitor
// roadmap API + roadmap-check CLI face).
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { readPlanStatus, planLedgerState } from "../src/ledger-dualread.mjs";
import { inspectPlan } from "../src/plan-check.mjs";
import { parseRoadmapMarkdown } from "../src/roadmap-check.mjs";
import { createExpressionFunctions } from "../src/flow-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAN_CHECK = resolve(__dirname, "..", "src", "plan-check.mjs");
const ROADMAP_CHECK = resolve(__dirname, "..", "src", "roadmap-check.mjs");
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

// Deep-audit R1 live probe 1: handwritten `status: completed` + fake basisHash
// receipts — used to sail through `plan-check --strict` with exit 0.
const HANDWRITTEN_COMPLETED = `---
status: completed
mission: demo
work-item: M9-WI99
verify: [test]
---

# handwritten completed

## Phase 1 — build

- [x] task one

## Verification

- pass test run-1 basisHash=0000000000000000000000000000000000000000000000000000000000000000 exit=0

## Closure

- dispatch audit #audit-run-1-demo-1-1a2b3c4d to ses_auditor_1
- accepted #audit-run-1-demo-1-1a2b3c4d：ok
`;

// Deep-audit R1 live probe 2: unknown key / `verfy` typo sails through silently.
const TYPO_UNKNOWN_KEY = `---
status: active
mission: demo
work-item: M9-WI99
verfy: [test]
---

# typo plan

## Phase 1 — build

- [ ] task one
`;

const LEGAL_FM_PLAN = `---
status: active
mission: demo
work-item: M9-WI98
group: "2026-08-25-0925"
verify: [test]
---

# legal plan

## Phase 1 — build

- [ ] task one
`;

const origEnv = process.env.MISSION_DRIVER_LEDGER;

function runCli(script, ...args) {
  const res = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 15000 });
  return { code: res.status ?? 0, stdout: res.stdout || "", stderr: res.stderr || "" };
}

function tmpFile(content, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const file = join(dir, "fixture.md");
  writeFileSync(file, content, "utf8");
  return { dir, file };
}

describe("WI42 read seam — fieldErrors ride readPlanStatus/planLedgerState", () => {
  beforeEach(() => { process.env.MISSION_DRIVER_LEDGER = "auto"; });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.MISSION_DRIVER_LEDGER;
    else process.env.MISSION_DRIVER_LEDGER = origEnv;
  });

  it("frontmatter read carries fieldErrors/fieldsValid (auto mode)", () => {
    const r = readPlanStatus(HANDWRITTEN_COMPLETED);
    assert.equal(r.format, "frontmatter");
    assert.equal(r.fieldsValid, false);
    assert.ok(r.fieldErrors.some((e) => e.includes("derived status")));
    const legal = readPlanStatus(LEGAL_FM_PLAN);
    assert.equal(legal.fieldsValid, true);
    assert.deepEqual(legal.fieldErrors, []);
  });

  it("planLedgerState transparently passes fieldErrors through", () => {
    const s = planLedgerState(TYPO_UNKNOWN_KEY);
    assert.equal(s.format, "frontmatter");
    assert.equal(s.fieldsValid, false);
    assert.ok(s.fieldErrors.some((e) => e.includes('unknown field "verfy"')));
  });

  it("frontmatter tightening mode also validates (same seam, both modes)", () => {
    process.env.MISSION_DRIVER_LEDGER = "frontmatter";
    const r = readPlanStatus(HANDWRITTEN_COMPLETED);
    assert.equal(r.format, "frontmatter");
    assert.equal(r.fieldsValid, false);
  });

  it("legacy and non-plan formats attach no field verdict (classification unchanged)", () => {
    const legacy = planLedgerState("# x\n\n> Plan Status: active\n\n### Phase 1 - x\n\n- [ ] work\n");
    assert.equal(legacy.format, "legacy");
    assert.equal("fieldErrors" in legacy, false);
    const guide = planLedgerState("# Guide\n\nProse only.\n");
    assert.equal(guide.format, "none");
    assert.equal("fieldErrors" in guide, false);
  });
});

describe("WI42 plan-check consumption — field errors fail the check", () => {
  it("handwritten status:completed → inspectPlan failed with `field:` detail naming the derived-status ban", () => {
    const { dir, file } = tmpFile(HANDWRITTEN_COMPLETED, "wi42-hw-");
    try {
      const r = inspectPlan(file, { strict: true });
      assert.equal(r.passed, false);
      assert.ok(r.details.some((d) => d.startsWith("field:") && d.includes("derived status") && d.includes("never be written")));
      assert.equal(r.fieldsValid, false);
      assert.ok(r.fieldErrors.length > 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("unknown key / verfy typo → `field:` detail naming the unknown key", () => {
    const { dir, file } = tmpFile(TYPO_UNKNOWN_KEY, "wi42-typo-");
    try {
      const r = inspectPlan(file);
      assert.equal(r.passed, false);
      assert.ok(r.details.some((d) => d.startsWith("field:") && d.includes('unknown field "verfy"')));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("legal frontmatter plan → zero field details, fieldsValid exposed true", () => {
    const { dir, file } = tmpFile(LEGAL_FM_PLAN, "wi42-legal-");
    try {
      const r = inspectPlan(file, { strict: true });
      // one unchecked item is the only (pre-existing) failure kind — no field: lines
      assert.ok(r.details.every((d) => !d.startsWith("field:")));
      assert.equal(r.fieldsValid, true);
      assert.deepEqual(r.fieldErrors, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("WI42 plan-check CLI — exit codes (live-probe reverse pin)", () => {
  it("handwritten status:completed → exit 1 with derived-status wording in stdout", () => {
    const { dir, file } = tmpFile(HANDWRITTEN_COMPLETED, "wi42-cli-hw-");
    try {
      const r = runCli(PLAN_CHECK, file, "--strict");
      assert.equal(r.code, 1, `stdout: ${r.stdout}`);
      const out = JSON.parse(r.stdout);
      assert.equal(out.passed, false);
      assert.ok(
        out.details.some((d) => d.startsWith("field:") && d.includes("derived status") && d.includes("never be written")),
        `expected derived-status field detail, got ${JSON.stringify(out.details)}`,
      );
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("verfy typo → exit 1 naming the unknown key", () => {
    const { dir, file } = tmpFile(TYPO_UNKNOWN_KEY, "wi42-cli-typo-");
    try {
      const r = runCli(PLAN_CHECK, file, "--strict");
      assert.equal(r.code, 1, `stdout: ${r.stdout}`);
      const out = JSON.parse(r.stdout);
      assert.ok(
        out.details.some((d) => d.includes('unknown field "verfy"')),
        `expected verfy unknown-field detail, got ${JSON.stringify(out.details)}`,
      );
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("legal corpus batch (0635-3, 0815-1/2/3, guide) → exit 0 (zero false kills)", () => {
    const files = [
      "docs/plans/age-autonomy/2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md",
      "docs/plans/age-autonomy/2026-08-25-0815-1-m2-law-seam-policy-schema.md",
      "docs/plans/age-autonomy/2026-08-25-0815-2-m2-three-hard-gates.md",
      "docs/plans/age-autonomy/2026-08-25-0815-3-m2-supporting-gates.md",
      "docs/plans/00-plan-authoring-and-execution-guide.md",
    ];
    for (const f of files) {
      const r = runCli(PLAN_CHECK, join(REPO_ROOT, f), "--strict");
      assert.equal(r.code, 0, `${f} → exit ${r.code}, stdout: ${r.stdout}, stderr: ${r.stderr}`);
    }
  });
});

describe("WI42 roadmap-check consumption", () => {
  beforeEach(() => { process.env.MISSION_DRIVER_LEDGER = "auto"; });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.MISSION_DRIVER_LEDGER;
    else process.env.MISSION_DRIVER_LEDGER = origEnv;
  });

  it("missing audit-rounds → parseRoadmapMarkdown fieldErrors names it", () => {
    const { fieldErrors } = parseRoadmapMarkdown("---\nmission: x\n---\n\n# Roadmap\n");
    assert.ok(fieldErrors.some((e) => e.includes('missing required field "audit-rounds"')));
    assert.ok(fieldErrors.some((e) => e.includes('unknown field "mission"')));
  });

  it("negative audit-rounds → fieldErrors names the non-negative rule", () => {
    const { fieldErrors } = parseRoadmapMarkdown("---\naudit-rounds: -1\n---\n\n# Roadmap\n\n### M1 — x\n\n- [ ] WI1 thing\n");
    assert.ok(fieldErrors.some((e) => e.includes('"audit-rounds" must be a non-negative integer')));
  });

  it("legal roadmap → fieldErrors [] and phases still parse", () => {
    const r = parseRoadmapMarkdown("---\naudit-rounds: 0\n---\n\n# Roadmap\n\n### M1 — x\n\n- [x] WI1 thing\n");
    assert.deepEqual(r.fieldErrors, []);
    assert.deepEqual(r.phases.map((p) => p.status), ["done"]);
  });

  it("roadmap-check CLI: missing audit-rounds fixture → non-zero exit; legal roadmap → exit 0", () => {
    const bad = tmpFile("---\nmission: x\n---\n\n# Roadmap\n", "wi42-rm-bad-");
    const good = tmpFile("---\naudit-rounds: 0\n---\n\n# Roadmap\n\n### M1 — x\n\n- [x] WI1 thing\n", "wi42-rm-good-");
    try {
      const rb = runCli(ROADMAP_CHECK, bad.file);
      assert.notEqual(rb.code, 0);
      assert.equal(rb.code, 1);
      const badOut = JSON.parse(rb.stdout);
      assert.ok(
        badOut.fieldErrors.some((e) => e.includes('missing required field "audit-rounds"')),
        `expected audit-rounds fieldError, got ${JSON.stringify(badOut.fieldErrors)}`,
      );
      const rg = runCli(ROADMAP_CHECK, good.file);
      assert.equal(rg.code, 0, `stdout: ${rg.stdout}`);
      const goodOut = JSON.parse(rg.stdout);
      assert.equal(goodOut.passed, true);
      assert.deepEqual(goodOut.fieldErrors, []);
    } finally {
      rmSync(bad.dir, { recursive: true, force: true });
      rmSync(good.dir, { recursive: true, force: true });
    }
  });

  it("roadmap-check CLI: no positional arg → exit 2 with Usage", () => {
    const r = runCli(ROADMAP_CHECK);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Usage:/);
  });
});

describe("WI42 flow-loader warn consumption — kill silence, not the queue", () => {
  it("field-invalid plan warns once with path + summary; legal plan zero warns; membership unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "wi42-fl-"));
    const origWarn = console.warn;
    const calls = [];
    console.warn = (...args) => { calls.push(args.join(" ")); };
    try {
      writeFileSync(join(dir, "2026-08-25-0900-1-bad.md"), TYPO_UNKNOWN_KEY, "utf8");
      writeFileSync(join(dir, "2026-08-25-0900-2-good.md"), LEGAL_FM_PLAN, "utf8");
      writeFileSync(join(dir, "2026-08-25-0900-3-guide.md"), "# Guide\n\nProse only.\n", "utf8");
      const fns = createExpressionFunctions({
        projectRoot: dir,
        mission: { plansDir: dir },
      });
      const active = fns.activePlans();
      // queue membership is status-based: BOTH parsable active plans stay queued
      assert.deepEqual(
        active.map((f) => f.slice(dir.length + 1)).sort(),
        ["2026-08-25-0900-1-bad.md", "2026-08-25-0900-2-good.md"],
      );
      // exactly one warn line, for the offending file only
      const fieldWarns = calls.filter((c) => c.includes("plan field validation failed"));
      assert.equal(fieldWarns.length, 1);
      assert.ok(fieldWarns[0].includes(join("2026-08-25-0900-1-bad.md")), `warn path missing in: ${fieldWarns[0]}`);
      assert.ok(fieldWarns[0].includes('unknown field "verfy"'));
      // a second scan of the same dir warns again (per-scan cadence), still once per file
      calls.length = 0;
      fns.activePlans();
      assert.equal(calls.filter((c) => c.includes("plan field validation failed")).length, 1);
    } finally {
      console.warn = origWarn;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("legal-only plans dir scans with zero field warnings", () => {
    const dir = mkdtempSync(join(tmpdir(), "wi42-fl2-"));
    const origWarn = console.warn;
    const calls = [];
    console.warn = (...args) => { calls.push(args.join(" ")); };
    try {
      writeFileSync(join(dir, "2026-08-25-0900-2-good.md"), LEGAL_FM_PLAN, "utf8");
      const fns = createExpressionFunctions({ projectRoot: dir, mission: { plansDir: dir } });
      assert.equal(fns.activePlans().length, 1);
      assert.equal(calls.filter((c) => c.includes("plan field validation failed")).length, 0);
    } finally {
      console.warn = origWarn;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
