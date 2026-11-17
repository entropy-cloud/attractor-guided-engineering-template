import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deliver, snapshot } from "./commit-plan.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const plan = "docs/plans/feature/plan.md";
const roadmap = "docs/roadmaps/feature-roadmap.md";
const paths = [plan, roadmap, "product.txt"];
function git(dir, ...args) {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return r.stdout.trim();
}
function put(dir, path, text) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
function fixture(t) {
  const scratch = join(root, "_tmp", "workflow-git");
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "case-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, "init", "-q");
  git(dir, "config", "user.name", "AGE fixture");
  git(dir, "config", "user.email", "fixture@invalid.test");
  git(dir, "config", "commit.gpgsign", "false");
  git(dir, "config", "core.autocrlf", "false");
  git(dir, "config", "core.hooksPath", ".githooks");
  put(dir, ".gitignore", "_tmp/\nignored.txt\n");
  put(dir, "product.txt", "before\n");
  put(dir, "unrelated.txt", "baseline\n");
  put(dir, roadmap, "# Work\n### M1 — Work\n- [ ] WI1 result\n- [ ] WI2 pending\n");
  git(dir, "add", "."); git(dir, "commit", "-qm", "fixture baseline");
  put(dir, "product.txt", "after\n");
  put(dir, plan, `---
status: active
mission: feature
work-item: M1-WI1
verify: [test]
---
# Fixture
## Phase 1 — Result
- [x] Add: behavior
## Phase 2 — Proof
- [x] Proof: test
## Draft Review Record
- dispatch review #review-run-plan-1-aabbccdd to ses_review
- 2026-11-17：iteration 1，共识 pass #review-run-plan-1-aabbccdd
## Execution
- Executor: ses_execute
## Verification
## Closure
`);
  const proof = snapshot(dir, plan, paths);
  let text = readFileSync(join(dir, plan), "utf8");
  text = text.replace("## Verification\n", `## Verification\n- payload ${proof.hash} base=${proof.base} paths=${JSON.stringify(proof.paths)}\n- pass test fixture exit=0 payload=${proof.hash}\n`);
  text += `- dispatch audit #audit-run-plan-1-aabbccdd to ses_audit\n- accepted #audit-run-plan-1-aabbccdd: accepted payload=${proof.hash} ownership=whole-files\n`;
  put(dir, plan, text);
  put(dir, roadmap, readFileSync(join(dir, roadmap), "utf8").replace("[ ] WI1", "[x] WI1"));
  return dir;
}
const commit = (dir, selected = paths) => deliver(dir, plan, selected, "feat(fixture): deliver one plan");

test("one delivery includes acceptance, preserves unrelated work and retries idempotently", (t) => {
  const dir = fixture(t);
  put(dir, "unrelated.txt", "human pending\n"); put(dir, "human-new.txt", "untracked\n");
  const before = readFileSync(join(dir, plan), "utf8");
  const result = commit(dir);
  assert.equal(result.alreadyDelivered, false);
  assert.equal(readFileSync(join(dir, plan), "utf8"), before, "no post-commit plan rewrite");
  assert.equal(git(dir, "log", "--format=%s").split("\n").length, 2);
  assert.match(git(dir, "log", "-1", "--format=%B"), new RegExp(`AGE-Plan: ${plan}`));
  assert.equal(commit(dir).alreadyDelivered, true);
  assert.equal(readFileSync(join(dir, "unrelated.txt"), "utf8"), "human pending\n");
  assert.equal(readFileSync(join(dir, "human-new.txt"), "utf8"), "untracked\n");
  put(dir, "product.txt", "post delivery change\n");
  assert.throws(() => commit(dir), /payload changed/);
});

test("payload mutation and same-file pending additions are refused without staging", (t) => {
  for (const path of ["product.txt", roadmap, plan]) {
    const dir = fixture(t);
    const beforeIndex = git(dir, "ls-files", "--stage");
    put(dir, path, readFileSync(join(dir, path), "utf8") + (path === roadmap ? "- [ ] WI3 human added audit\n" : "new unreviewed content\n"));
    assert.throws(() => commit(dir), /payload changed/);
    assert.equal(git(dir, "ls-files", "--stage"), beforeIndex);
    assert.match(readFileSync(join(dir, path), "utf8"), /new|human/);
  }
});

test("renewed proof cannot create a second delivery for changed already-delivered content", (t) => {
  const dir = fixture(t);
  commit(dir);
  put(dir, "product.txt", "different accepted content\n");
  const proof = snapshot(dir, plan, paths);
  let doc = readFileSync(join(dir, plan), "utf8");
  doc = doc.replace(/^- payload .*$/m, `- payload ${proof.hash} base=${proof.base} paths=${JSON.stringify(proof.paths)}`)
    .replace(/payload=[a-f0-9]{64}/g, `payload=${proof.hash}`);
  put(dir, plan, doc);
  assert.throws(() => commit(dir), /delivered content differs/);
  assert.equal(git(dir, "log", "--format=%s").split("\n").length, 2);
});

test("unaccepted or unverified plans cannot deliver", (t) => {
  for (const change of [(s) => s.replace("- accepted ", "- rejected "), (s) => s.replace("exit=0", "exit=1"), (s) => s.replace("- Executor: ses_execute", ""), (s) => s.replace("[x]", "[ ]")]) {
    const dir = fixture(t); put(dir, plan, change(readFileSync(join(dir, plan), "utf8")));
    assert.throws(() => commit(dir), /not delivery-ready/);
    assert.equal(git(dir, "diff", "--cached", "--name-only"), "");
  }
});

test("unrelated staged and partially staged shared files are not changed", (t) => {
  const dir = fixture(t);
  put(dir, "unrelated.txt", "staged human\n"); git(dir, "add", "unrelated.txt");
  const before = git(dir, "ls-files", "--stage");
  assert.throws(() => commit(dir), /unrelated staged/);
  assert.equal(git(dir, "ls-files", "--stage"), before);
  const mixed = fixture(t);
  git(mixed, "add", roadmap);
  put(mixed, roadmap, readFileSync(join(mixed, roadmap), "utf8") + "- [ ] WI3 investigation\n");
  const index = git(mixed, "ls-files", "--stage");
  assert.throws(() => commit(mixed), /payload changed|mixed/);
  assert.equal(git(mixed, "ls-files", "--stage"), index);
});

test("unsafe, ignored, scratch, secret and symlink paths are rejected", (t) => {
  const dir = fixture(t);
  for (const path of ["../escape", ":(glob)**", "-A", "/absolute", "_tmp/work", ".env", "key.pem", "ignored.txt"]) {
    assert.throws(() => snapshot(dir, plan, [plan, path]), /unsafe|scratch|ignored|out-of-repo/);
  }
  put(dir, "link-target.txt", "bytes");
  try { symlinkSync(join(dir, "link-target.txt"), join(dir, "link.txt")); }
  catch (e) { if (["EPERM", "EACCES"].includes(e.code)) { t.diagnostic("file symlink unavailable on this Windows account"); return; } throw e; }
  assert.throws(() => snapshot(dir, plan, [plan, "link.txt"]), /symlink/);
});

test("snapshot CLI writes no plan/roadmap content", (t) => {
  const dir = fixture(t);
  const before = paths.map((p) => readFileSync(join(dir, p)));
  const r = spawnSync(process.execPath, [join(root, "tools/commit-plan.mjs"), "--snapshot", plan, "--", ...paths], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^- payload [a-f0-9]{64} base=/);
  assert.deepEqual(paths.map((p) => readFileSync(join(dir, p))), before);
});

test("hook failure stops delivery; hook payload mutation is reported, not amended", (t) => {
  const dir = fixture(t);
  put(dir, ".githooks/pre-commit", "#!/bin/sh\nexit 1\n"); chmodSync(join(dir, ".githooks/pre-commit"), 0o755);
  const before = git(dir, "rev-parse", "HEAD");
  assert.throws(() => commit(dir), /git commit failed/);
  assert.equal(git(dir, "rev-parse", "HEAD"), before);
  assert.ok(existsSync(join(dir, plan)));
  const changed = fixture(t);
  put(changed, ".githooks/pre-commit", "#!/bin/sh\nprintf 'hook mutation\\n' >> product.txt\ngit add -- product.txt\n"); chmodSync(join(changed, ".githooks/pre-commit"), 0o755);
  assert.throws(() => commit(changed), /delivered content differs|hook changed/);
  assert.equal(git(changed, "log", "--format=%s").split("\n").length, 2, "no automatic second/amended commit");
});
