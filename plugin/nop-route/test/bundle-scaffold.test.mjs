/**
 * bundle-scaffold.test.mjs — nop-route plugin-side local test entry
 * (multi-plugin-dsh M4-WI9 Phase 1 Proof; adapted from the nop-age
 * bundle-scaffold precedent). Later plans reuse this entry point: 1312-2
 * wiring tests, 1312-3 e2e (plugin/nop-route `npm test`).
 *
 * Pins the scaffold's structural invariants:
 *   1. package.json `dsh.bundle.patch` manifest field matches the verified
 *      host shape verbatim; minimal dependency face (cordis only); no
 *      `main`/`exports` (boot-import gap = adjudicated successor item).
 *   2. cordis.patch.yml parses and mounts through the nopRoute
 *      isolate-realm group with the routing config row.
 *   3. tsconfig.json is in-repo with the nop-age-aligned strict flags.
 *   4. The test script chain is exactly check-manifest → node --test → tsc
 *      (nop-route has no assets face → no build-bundle / smoke-import legs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readPkg = () => JSON.parse(readFileSync(resolve(PLUGIN_ROOT, "package.json"), "utf8"));

test("package.json declares the verbatim dsh bundle manifest shape", () => {
  const pkg = readPkg();
  assert.equal(pkg.name, "nop-route");
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines?.node, "^22.19 || >=24");
  assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml");
});

test("package.json keeps the minimal dependency face and no package entry", () => {
  const pkg = readPkg();
  assert.deepEqual(
    Object.keys(pkg.dependencies ?? {}).sort(),
    ["@deepseek-ai/cordis"],
    "runtime deps are exactly @deepseek-ai/cordis (zero-host-call discipline)",
  );
  for (const dep of ["typescript", "@types/node", "yaml"]) {
    assert.ok(pkg.devDependencies?.[dep], `devDependency ${dep} present`);
  }
  assert.equal("main" in pkg, false, "no main field (boot-import gap = successor item)");
  assert.equal("exports" in pkg, false, "no exports field (boot-import gap = successor item)");
});

test("cordis.patch.yml mounts the service through the nopRoute isolate-realm group", () => {
  const patch = parse(readFileSync(resolve(PLUGIN_ROOT, "cordis.patch.yml"), "utf8"));
  assert.ok(Array.isArray(patch), "patch is an operation list");
  const inserted = patch.flatMap((op) => op?.insert ?? []);
  const group = inserted.find((e) => e?.name === "cordis:group");
  assert.ok(group, "has a cordis:group row");
  assert.equal(group.id, "nop-route");
  assert.equal(group.group, true);
  assert.deepEqual(group.isolate, { nopRoute: true }, "isolate realm is exactly { nopRoute: true }");
  const service = (group.config ?? []).find((e) => typeof e?.name === "string" && e.name !== "cordis:group");
  assert.ok(service, "service row inside the group");
  assert.equal(service.id, "nop-route-service");
  assert.equal(service.name, "nop-route");
  assert.equal(service.config?.defaultModel, "zhipuai-coding-plan/glm-5.2");
  assert.equal(service.config?.maxRetries, 3);
  assert.deepEqual(service.config?.fallbackModels, ["zhipuai-coding-plan/glm-4.6"]);
});

test("tsconfig.json is in-repo with the nop-age-aligned strict flags", () => {
  const tsconfigPath = resolve(PLUGIN_ROOT, "tsconfig.json");
  assert.ok(existsSync(tsconfigPath), "tsconfig.json exists");
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  const opts = tsconfig.compilerOptions ?? {};
  assert.equal(opts.strict, true);
  assert.equal(opts.noEmit, true);
  assert.equal(opts.allowImportingTsExtensions, true);
  assert.equal(opts.allowJs, true);
  assert.deepEqual(tsconfig.include, ["src/**/*.ts"]);
});

test("test script chain is check-manifest → node --test → tsc, no assets legs", () => {
  const pkg = readPkg();
  assert.equal(pkg.scripts?.["check:manifest"], "node scripts/check-manifest.mjs");
  assert.equal(pkg.scripts?.typecheck, "tsc --noEmit");
  const chain = pkg.scripts?.test ?? "";
  assert.ok(chain.startsWith("node scripts/check-manifest.mjs &&"), "chain starts with check-manifest");
  assert.ok(chain.includes("node --test test/*.test.mjs"), "chain runs node --test over test/*.test.mjs");
  assert.ok(chain.endsWith("tsc --noEmit"), "chain ends with tsc --noEmit");
  assert.ok(!chain.includes("build-bundle"), "no build-bundle leg (nop-route has no assets face)");
  assert.ok(!chain.includes("smoke-import"), "no smoke-import leg (nop-route has no assets face)");
});
