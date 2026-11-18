// Production CLI integration, isolated consumers; no model, host or sibling engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "./install-age.mjs";
import { hash, inspectDrift, listFiles, ORIGIN_FILE } from "./age-drift.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = join(root, "_tmp", "install-age-integration");
mkdirSync(scratch, { recursive: true });
function temp(t) {
  const dir = mkdtempSync(join(scratch, "case-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function node(args, cwd = root) {
  return spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: 120000,
    env: { ...process.env, MISSION_DRIVER_HOME: "", NODE_OPTIONS: "", AGE_REPO_ROOT: "",
      AGE_ACTIVE_DOC_ROOTS: "", AGE_ACTIVE_DOC_FILES: "", AGE_DOC_REFS_IGNORE_FILES: "" } });
}
function install(target, flags = [], source = root, name = "Consumer 中文") {
  return node([join(source, "tools/install-age.mjs"), target, name, ...flags]);
}
function ok(result) { assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`); }
function snapshot(target) {
  return Object.fromEntries(listFiles(target).map((path) => [path, hash(readFileSync(join(target, path)))]));
}
function sourceFixture(t) {
  const source = temp(t);
  for (const path of new Set(["tools/install-age.mjs", "tools/age-drift.mjs", "install-age.manifest", ...readManifest(join(root, "install-age.manifest")).map((e) => e.src)])) {
    mkdirSync(dirname(join(source, path)), { recursive: true });
    copyFileSync(join(root, path), join(source, path));
  }
  return source;
}

for (const profile of ["none", "frontend", "java", "all"]) {
  test(`consumer matrix: profile=${profile}`, (t) => {
    const target = temp(t);
      const flags = ["--profile", profile, "--pi"];
      ok(install(target, flags));
      const registry = readFileSync(join(target, "docs/skills/README.md"), "utf8");
      for (const shelf of ["common", "frontend", "java"]) {
        const installed = shelf === "common" || profile === shelf || profile === "all";
        assert.equal(existsSync(join(target, `docs/skills/${shelf}`)), installed);
        assert.match(registry, new RegExp(installed ? `### ${shelf}/ \\(installed\\)` : `### ${shelf} \\(optional`));
      }
      const declared = [...registry.matchAll(/`((?:common|frontend|java)\/[^`]+\.md)`/g)].map((m) => m[1]).sort();
      const actual = listFiles(join(target, "docs/skills")).filter((p) => /^(common|frontend|java)\//.test(p) && !p.endsWith("/README.md")).sort();
      assert.deepEqual(declared, actual);
      for (const path of listFiles(join(target, ".agents/skills")).filter((p) => !p.endsWith("README.md"))) {
        assert.equal(readFileSync(join(target, ".pi/skills", path), "utf8"), readFileSync(join(target, ".agents/skills", path), "utf8"));
      }
      assert.equal(existsSync(join(target, ".pi/skills/mission-driver")), false);
      assert.equal(existsSync(join(target, "missions")), false, "engine missions are not part of the consumer distribution");
      assert.deepEqual(inspectDrift(target).changes, []);
      const before = snapshot(target);
      ok(install(target, flags));
    assert.deepEqual(snapshot(target), before, "identical reinstall must be byte-idempotent");
  });
}

test("literal names and opt-in pi boundary; default does not touch .pi", (t) => {
  const target = temp(t);
  const name = "Cash $& $$ $` $' Co / 中文 \\";
  ok(install(target, [], root, name));
  assert.equal(existsSync(join(target, ".pi")), false);
  assert.match(readFileSync(join(target, "AGENTS.md"), "utf8"), /Cash/);
  assert.ok(readFileSync(join(target, "AGENTS.md"), "utf8").includes(name));
  assert.ok(!readFileSync(join(target, "AGENTS.md"), "utf8").includes("<project-name>"));
});

test("preserves existing scaffold, hooks, env without newline and secrets", (t) => {
  const target = temp(t);
  put(target, ".env", "TOKEN=do-not-record-secret");
  put(target, ".gitignore", "custom");
  put(target, "AGENTS.md", "custom instructions");
  put(target, ".githooks/pre-commit", "custom hook");
  const result = install(target);
  ok(result);
  assert.match(result.stdout, /CONFLICT preserved/);
  assert.equal(readFileSync(join(target, ".env"), "utf8"), "TOKEN=do-not-record-secret");
  assert.equal(readFileSync(join(target, "AGENTS.md"), "utf8"), "custom instructions");
  assert.equal(readFileSync(join(target, ".githooks/pre-commit"), "utf8"), "custom hook");
  assert.match(readFileSync(join(target, ".gitignore"), "utf8"), /^custom\n/);
  const origin = readFileSync(join(target, ORIGIN_FILE), "utf8");
  assert.ok(!origin.includes("do-not-record-secret") && !origin.includes("TOKEN") && !origin.includes(target));
  assert.ok(!Object.hasOwn(JSON.parse(origin).files, ".env"));
  assert.ok(!Object.hasOwn(JSON.parse(origin).files, "AGENTS.md"));
});

test("pi mirror derives from consumer canonical files, not a separately edited copy", (t) => {
  const target = temp(t);
  put(target, ".agents/skills/nop-git/SKILL.md", "---\nname: nop-git\ndescription: custom\n---\ncustom");
  ok(install(target, ["--pi"]));
  assert.equal(readFileSync(join(target, ".pi/skills/nop-git/SKILL.md"), "utf8"), readFileSync(join(target, ".agents/skills/nop-git/SKILL.md"), "utf8"));
  ok(install(target, ["--pi"]));
  put(target, ".agents/skills/nop-git/SKILL.md", "changed canonical");
  put(target, ".pi/skills/nop-git/SKILL.md", "changed canonical");
  const before = snapshot(target);
  const result = install(target, ["--pi"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Canonical skill drift/);
  assert.deepEqual(snapshot(target), before, "reinstall must not silently rebaseline customization");
});

test("conflicting pi mirror/registry is rejected without any target mutation", (t) => {
  for (const path of [".pi/skills/nop-git/SKILL.md", "docs/skills/README.md"]) {
    const target = temp(t);
    put(target, path, "custom mismatch");
    const before = snapshot(target);
    const result = install(target, ["--pi"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /parity conflict/);
    assert.deepEqual(snapshot(target), before);
  }
});

test("invalid CLI options fail without writing target", (t) => {
  const target = temp(t);
  for (const flags of [["--unknown"], ["--profile", "typo"], ["--profile"], ["extra"]]) {
    assert.equal(install(target, flags).status, 1);
    assert.deepEqual(readdirSync(target), []);
  }
});

test("missing required manifest source and invalid manifest fail before all target writes", (t) => {
  const source = sourceFixture(t);
  const target = temp(t);
  const manifest = readFileSync(join(source, "install-age.manifest"), "utf8");
  for (const line of ["missing-required.md", "tools/age-drift.mjs > escape :: unknown", "tools/age-drift.mjs > ../escape", "tools/age-drift.mjs > AGENTS.md", "tools/age-drift.mjs > agents.md"]) {
    put(source, "install-age.manifest", `${manifest}\n${line}\n`);
    const result = install(target, [], source);
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(readdirSync(target), []);
  }
});

test("registry/bridge source parity failures fail before writing", (t) => {
  for (const missing of ["docs/skills/common/plan-audit-prompt.md", ".pi/skills/nop-git/SKILL.md"]) {
    const source = sourceFixture(t);
    const target = temp(t);
    const lines = readFileSync(join(source, "install-age.manifest"), "utf8").split("\n");
    put(source, "install-age.manifest", lines.filter((line) => !line.includes(missing)).join("\n"));
    const result = install(target, ["--pi"], source);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /parity/);
    assert.deepEqual(readdirSync(target), []);
  }
});

test("retired engine add-on flag is rejected without writes", (t) => {
  const target = temp(t);
  const result = install(target, ["--with-mission-driver"]);
  assert.equal(result.status, 1);
  assert.deepEqual(readdirSync(target), []);
});

test("read-only drift works from installed standalone tool and never overwrites customization", (t) => {
  const target = temp(t);
  ok(install(target));
  ok(node(["tools/age-drift.mjs"], target));
  put(target, "AGENTS.md", "edited locally");
  rmSync(join(target, "docs/skills/common/plan-audit-prompt.md"));
  put(target, "business.txt", "unmanaged");
  const before = snapshot(target);
  const drift = node(["tools/age-drift.mjs"], target);
  assert.equal(drift.status, 1);
  assert.deepEqual(JSON.parse(drift.stdout).changes, [
    { path: "AGENTS.md", kind: "modified" },
    { path: "docs/skills/common/plan-audit-prompt.md", kind: "missing" },
  ]);
  assert.deepEqual(snapshot(target), before);
  assert.equal(install(target).status, 1);
  assert.deepEqual(snapshot(target), before, "repeat install must not fill missing files before reporting conflicts");
  const unknown = temp(t);
  assert.equal(node([join(target, "tools/age-drift.mjs"), unknown]).status, 2);
  assert.deepEqual(readdirSync(unknown), []);
});

test("option changes and new source origins are not an automatic updater", (t) => {
  const source = sourceFixture(t);
  const target = temp(t);
  ok(install(target, [], source));
  let before = snapshot(target);
  assert.equal(install(target, ["--profile=java"], source).status, 1);
  assert.deepEqual(snapshot(target), before);
  put(source, "template/AGENTS.md", "changed source");
  const result = install(target, [], source);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Origin source conflict/);
  assert.deepEqual(snapshot(target), before);
});

test("malformed/empty origin fails closed without writes", (t) => {
  const target = temp(t);
  put(target, ORIGIN_FILE, JSON.stringify({ schema: 1, sourceHash: "0".repeat(64), files: {} }));
  const before = snapshot(target);
  assert.equal(install(target).status, 1);
  assert.throws(() => inspectDrift(target), /Invalid AGE origin/);
  assert.deepEqual(snapshot(target), before);
});

test("installed guards resolve consumer files rather than borrowing template sibling paths", (t) => {
  const target = temp(t);
  ok(install(target));
  ok(node([join(target, "tools/check-doc-timeliness.mjs")], root));
  put(target, "docs/context/consumer-install-probe.md", "# 2026-11-17 forbidden dated heading\n");
  const timeliness = node([join(target, "tools/check-doc-timeliness.mjs")], root);
  assert.equal(timeliness.status, 1);
  assert.match(timeliness.stdout + timeliness.stderr, /consumer-install-probe.md/);
  // This installer-only path exists in the source but is not shipped. The
  // installed guard must reject it even when launched from the source cwd.
  put(target, "docs/architecture/consumer-install-probe.md", "# Probe\n`tools/install-age.mjs`\n");
  const references = node([join(target, "tools/check-doc-references.mjs")], root);
  assert.equal(references.status, 1);
  assert.match(references.stdout + references.stderr, /consumer-install-probe.md/);
  assert.match(references.stdout + references.stderr, /tools\/install-age.mjs/);
});
