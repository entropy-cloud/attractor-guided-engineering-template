/**
 * bundle-scaffold.test.mjs — plugin-side local test entry (dsh-plugin M2-WI6
 * Phase 3 Proof). Later plans reuse this entry point: 1447-2 unit tests,
 * 1447-3 L2 matrix (plugin/dsh `npm test`).
 *
 * Pins the scaffold's structural invariants:
 *   1. package.json `dsh.bundle.patch` manifest field matches the R1 §5
 *      verified shape verbatim.
 *   2. cordis.patch.yml parses and mounts through an isolate-realm group.
 *   3. The committed assets/src tree is exactly the allowed engine module
 *      closure (drift between build script and committed tree fails here
 *      even before `build-bundle.mjs --check` runs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Mirrors ALLOWED_MODULES in scripts/build-bundle.mjs (packaging doc
// §Packaging Layout). Intentional duplication: the test pins the committed
// tree so either side drifting fails loudly.
const ALLOWED_MODULES = [
  "engine.js", "expression.mjs", "platform.mjs", "sys-snapshot.mjs",
  "reap-orphans.mjs", "run-reconcile.mjs", "active-run-registry.mjs", "roadmap-check.mjs",
  "config.js", "mission-check.mjs",
  "runner.js", "executor.js",
  "orchestrator.js", "flow-loader.js", "plan-check.mjs", "env-loader.js",
  "postmortem.mjs", "exit-map.js", "step-executor.js",
  // shared ledger library (age-autonomy M1-WI1/WI3/WI7; reachable via the
  // plan-check / flow-loader / roadmap-check importers since 0635-3)
  "ledger-frontmatter.mjs", "ledger-sections.mjs", "ledger-dualread.mjs",
  // shared law kernel (age-autonomy M2-WI12; law-policy reachable via
  // config.js autonomyPolicy load, law-core via law-policy, law-rules
  // (M2-WI14..16 hard gates + M2-WI17..20 supporting gates) via law-policy's
  // registration import; verify-runner (M2-WI19 commands runner) is
  // unreachable-allowed until the M3 supervisor wiring — 0815-3)
  "law-core.mjs", "law-policy.mjs", "law-rules.mjs", "verify-runner.mjs",
];

test("package.json declares the verbatim dsh bundle manifest shape (R1 §5)", () => {
  const pkg = JSON.parse(readFileSync(resolve(PLUGIN_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml");
});

test("cordis.patch.yml mounts the service through an isolate-realm group", () => {
  const patch = parse(readFileSync(resolve(PLUGIN_ROOT, "cordis.patch.yml"), "utf8"));
  assert.ok(Array.isArray(patch), "patch is an operation list");
  const inserted = patch.flatMap((op) => op?.insert ?? []);
  const group = inserted.find((e) => e?.name === "cordis:group");
  assert.ok(group, "has a cordis:group row");
  assert.equal(group.group, true);
  assert.ok(
    group.isolate && Object.values(group.isolate).every((v) => v === true),
    "isolate realm map with truthy keys",
  );
  const service = (group.config ?? []).find((e) => typeof e?.name === "string" && e.name !== "cordis:group");
  assert.ok(service, "service row inside the group");
});

test("committed assets/src is exactly the allowed engine module closure", () => {
  const srcDir = resolve(PLUGIN_ROOT, "assets", "src");
  assert.ok(existsSync(srcDir), "assets/src exists");
  assert.deepEqual(
    [...readdirSync(srcDir)].sort(),
    [...ALLOWED_MODULES].sort(),
  );
});

test("bundled engine asset dirs exist beside src (TOOL_ROOT layout)", () => {
  for (const dir of ["flows", "prompts", "agents"]) {
    assert.ok(existsSync(resolve(PLUGIN_ROOT, "assets", dir)), `assets/${dir} exists`);
  }
});
