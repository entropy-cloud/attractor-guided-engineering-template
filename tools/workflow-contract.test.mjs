// Contract fixtures inspect supplied instructions, not a simulated host/write tool.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "./install-age.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const text = (path) => readFileSync(join(root, path), "utf8");
const guide = "docs/guides/roadmap-goal-execution.md";

test("task-oriented workflow is discoverable in root and consumer entry points", () => {
  for (const path of ["AGENTS.md", "template/AGENTS.md", "docs/index.md", "template/docs/index.md", "template/START-HERE-after-copy.md", "README.md", "README.zh.md", "docs/guides/README.md"]) {
    assert.ok(text(path).includes(path === "docs/guides/README.md" ? "roadmap-goal-execution.md" : guide), path);
  }
  const entries = readManifest(join(root, "install-age.manifest"));
  for (const path of [guide, "tools/consumer-ledger.mjs", "tools/commit-plan.mjs", "tools/plan-status.mjs", "tools/vendor/js-yaml.mjs"]) assert.ok(entries.some((e) => e.src === path), path);
});

test("coordinator/prompt contracts use built-in tools and ordinary completion updating", () => {
  const usage = text(guide);
  for (const token of ["Read/Edit/Write", "resulting updated worklist", "research", "audit", "decision", "dependencies", "without restarting", "conflict feedback", "scope/acceptance", "hold", "host capability", "not equivalent", "one local delivery commit"]) assert.ok(usage.includes(token), token);
  assert.match(usage, /no extra full-roadmap reread, revision\/CAS check or custom synchronizer/);
  assert.match(text("docs/skills/common/closure-audit-prompt.md"), /built-in Read\/Edit\/Write/);
  assert.ok(!text("docs/guides/plan-authoring-and-execution.md").includes('node tools/plan-status.mjs docs/plans/<slug>/<plan>.md active'));
  for (const source of ["tools/consumer-ledger.mjs", "tools/commit-plan.mjs"]) {
    assert.ok(!/from ["'].*mission-driver/.test(text(source)), "standalone imports");
    assert.ok(!/writeFile|appendFile/.test(text(source)), "helpers do not write task documents");
  }
});

test("fresh default consumer runs shipped ledger/commit tools without engine or sibling checkout", (t) => {
  const scratch = join(root, "_tmp", "workflow-consumer");
  mkdirSync(scratch, { recursive: true });
  const target = mkdtempSync(join(scratch, "case-"));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  const run = (args, cwd = root) => spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: 120000 });
  const install = run(["tools/install-age.mjs", target, "Workflow fixture"]);
  assert.equal(install.status, 0, install.stderr);
  const consumerGuide = readFileSync(join(target, guide), "utf8");
  assert.match(consumerGuide, /mission: standalone/);
  const ledger = run(["--input-type=module", "-e", 'import {interpretPlan} from "./tools/consumer-ledger.mjs"; console.log(interpretPlan("not a plan").deliveryReady)'], target);
  assert.equal(ledger.status, 0, ledger.stderr);
  assert.equal(ledger.stdout.trim(), "false");
  const cli = run(["tools/commit-plan.mjs"], target);
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /usage:/);
});
