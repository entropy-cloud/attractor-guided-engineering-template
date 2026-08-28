#!/usr/bin/env node
/**
 * check-manifest.mjs — structural validation of the DSH bundle manifest and
 * patch layer (dsh-plugin M2-WI6 Phase 1 Proof).
 *
 * Verifies, without a real host:
 *   1. package.json declares `dsh.bundle.patch` with the exact field names and
 *      nesting verified in R1 §5 (app-boot profile.ts `DshBundleManifest`).
 *   2. The referenced patch file exists and is plain parseable YAML (dev-dep
 *      `yaml` parser — plugin layer may carry devDeps; the engine's
 *      zero-npm-dependency invariant is untouched).
 *   3. The patch carries the expected mount structure: an `insert` operation
 *      whose entry list contains an isolate-realm group (cordis:group +
 *      group: true + isolate with a truthy key) holding a service row with
 *      string id/name.
 *
 * Real host mounting smoke is WI9 (L3) scope — this Proof is structural.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok" : "FAIL"}  ${label}`);
  if (!ok) failures.push(label);
};

// 1. package.json manifest shape (field names must match R1 §5 verbatim).
const pkgPath = resolve(PLUGIN_ROOT, "package.json");
check(existsSync(pkgPath), `package.json exists at ${pkgPath}`);
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
check(
  pkg.dsh instanceof Object && pkg.dsh !== null && !Array.isArray(pkg.dsh),
  "package.json has a `dsh` object",
);
check(
  pkg.dsh?.bundle instanceof Object && pkg.dsh?.bundle !== null && !Array.isArray(pkg.dsh?.bundle),
  "`dsh.bundle` object present (nested one level, per DshBundleManifest)",
);
check(
  typeof pkg.dsh?.bundle?.patch === "string" && pkg.dsh.bundle.patch.length > 0,
  "`dsh.bundle.patch` is a non-empty string",
);
const patchRel = pkg.dsh?.bundle?.patch;
check(patchRel === "./cordis.patch.yml", "`dsh.bundle.patch` value is \"./cordis.patch.yml\"");

// 2. Patch file exists and parses.
const patchPath = resolve(PLUGIN_ROOT, patchRel || "./cordis.patch.yml");
check(existsSync(patchPath), `patch file exists: ${patchRel}`);
const patch = parse(readFileSync(patchPath, "utf8"));
check(Array.isArray(patch), "patch file parses to a YAML list (operation list)");

// 3. Mount key structure: insert op → isolate-realm group → service row.
const inserts = Array.isArray(patch) ? patch.filter((op) => op && typeof op === "object" && Array.isArray(op.insert)) : [];
check(inserts.length >= 1, "patch contains at least one `insert` operation");
const groupEntry = inserts.flatMap((op) => op.insert).find(
  (e) => e && typeof e === "object" && e.name === "cordis:group",
);
check(groupEntry !== undefined, "an inserted entry is a `cordis:group` row");
check(groupEntry?.group === true, "group row carries `group: true`");
check(
  groupEntry?.isolate instanceof Object && groupEntry?.isolate !== null &&
    Object.values(groupEntry.isolate).every((v) => v === true) &&
    Object.keys(groupEntry.isolate).length > 0,
  "group row carries an `isolate` realm map with truthy keys (entry-local realm)",
);
const serviceRow = Array.isArray(groupEntry?.config)
  ? groupEntry.config.find((e) => e && typeof e === "object" && typeof e.name === "string" && e.name !== "cordis:group")
  : undefined;
check(serviceRow !== undefined, "group config holds a service row with a string `name`");
check(
  typeof serviceRow?.id === "string" && serviceRow.id.length > 0,
  "service row carries a non-empty string `id`",
);
check(
  serviceRow?.name === pkg.name,
  `service row name === package name ("${pkg.name}") — self-mount via two-anchor resolution`,
);

if (failures.length > 0) {
  console.error(`\ncheck-manifest: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\ncheck-manifest: all structural checks passed");
