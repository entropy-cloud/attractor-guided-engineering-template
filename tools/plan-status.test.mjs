import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { interpretPlan } from "./consumer-ledger.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const review = "#review-run-plan-1-aabbccdd";
const audit = "#audit-run-plan-1-aabbccdd";
const plan = `---
status: active
mission: standalone
work-item: local:fixture
verify: [test]
---
# Fixture
## Phase 1 — Result
- [x] Add: behavior
## Phase 2 — Proof
- [x] Proof: tests
## Draft Review Record
- dispatch review ${review} to ses_review
- 2026-11-17：iteration 1，共识 passes draft review ${review}
## Execution
- Executor: ses_execute
## Verification
- pass test run exit=0
## Closure Findings
## Closure
- dispatch audit ${audit} to ses_audit
- accepted ${audit}: passes closure audit
`;

test("consumer proof is standalone, read-only and distinct from raw status", () => {
  const p = interpretPlan(plan);
  assert.equal(p.deliveryReady, true, p.reasons.join("; "));
  assert.equal(p.rawStatus, "active");
  assert.equal(p.receiptIntegrity, true);
  assert.equal(interpretPlan(plan.replace("status: active", "status: completed")).deliveryReady, true);
  for (const status of ["held", "cancelled", "draft"]) assert.equal(interpretPlan(plan.replace("status: active", `status: ${status}`)).deliveryReady, false);
});

for (const [label, change] of [
  ["no boxes", (s) => s.replace(/^- \[x\].*\n/gm, "")],
  ["unchecked", (s) => s.replace("[x]", "[ ]")],
  ["fenced proof", (s) => s.replace("- [x] Add: behavior", "```md\n- [x] Add: behavior\n```")],
  ["misplaced checkbox", (s) => s + "## Other\n- [x] misplaced\n"],
  ["indented checkbox", (s) => s.replace("- [x] Add:", "  - [x] Add:")],
  ["invalid Phase", (s) => s.replace("Phase 1", "Phase whatever")],
  ["empty verify", (s) => s.replace("verify: [test]", "verify: []")],
  ["missing verify", (s) => s.replace("verify: [test]\n", "")],
  ["latest verification failed", (s) => s.replace("## Closure Findings", "- pass test newer exit=1\n## Closure Findings")],
  ["review rejected multiword", (s) => s.replace("passes draft review", "needs revision")],
  ["different review id", (s) => s.replace(`review ${review}\n`, "review #review-other-plan-1-aabbccdd\n")],
  ["different audit id", (s) => s.replace(`accepted ${audit}`, "accepted #audit-other-plan-1-aabbccdd")],
  ["new pending audit", (s) => s + "- dispatch audit #audit-run-plan-2-bbccddee to ses_other\n"],
  ["new pending review", (s) => s.replace("## Execution", "- dispatch review #review-run-plan-2-bbccddee to ses_other\n## Execution")],
  ["reviewer reused as auditor", (s) => s.replace("to ses_audit", "to ses_review")],
  ["executor reused as auditor", (s) => s.replace("to ses_audit", "to ses_execute")],
  ["unknown executor", (s) => s.replace("- Executor: ses_execute", "")],
  ["duplicate YAML", (s) => s.replace("status: active", "status: active\nstatus: completed")],
]) test(`delivery refuses ${label}`, () => assert.equal(interpretPlan(change(plan)).deliveryReady, false));

test("Closure Findings and fenced receipts cannot stand in for Closure", () => {
  const p = interpretPlan(plan.replace("## Closure\n", "```md\n## Closure\n") + "```\n");
  assert.equal(p.audit.accepted, false);
  assert.equal(p.deliveryReady, false);
});

test("in-flight --check passes receipts without claiming delivery; activation rejects absent review", (t) => {
  const scratch = join(root, "_tmp", "workflow-ledger");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "case-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "plan.md");
  const inflight = plan.slice(0, plan.indexOf("- dispatch audit")).replace("[x]", "[ ]");
  writeFileSync(path, inflight);
  const run = (...args) => spawnSync(process.execPath, [join(root, "tools/plan-status.mjs"), ...args], { encoding: "utf8" });
  const check = run("--check", path);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /not delivery-ready/);
  assert.equal(readFileSync(path, "utf8"), inflight);
  const draft = plan.replace("status: active", "status: draft").replace(/- dispatch review.*\n|- 2026.*\n/g, "");
  writeFileSync(path, draft);
  assert.equal(run(path, "active").status, 1);
  assert.equal(readFileSync(path, "utf8"), draft);
  writeFileSync(path, plan);
  writeFileSync(join(dir, "history.md"), plan.replace("status: active", "status: completed").replace("[x]", "[ ]"));
  const list = run("--list", dir);
  assert.match(list.stdout, /raw=active\s+deliveryReady=true/);
  assert.match(list.stdout, /raw=completed\s+deliveryReady=false/);
  const unfinished = run("--unfinished", dir);
  assert.ok(!unfinished.stdout.includes("history.md"), "historical records are not auto-reopened");
});
